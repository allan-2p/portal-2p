/**
 * Regras de servidor das variações de proposta (2P Solar).
 *
 * Não há trigger no banco: as invariantes do grupo (uma única favorita, mesmo
 * número, sufixo único) são garantidas AQUI.
 */

import * as db from "./propostas-db.server";
import {
  grupoBloqueado,
  numeroExibicao,
  ordenarVariacoes,
  pedidoDoGrupo,
  proximoSufixo,
  statusAbertoVariacao,
  type VariacaoRow,
} from "./proposta-variacoes";

export type PropostaRow = Record<string, any> & { id: string };

/** Colunas do Salesforce que pertencem ao GRUPO (seguem a favorita). */
const VINCULO_SF = ["sf_opp_id", "sf_account_id", "sf_enviado_em"] as const;

/** Todas as linhas do grupo (a própria linha quando não há grupo). */
export async function irmasDoGrupo(row: PropostaRow): Promise<PropostaRow[]> {
  const grupo = String(row["variacao_grupo"] ?? "").trim();
  if (!grupo) return [row];
  const rows = await db.consultarPropostas(
    { variacao_grupo: `eq.${grupo}` },
    { order: "variacao_sufixo.asc.nullsfirst", limit: 60 },
  );
  return rows.length ? (rows as PropostaRow[]) : [row];
}

export async function irmasPorId(id: string): Promise<PropostaRow[]> {
  const row = await db.getProposta(id);
  if (!row) return [];
  return irmasDoGrupo(row as PropostaRow);
}

/**
 * Recusa qualquer escrita numa variação cujo grupo já tem pedido em andamento.
 * Depois do fechamento, as demais variações são somente leitura.
 */
export async function assertGrupoEditavel(row: PropostaRow, acao = "editar"): Promise<void> {
  const grupo = String(row["variacao_grupo"] ?? "").trim();
  if (!grupo) return;
  const irmas = await irmasDoGrupo(row);
  const pedido = pedidoDoGrupo(irmas as VariacaoRow[]);
  if (!pedido || pedido.id === row.id) return;
  throw new Error(
    `Este projeto já tem pedido fechado na variação ${numeroExibicao(pedido)}; as demais variações são somente leitura (não é possível ${acao}).`,
  );
}

/** A proposta é sincronizável com o Salesforce? Só a favorita (ou sem grupo). */
export function ehSincronizavel(row: PropostaRow): boolean {
  if (!String(row["variacao_grupo"] ?? "").trim()) return true;
  return row["variacao_favorita"] === true;
}

/**
 * Troca EXCLUSIVA da favorita dentro do grupo. O vínculo do Salesforce é do
 * grupo: migra para a nova favorita (nunca cria uma segunda Opportunity).
 */
export async function trocarFavorita(novaId: string): Promise<PropostaRow> {
  const nova = (await db.getProposta(novaId)) as PropostaRow | null;
  if (!nova) throw new Error("Variação não encontrada.");
  const grupo = String(nova["variacao_grupo"] ?? "").trim();
  if (!grupo) return nova;

  const irmas = await irmasDoGrupo(nova);
  if (grupoBloqueado(irmas as VariacaoRow[])) {
    const pedido = pedidoDoGrupo(irmas as VariacaoRow[])!;
    if (pedido.id !== novaId) {
      throw new Error(
        `Este projeto já tem pedido em andamento na variação ${numeroExibicao(pedido)}.`,
      );
    }
  }

  const atual = irmas.find((r) => r.id !== novaId && r["variacao_favorita"] === true) ?? null;
  const vinculo: Record<string, unknown> = {};
  if (atual) {
    for (const c of VINCULO_SF) vinculo[c] = atual[c] ?? null;
    await db.atualizarProposta(atual.id, {
      variacao_favorita: false,
      sf_opp_id: null,
      sf_account_id: null,
      sf_status: "nao_favorita",
      sf_mensagem: "Variação não favorita — o Salesforce acompanha a favorita do grupo.",
    });
  }

  const patch: Record<string, unknown> = { ...vinculo, variacao_favorita: true };
  // Reentra na fila do Salesforce: a MESMA Opportunity é atualizada com os
  // dados da nova favorita.
  patch["sf_status"] = "pendente";
  patch["sf_mensagem"] = "Na fila de envio ao Salesforce (nova favorita do grupo).";
  const atualizada = (await db.atualizarProposta(novaId, patch)) as PropostaRow | null;

  // Garante a invariante mesmo se houver mais de uma marcada por concorrência.
  for (const irma of irmas) {
    if (irma.id !== novaId && irma.id !== atual?.id && irma["variacao_favorita"] === true) {
      await db.atualizarProposta(irma.id, { variacao_favorita: false });
    }
  }
  return atualizada ?? nova;
}

