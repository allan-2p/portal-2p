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
 * Processa a fila: propostas com `sf_status` pendente/erro, mais antigas
 * primeiro. Sequencial para respeitar os limites da API do Salesforce.
 */
export async function processarFilaSalesforce(limite = 25): Promise<FilaSalesforceResultado> {
  // O filtro roda NO BANCO: varrer as primeiras N linhas e filtrar em memória
  // deixava as pendentes recentes de fora (a tabela tem dezenas de milhares
  // de propostas) e a fila nunca esvaziava.
  const pendentes = await db.consultarPropostas(
    { sf_status: "in.(pendente,erro)" },
    {
      select: "id,numero,sf_status,sf_opp_id,created_at",
      order: "created_at.asc",
      limit: Math.max(1, limite),
    },
  );

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
