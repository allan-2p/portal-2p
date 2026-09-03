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

/** Marca de água usada pelo backfill em massa (`sf_mensagem`). */
export const MARCA_BACKFILL = "(backfill)";

/**
 * A fila tem três faixas, nesta ordem de prioridade:
 *
 * 1. **vinculadas** — oportunidades já existentes: atualizações operacionais
 *    (compra, SAP, NF, perda, cancelamento).
 * 2. **novas** — pedidos criados no portal e ainda sem oportunidade.
 * 3. **backfill** — importação histórica (milhares de registros de 2022 em
 *    diante), que só usa as vagas que sobram.
 *
 * Sem a faixa 2 separada, um pedido fechado hoje entrava na mesma fila do
 * backfill ordenada por `created_at` crescente e ficava atrás de mais de mil
 * registros antigos — na prática nunca chegava ao CRM.
 */
export function cotasFilaSalesforce(limite: number) {
  const total = Math.max(1, Math.floor(limite));
  if (total === 1) return { vinculadas: 1, novas: 0, backfill: 0 };
  if (total === 2) return { vinculadas: 1, novas: 1, backfill: 0 };
  const vinculadas = Math.max(1, Math.round(total * 0.5));
  const novas = Math.max(1, Math.round(total * 0.35));
  return { vinculadas, novas, backfill: Math.max(0, total - vinculadas - novas) };
}

/**
 * Processa a fila: propostas com `sf_status` pendente/erro. Sequencial para
 * respeitar os limites da API do Salesforce.
 *
 * Dentro de cada faixa, `pendente` vem antes de `erro`: erros de regra de
 * negócio da org (ex.: pedido cancelado sem motivo) nunca passam sozinhos e,
 * como cada tentativa mexe em `updated_at`, voltavam ao topo e monopolizavam
 * as vagas das execuções seguintes.
 */
export async function processarFilaSalesforce(limite = 25): Promise<FilaSalesforceResultado> {
  const total = Math.max(1, Math.floor(limite));
  const cotas = cotasFilaSalesforce(total);
  const select = "id,numero,sf_status,sf_opp_id,created_at,updated_at";
  // `not.like` devolve NULL (e a linha some) quando a mensagem é nula: por
  // isso o `or` com `is.null`.
  const SEM_BACKFILL = "(sf_mensagem.is.null,sf_mensagem.not.like.*backfill*)";
  const COM_BACKFILL = "like.*backfill*";

  /** Busca uma faixa priorizando `pendente` e completando com `erro`. */
  async function faixa(filtros: Record<string, string>, order: string, vagas: number) {
    if (vagas <= 0) return [];
    const pend = await db.consultarPropostas(
      { ...filtros, sf_status: "eq.pendente" },
      { select, order, limit: vagas },
    );
    if (pend.length >= vagas) return pend;
    const erro = await db.consultarPropostas(
      { ...filtros, sf_status: "eq.erro" },
      { select, order, limit: vagas - pend.length },
    );
    return [...pend, ...erro];
  }

  const vinculadas = await faixa(
    { sf_opp_id: "not.is.null" },
    "updated_at.desc.nullslast",
    cotas.vinculadas,
  );
  const novas = await faixa(
    { sf_opp_id: "is.null", or: SEM_BACKFILL },
    "created_at.desc",
    cotas.novas + (cotas.vinculadas - vinculadas.length),
  );
  const backfill = await faixa(
    { sf_opp_id: "is.null", sf_mensagem: COM_BACKFILL },
    "created_at.asc",
    total - vinculadas.length - novas.length,
  );
  const pendentes = [...vinculadas, ...novas, ...backfill].slice(0, total);


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
