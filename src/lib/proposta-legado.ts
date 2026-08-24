/**
 * Convivência entre propostas importadas e propostas novas.
 *
 * Faixas de `numero` (inteiro puro, sem zeros à esquerda, é o próprio NROPED do SAP):
 * - 10001–53059 → importadas da plataforma antiga (`totais.origem = 'plataforma_antiga'`),
 *   com número herdado do SAP;
 * - 60001+      → propostas nativas do portal (as 26 originais viraram 60001–60026;
 *   o número original ficou em `totais.numeroAnterior`).
 *
 * Importadas são cidadãs de primeira classe: mesmo ciclo de status, mesmo cron
 * (sempre pela ordem de venda) e os mesmos botões de NF/DANFE. O que nunca vale
 * para elas quando já têm OV: reenviar a ordem, recalcular preços ou emitir
 * cobrança de pedido antigo já faturado.
 */

/** Faixa de números vindos da plataforma antiga (já existentes no SAP). */
export const NUMERO_LEGADO_MIN = 10001;
export const NUMERO_LEGADO_MAX = 53059;
/** Primeiro número da faixa nativa do portal. */
export const NUMERO_NOVO_MIN = 60001;

const texto = (v: unknown): string => String(v ?? "").trim();

function totais(p: Record<string, any> | null | undefined): Record<string, any> {
  const t = p?.["totais"];
  return t && typeof t === "object" ? (t as Record<string, any>) : {};
}

/** Nº da proposta como inteiro (0 quando ausente/inválido). */
export function numeroProposta(p: Record<string, any> | null | undefined): number {
  return Number(texto(p?.["numero"]).replace(/\D/g, "")) || 0;
}

/** Nº anterior (antes da renumeração), sem zeros à esquerda. */
export function numeroAnterior(p: Record<string, any> | null | undefined): string {
  const v = texto(totais(p)["numeroAnterior"] ?? totais(p)["numero_anterior"]);
  return v.replace(/^0+(?=\d)/, "");
}

/** Origem registrada na migração (ex.: 'plataforma_antiga'). */
export function origemProposta(p: Record<string, any> | null | undefined): string {
  return texto(totais(p)["origem"]);
}

/** Proposta veio da plataforma antiga? */
export function ehPlataformaAntiga(p: Record<string, any> | null | undefined): boolean {
  if (origemProposta(p) === "plataforma_antiga") return true;
  const n = numeroProposta(p);
  return n >= NUMERO_LEGADO_MIN && n <= NUMERO_LEGADO_MAX;
}

/** Ordem de venda gravada na proposta (SAP). */
export function ovDaProposta(p: Record<string, any> | null | undefined): string {
  return texto(p?.["sap_ov_numero"]) || texto(p?.["numero_sap"]);
}

/**
 * Importada que já virou pedido no SAP: não reenviar OV, não recalcular preço,
 * não emitir cobrança nova. Importada sem OV (orçamento "Salvo") segue o fluxo
 * normal do portal, mantendo o número que já tem.
 */
export function bloqueiaReenvioSap(p: Record<string, any> | null | undefined): boolean {
  return ehPlataformaAntiga(p) && Boolean(ovDaProposta(p));
}

/** Alias semântico: cobrança nova é proibida para pedido antigo já faturado. */
export const bloqueiaCobranca = bloqueiaReenvioSap;

/** Conteúdo bruto de `propostas.legado` (detalhes técnicos da plataforma antiga). */
export function dadosLegado(p: Record<string, any> | null | undefined): Record<string, any> | null {
  const l = p?.["legado"];
  if (!l) return null;
  if (typeof l === "string") {
    try {
      const parsed = JSON.parse(l);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof l === "object" ? (l as Record<string, any>) : null;
}

export type PagamentoLegado = {
  descricao: string;
  valor: number | null;
  data: string;
  status: string;
  documento: string;
};

/** Histórico de cobranças da plataforma antiga (`legado.satelites.pagamentos`). */
export function pagamentosLegado(p: Record<string, any> | null | undefined): PagamentoLegado[] {
  const l = dadosLegado(p);
  const lista = (l?.["satelites"] as Record<string, any> | undefined)?.["pagamentos"];
  if (!Array.isArray(lista)) return [];
  return lista.map((x: any) => {
    const num = Number(x?.valor ?? x?.valor_pago ?? x?.total ?? NaN);
    return {
      descricao: texto(x?.descricao ?? x?.forma ?? x?.tipo ?? x?.meio ?? "Pagamento"),
      valor: Number.isFinite(num) ? num : null,
      data: texto(x?.data ?? x?.data_pagamento ?? x?.vencimento ?? x?.created_at),
      status: texto(x?.status ?? x?.situacao),
      documento: texto(x?.documento ?? x?.nosso_numero ?? x?.identificador ?? x?.id),
    };
  });
}
