import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SimulacaoPixInput = {
  /** Payload bruto do webhook (JSON). */
  payload: string;
  /** Quantas vezes o mesmo payload deve ser reprocessado (1-20). */
  repeticoes?: number;
};

/**
 * Modo simulação (dry-run) do webhook Pix: reprocessa o mesmo payload N vezes
 * sobre uma cópia em memória dos pedidos e reporta se houve atualização
 * duplicada. Nada é gravado no banco.
 */
export const simularWebhookPixFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SimulacaoPixInput) => input)
  .handler(async ({ data, context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context as any, "admin.logs.jobs", "visualizar");

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(data.payload) as Record<string, unknown>;
    } catch {
      throw new Error("Payload inválido: informe um JSON válido.");
    }

    const { normalizarEventosPix, simularWebhookPix } = await import("@/lib/pagamentos-pix.server");
    const eventos = normalizarEventosPix(payload);
    if (!eventos.length) throw new Error("Payload sem eventos Pix reconhecíveis.");

    const txids = [...new Set(eventos.map((e) => e.txid))];
    const numeros = txids.map((t) => (t.match(/\d{6}/) ?? [])[0]).filter(Boolean) as string[];

    const db = await import("@/lib/propostas-db.server");
    const encontrados: Record<string, any>[] = [];
    const vistos = new Set<string>();
    for (const txid of txids) {
      const porTxid = await db.listarPropostasPorPagamentoTxid(txid);
      if (porTxid && !vistos.has(porTxid.id)) {
        vistos.add(porTxid.id);
        encontrados.push(porTxid);
      }
    }
    for (const numero of numeros) {
      const row = await db.getPropostaPorNumero(numero);
      if (row && !vistos.has(row.id)) {
        vistos.add(row.id);
        encontrados.push(row);
      }
    }

    const simulacao = await simularWebhookPix(payload, encontrados, data.repeticoes ?? 3);
    return {
      eventos: eventos.map((e) => ({ txid: e.txid, tipo: e.tipo, statusOriginal: e.statusOriginal })),
      pedidosEncontrados: encontrados.length,
      ...simulacao,
    };
  });
