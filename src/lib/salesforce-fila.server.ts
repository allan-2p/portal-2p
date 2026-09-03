/**
 * Fila do Salesforce.
 *
 * Salvar e concluir uma proposta NÃO espera mais o Salesforce responder: o
 * espelhamento é marcado como pendente (`sf_status = 'pendente'`) e um cron
 * processa a fila em segundo plano. Isso tira uma chamada externa (300 ms a
 * vários segundos) do caminho crítico do vendedor sem perder nada — as falhas
 * continuam visíveis em `sf_status`/`sf_mensagem` e no painel de integrações.
 */
import * as db from "./propostas-db.server";

/** Marca a proposta para envio ao Salesforce em segundo plano. Nunca lança. */
export async function enfileirarSalesforce(propostaId: string): Promise<void> {
  try {
    await db.atualizarProposta(propostaId, {
      sf_status: "pendente",
      sf_mensagem: "Na fila de envio ao Salesforce.",
    });
  } catch {
    /* coluna ausente ou indisponível: o lote de backfill ainda cobre o caso */
  }
}

/** Campos que o salvamento pode embutir no próprio insert/update (custo zero). */
export const PATCH_SALESFORCE_PENDENTE = {
  sf_status: "pendente",
  sf_mensagem: "Na fila de envio ao Salesforce.",
} as const;

export type FilaSalesforceResultado = {
  total: number;
  sincronizados: number;
  falhas: number;
  detalhes: { id: string; numero: string | null; ok: boolean; mensagem: string | null }[];
};

/**
 * Reserva a maior parte de cada execução para oportunidades já vinculadas.
 * Essas linhas representam atualizações operacionais (compra, SAP, NF,
 * cancelamento) e não podem esperar atrás de um backfill de milhares de novas
 * oportunidades. Uma cota menor continua drenando os registros ainda sem
 * vínculo, evitando starvation do backfill.
 */
export function cotasFilaSalesforce(limite: number) {
  const total = Math.max(1, Math.floor(limite));
  if (total === 1) return { vinculadas: 1, novas: 0 };
  const vinculadas = Math.max(1, Math.ceil(total * 0.8));
  return { vinculadas, novas: total - vinculadas };
}

/**
 * Processa a fila: propostas com `sf_status` pendente/erro, mais antigas
 * primeiro. Sequencial para respeitar os limites da API do Salesforce.
 */
export async function processarFilaSalesforce(limite = 25): Promise<FilaSalesforceResultado> {
  const total = Math.max(1, Math.floor(limite));
  const cotas = cotasFilaSalesforce(total);
  const select = "id,numero,sf_status,sf_opp_id,created_at,updated_at";

  // Atualizações de oportunidades existentes primeiro, da mais recente para a
  // mais antiga. Antes tudo era ordenado por created_at: um cancelamento de um
  // pedido antigo voltava ao fim de um backfill com milhares de registros.
  const vinculadas = await db.consultarPropostas(
    { sf_status: "in.(pendente,erro)", sf_opp_id: "not.is.null" },
    { select, order: "updated_at.desc.nullslast", limit: cotas.vinculadas },
  );
  const vagasNovas = Math.max(cotas.novas, total - vinculadas.length);
  const novas = vagasNovas
    ? await db.consultarPropostas(
        { sf_status: "in.(pendente,erro)", sf_opp_id: "is.null" },
        { select, order: "created_at.asc", limit: vagasNovas },
      )
    : [];
  const pendentes = [...vinculadas, ...novas].slice(0, total);

  const { sincronizarPedidoSalesforceSeguro } = await import("./salesforce-pedidos.server");
  const detalhes: FilaSalesforceResultado["detalhes"] = [];
  let sincronizados = 0;
  for (const row of pendentes) {
    const id = String((row as any)["id"] ?? "");
    if (!id) continue;
    const r = await sincronizarPedidoSalesforceSeguro(id);
    if (r.ok) sincronizados += 1;
    detalhes.push({
      id,
      numero: ((row as any)["numero"] as string) ?? null,
      ok: r.ok,
      mensagem: r.mensagem,
    });
  }
  return {
    total: pendentes.length,
    sincronizados,
    falhas: pendentes.length - sincronizados,
    detalhes,
  };
}