/**
 * Cria uma variação a partir de uma proposta existente. A nova linha herda
 * tudo (itens, cliente, frete, forma de pagamento, observações) mas NENHUM
 * vínculo de pedido (SAP, pagamento, NF, Salesforce).
 */
const NAO_COPIAR = new Set([
  "id",
  "created_at",
  "updated_at",
  "status",
  "salvo_em",
  "status_alterado_em",
  "sf_opp_id",
  "sf_account_id",
  "sf_status",
  "sf_mensagem",
  "sf_enviado_em",
  "sap_ov_numero",
  "sap_ov_status",
  "sap_ov_mensagem",
  "sap_ov_enviado_em",
  "numero_sap",
  "nf_numero",
  "nf_serie",
  "nf_chave",
  "danfe_path",
  "boletos",
  "boletos_avisados_em",
  "fretefy_oferta_id",
  "finalizado_por",
  "finalizado_por_nome",
  "finalizado_em",
  "aguardando_pagamento_em",
  "processando_em",
  "separado_em",
  "expedido_em",
  "faturado_em",
  "coletado_em",
  "enviado_em",
  "entregue_em",
  "cancelado_em",
  "pago_em",
  "motivo_cancelamento",
  "motivo_cancelamento_obs",
  "variacao_grupo",
  "variacao_sufixo",
  "variacao_favorita",
  // Vínculos exclusivos da importação da plataforma antiga: a variação é uma
  // proposta nova do portal (projeto_antigo_id é único no banco).
  "projeto_antigo_id",
  "legado",
]);

export async function criarVariacao(
  origemId: string,
  ator: { userId: string; nome: string | null },
): Promise<{ id: string; numero: string; sufixo: string }> {
  const origem = (await db.getProposta(origemId)) as PropostaRow | null;
  if (!origem) throw new Error("Proposta não encontrada.");
  if (String(origem["organizacao"] ?? "") !== "solar") {
    throw new Error("Variações estão disponíveis apenas para propostas 2P Solar.");
  }

  const irmas = await irmasDoGrupo(origem);
  if (grupoBloqueado(irmas as VariacaoRow[])) {
    const pedido = pedidoDoGrupo(irmas as VariacaoRow[])!;
    throw new Error(
      `Este projeto já tem pedido em andamento na variação ${numeroExibicao(pedido)}; não é possível criar novas variações.`,
    );
  }
  if (irmas.some((r) => !statusAbertoVariacao(r["status"]))) {
    throw new Error('Só é possível criar variações enquanto todas as propostas do grupo estão em "Salvo".');
  }
  if (String(origem["status"] ?? "") !== "Salvo") {
    throw new Error('Só é possível criar variações de uma proposta com status "Salvo".');
  }

  const grupo = String(origem["variacao_grupo"] ?? "").trim() || origem.id;
  // Original ainda sem grupo: passa a ser a cabeça do grupo (e a favorita).
  if (!String(origem["variacao_grupo"] ?? "").trim()) {
    await db.atualizarProposta(origem.id, { variacao_grupo: grupo, variacao_favorita: true });
  }

  const sufixo = proximoSufixo(
    ordenarVariacoes(irmas as VariacaoRow[]).map((r) => r.variacao_sufixo ?? null),
  );

  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(origem)) {
    if (NAO_COPIAR.has(k) || k.startsWith("sfo_")) continue;
    payload[k] = v;
  }
  // A variação nasce no portal: não herda marcas da importação antiga.
  const totaisOrigem = (origem["totais"] ?? {}) as Record<string, unknown>;
  if (totaisOrigem && typeof totaisOrigem === "object") {
    const t = { ...totaisOrigem };
    delete t["origem"];
    delete t["numeroAnterior"];
    delete t["numero_anterior"];
    payload["totais"] = t;
  }
  payload["variacao_grupo"] = grupo;
  payload["variacao_sufixo"] = sufixo;
  payload["variacao_favorita"] = false;
  payload["status"] = "Salvo";
  payload["created_by"] = ator.userId;
  payload["criado_por_nome"] = ator.nome;
  payload["sf_status"] = "nao_favorita";
  payload["sf_mensagem"] = "Variação não favorita — o Salesforce acompanha a favorita do grupo.";

  const nova = (await db.inserirProposta(payload)) as PropostaRow;
  if (!nova?.id) throw new Error("O banco não devolveu o identificador da variação.");
  return { id: nova.id, numero: String(origem["numero"] ?? ""), sufixo };
}

