/**
 * Pedidos "presos" no SAP.
 *
 * Um pedido com ordem de venda criada que fica dias em "Aguardando Pagamento"
 * ou "Processando" sem nenhum avanço é sinal de retenção no ERP (pagamento,
 * crédito), pedido morto, ou consulta falhando. Esta tela lista esses casos e
 * mostra o último desfecho registrado pelo cron (`cron.sap-nfs`), separando
 * "o SAP ainda não devolveu progresso" de "a consulta está falhando".
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PedidoPreso = {
  id: string;
  numero: string | null;
  cliente: string | null;
  status: string | null;
  ov: string | null;
  desde: string | null;
  diasParado: number;
  /** Último evento do cron para o pedido: avancou | consulta-vazia | consulta-erro… */
  ultimoEvento: string | null;
  ultimaMensagem: string | null;
  ultimaConsulta: string | null;
};

async function assertJobs(ctx: { supabase: any; userId: string }) {
  const { requireAdminFeature } = await import("@/lib/guards.server");
  await requireAdminFeature(ctx, "admin.logs.jobs", "visualizar");
}

const dias = (iso: string | null) =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : 0;

export const pedidosPresosSap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { dias?: number }) => ({
    dias: Math.min(Math.max(Number(input?.dias ?? 1) || 1, 1), 60),
  }))
  .handler(async ({ data, context }) => {
    await assertJobs(context);

    const corte = new Date(Date.now() - data.dias * 86_400_000).toISOString();
    const { grupo2pRest } = await import("@/lib/grupo2p-db.server");
    const params = new URLSearchParams({
      select:
        "id,numero,cliente_nome,status,sap_ov_numero,sap_ov_enviado_em,aguardando_pagamento_em,processando_em,created_at",
      sap_ov_numero: "not.is.null",
      status: 'in.("Aguardando Pagamento","Processando")',
      created_at: `lte.${corte}`,
      order: "created_at.asc",
      limit: "300",
    });
    const res = await grupo2pRest(`propostas?${params.toString()}`);
    if (!res.ok) throw new Error(`Falha ao ler pedidos parados (${res.status}).`);
    const linhas = JSON.parse(res.text || "[]") as Array<Record<string, unknown>>;

    const pedidos: PedidoPreso[] = linhas
      .map((r) => {
        const desde =
          (r["processando_em"] as string | null) ??
          (r["aguardando_pagamento_em"] as string | null) ??
          (r["sap_ov_enviado_em"] as string | null) ??
          (r["created_at"] as string | null) ??
          null;
        return {
          id: String(r["id"]),
          numero: r["numero"] == null ? null : String(r["numero"]),
          cliente: r["cliente_nome"] == null ? null : String(r["cliente_nome"]),
          status: r["status"] == null ? null : String(r["status"]),
          ov: r["sap_ov_numero"] == null ? null : String(r["sap_ov_numero"]),
          desde,
          diasParado: dias(desde),
          ultimoEvento: null as string | null,
          ultimaMensagem: null as string | null,
          ultimaConsulta: null as string | null,
        };
      })
      .filter((p) => p.diasParado >= data.dias)
      .sort((a, b) => b.diasParado - a.diasParado);

    // Último desfecho do cron por pedido (o log fica no banco do portal).
    const { data: logs } = await context.supabase
      .from("integration_logs")
      .select("event, message, detail, created_at")
      .eq("slug", "cron.sap-nfs")
      .order("created_at", { ascending: false })
      .limit(2000);

    const porProposta = new Map<string, { event: string; message: string | null; created_at: string }>();
    for (const l of (logs ?? []) as Array<Record<string, any>>) {
      const pid = String(l["detail"]?.["proposta_id"] ?? "");
      if (!pid || porProposta.has(pid)) continue;
      porProposta.set(pid, {
        event: String(l["event"] ?? ""),
        message: l["message"] == null ? null : String(l["message"]),
        created_at: String(l["created_at"] ?? ""),
      });
    }
    for (const p of pedidos) {
      const l = porProposta.get(p.id);
      if (!l) continue;
      p.ultimoEvento = l.event;
      p.ultimaMensagem = l.message;
      p.ultimaConsulta = l.created_at;
    }

    return {
      dias: data.dias,
      total: pedidos.length,
      comErro: pedidos.filter((p) => p.ultimoEvento === "consulta-erro").length,
      semSinal: pedidos.filter((p) => p.ultimoEvento === "consulta-vazia").length,
      pedidos: pedidos.slice(0, 200),
    };
  });
