/**
 * Variações da mesma proposta (2P Solar).
 *
 * Um mesmo projeto pode ter alternativas ("variações") para o mesmo cliente:
 * todas compartilham o MESMO `numero` (que é o NROPED do SAP) e diferem apenas
 * pelo sufixo de exibição (`60123`, `60123-B`, `60123-C`…).
 *
 * Exatamente UMA variação do grupo é a favorita: é a que aparece na listagem,
 * conta nas métricas e é a única espelhada no Salesforce.
 */

import { formatPropostaNumero } from "@/lib/sap-numero";

export type VariacaoRow = {
  id: string;
  numero?: string | null;
  nome?: string | null;
  status?: string | null;
  variacao_grupo?: string | null;
  variacao_sufixo?: string | null;
  variacao_favorita?: boolean | null;
  totais?: Record<string, any> | null;
  itens?: any[] | null;
  forma_pagamento?: string | null;
  updated_at?: string | null;
};

/** Sufixos possíveis: a original não tem sufixo, as demais vão de B em diante. */
export const SUFIXOS_VARIACAO = "BCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Número exibido em telas, PDFs, e-mails e observações (com sufixo). */
export function numeroExibicao(row: VariacaoRow | null | undefined): string {
  const numero = formatPropostaNumero(row?.numero);
  const sufixo = String(row?.variacao_sufixo ?? "").trim().toUpperCase();
  if (!numero) return sufixo ? `-${sufixo}` : "";
  return sufixo ? `${numero}-${sufixo}` : numero;
}

/** Próximo sufixo livre do grupo (B, C, D…). */
export function proximoSufixo(usados: Array<string | null | undefined>): string {
  const ocupados = new Set(
    usados.map((s) => String(s ?? "").trim().toUpperCase()).filter(Boolean),
  );
  const livre = SUFIXOS_VARIACAO.find((s) => !ocupados.has(s));
  if (!livre) throw new Error("Limite de variações atingido para esta proposta.");
  return livre;
}

/** "60123-B" digitado na busca → { numero: "60123", sufixo: "B" }. */
export function separarNumeroSufixo(texto: string): { numero: string; sufixo: string | null } {
  const t = String(texto ?? "").trim().toUpperCase();
  const m = /^(\d+)\s*-\s*([A-Z])$/.exec(t);
  if (!m) return { numero: t, sufixo: null };
  return { numero: m[1]!, sufixo: m[2]! };
}

/** Status que ainda deixam o grupo aberto (sem pedido em andamento). */
export function statusAbertoVariacao(status: unknown): boolean {
  const s = String(status ?? "").trim();
  return s === "" || s === "Salvo" || s === "Cancelado";
}

/** Primeira variação do grupo que já virou pedido (status ≠ Salvo/Cancelado). */
export function pedidoDoGrupo<T extends VariacaoRow>(irmas: T[]): T | null {
  return irmas.find((r) => !statusAbertoVariacao(r.status)) ?? null;
}

/** O grupo já tem pedido fechado: as demais variações ficam somente leitura. */
export function grupoBloqueado(irmas: VariacaoRow[]): boolean {
  return !!pedidoDoGrupo(irmas);
}

/** Ordena: original primeiro, depois pelos sufixos. */
export function ordenarVariacoes<T extends VariacaoRow>(irmas: T[]): T[] {
  return [...irmas].sort((a, b) =>
    String(a.variacao_sufixo ?? "").localeCompare(String(b.variacao_sufixo ?? "")),
  );
}

/** Resumo curto dos itens ("2x Módulo + 1x Inversor"). */
export function resumoItens(row: VariacaoRow | null | undefined, max = 3): string {
  const itens = Array.isArray(row?.itens) ? (row?.itens as any[]) : [];
  if (!itens.length) return "Sem itens";
  const partes = itens
    .slice(0, max)
    .map((i) => `${Number(i?.qtd ?? 0)}x ${String(i?.nome ?? i?.codigo ?? "item").slice(0, 28)}`);
  const resto = itens.length - partes.length;
  return partes.join(" + ") + (resto > 0 ? ` + ${resto} item(ns)` : "");
}