/**
 * Exclusão de variação: só em "Salvo"; a favorita exige outra no lugar; grupo
 * que fica com uma única proposta volta a ser proposta simples.
 */
export async function prepararExclusaoVariacao(row: PropostaRow): Promise<void> {
  const grupo = String(row["variacao_grupo"] ?? "").trim();
  if (!grupo) return;
  const irmas = await irmasDoGrupo(row);
  if (grupoBloqueado(irmas as VariacaoRow[])) {
    const pedido = pedidoDoGrupo(irmas as VariacaoRow[])!;
    throw new Error(
      `Este projeto já tem pedido em andamento na variação ${numeroExibicao(pedido)}; as demais variações são somente leitura.`,
    );
  }
  const restantes = irmas.filter((r) => r.id !== row.id);
  if (!restantes.length) return;

  // Excluiu a favorita: a original (sem sufixo) assume; sem original, a primeira.
  if (row["variacao_favorita"] === true) {
    const nova =
      restantes.find((r) => !String(r["variacao_sufixo"] ?? "").trim()) ??
      ordenarVariacoes(restantes as VariacaoRow[])[0]!;
    await db.atualizarProposta(nova.id, {
      variacao_favorita: true,
      sf_opp_id: row["sf_opp_id"] ?? null,
      sf_account_id: row["sf_account_id"] ?? null,
      sf_status: "pendente",
      sf_mensagem: "Na fila de envio ao Salesforce (nova favorita do grupo).",
    });
  }

  // Sobrou uma só: volta a ser proposta simples.
  if (restantes.length === 1) {
    await db.atualizarProposta(restantes[0]!.id, {
      variacao_grupo: null,
      variacao_sufixo: null,
      variacao_favorita: true,
    });
  }
}

/**
 * Promove a variação escolhida na conclusão a favorita e bloqueia o grupo se
 * outra irmã já virou pedido.
 */
export async function assertPodeConcluirVariacao(row: PropostaRow): Promise<void> {
  const grupo = String(row["variacao_grupo"] ?? "").trim();
  if (!grupo) return;
  const irmas = await irmasDoGrupo(row);
  const pedido = pedidoDoGrupo(irmas as VariacaoRow[]);
  if (pedido && pedido.id !== row.id) {
    throw new Error(`Este projeto já tem pedido em andamento na variação ${numeroExibicao(pedido)}.`);
  }
  if (row["variacao_favorita"] !== true) await trocarFavorita(row.id);
}
