/**
 * Reconsulta Pix (fallback do webhook).
 *
 * O webhook do Itaú é a via principal de baixa; se ele falhar ou atrasar, este
 * job consulta a cobrança (`GET /cob/{txid}`) de todos os pedidos com Pix
 * pendente e reaplica o evento pelo mesmo motor idempotente do webhook.
 */

import { ItauIndisponivel, chamarItau, credenciaisPix } from "./itau-api.server";
import { aplicarEventoPix, normalizarEventosPix, type PixAplicacao } from "./pagamentos-pix.server";

export type PixReconsultaResultado = {
  pendentes: number;
  consultados: number;
  atualizados: number;
  detalhes: PixAplicacao[];
  skipped?: boolean;
  motivo?: string;
};

/**
 * @param minutos idade mínima (em minutos) da cobrança para ser reconsultada —
 *                evita brigar com o webhook que acabou de chegar.
 */
export async function reconsultarPixPendentes(minutos = 15): Promise<PixReconsultaResultado> {
  const cred = credenciaisPix();
  if (!cred) {
    return { pendentes: 0, consultados: 0, atualizados: 0, detalhes: [], skipped: true, motivo: "Credenciais Pix não configuradas." };
  }

  const { consultarPropostas } = await import("./propostas-db.server");
  const corte = new Date(Date.now() - minutos * 60_000).toISOString();

  const pendentes = await consultarPropostas(
    {
      pagamento_meio: "eq.pix",
      pagamento_status: "eq.pendente",
      pagamento_txid: "not.is.null",
      pagamento_atualizado_em: `lt.${corte}`,
    },
    {
      select: "id, numero, pagamento_txid, pagamento_atualizado_em",
      order: "pagamento_atualizado_em.asc",
      limit: 50,
    },
  );

  const detalhes: PixAplicacao[] = [];
  let consultados = 0;
  let atualizados = 0;

  for (const row of pendentes) {
    const txid = String((row as any).pagamento_txid ?? "").trim();
    if (!txid) continue;
    try {
      const resp = await chamarItau({
        escopo: "pix",
        cred,
        metodo: "GET",
        caminho: `/cob/${txid}`,
        correlationId: `pix-reconsulta-${txid}`.slice(0, 64),
      });
      consultados++;
      for (const ev of normalizarEventosPix(resp)) {
        const r = await aplicarEventoPix(ev);
        detalhes.push(r);
        if (!r.skipped) atualizados++;
      }
    } catch (e) {
      if (e instanceof ItauIndisponivel) {
        // Instabilidade do Itaú: encerra a rodada, o próximo cron tenta de novo.
        return {
          pendentes: pendentes.length,
          consultados,
          atualizados,
          detalhes,
          motivo: `Itaú indisponível: ${(e as Error).message}`,
        };
      }
      detalhes.push({ txid, tipo: "desconhecido", skipped: true, motivo: (e as Error).message });
    }
  }

  return { pendentes: pendentes.length, consultados, atualizados, detalhes };
}
