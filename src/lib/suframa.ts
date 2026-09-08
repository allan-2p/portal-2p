/**
 * Fonte ÚNICA de verdade para "venda para a Zona Franca de Manaus" (SUFRAMA).
 *
 * Regra: o benefício vale quando o cliente tem inscrição SUFRAMA **e** ela está
 * APROVADA na consulta pública do CNPJ (CNPJá/Suframa). Inscrição bloqueada,
 * suspensa ou com qualquer impedimento ⇒ proposta normal, com todos os
 * impostos. CPF nunca tem SUFRAMA.
 *
 * Quando o benefício vale:
 *   - PIS e COFINS não incidem;
 *   - IPI isento;
 *   - ICMS 4% nos materiais IMPORTADOS e isento nos NACIONAIS.
 *
 * O item é considerado importado quando a alíquota "normal" de ICMS da operação
 * é 4% (Resolução 13/2012) — é o mesmo dado que a simulação oficial do SAP
 * devolve por item e que o NCM do cadastro guarda nos Carregadores.
 */

export type FonteSuframa = {
  suframa?: unknown;
  suframa_situacao?: unknown;
  doc?: unknown;
};

/** ICMS devido na venda SUFRAMA para material importado. */
export const ICMS_SUFRAMA_IMPORTADO = 0.04;

const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

const semAcento = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/** Número da inscrição SUFRAMA (só dígitos) ou string vazia. */
export function numeroSuframa(f: FonteSuframa | null | undefined): string {
  return digitos(f?.suframa);
}

/** Situação textual da inscrição, como veio da consulta. */
export function situacaoSuframa(f: FonteSuframa | null | undefined): string {
  return String(f?.suframa_situacao ?? "").trim();
}

/** A situação informada indica inscrição regular/ativa? */
export function situacaoSuframaAprovada(situacao: unknown): boolean {
  const s = semAcento(situacao);
  if (!s) return false;
  if (/^(nao|sem|nunca)\b/.test(s)) return false;
  if (/(bloque|suspens|cancel|inativ|irregular|baixad|indeferid|vencid|pendente|impedi)/.test(s))
    return false;
  return /(aprovad|ativ|regular|habilitad|deferid|vigente)/.test(s);
}

export type StatusSuframa = "aprovado" | "bloqueado" | "sem";

/**
 * Situação do SUFRAMA para a proposta:
 *  - `aprovado`  → venda para a Zona Franca de Manaus (com benefício);
 *  - `bloqueado` → tem inscrição, mas com impedimento (venda normal);
 *  - `sem`       → não tem inscrição (venda normal, sem destaque).
 */
export function statusSuframa(f: FonteSuframa | null | undefined): StatusSuframa {
  if (!f) return "sem";
  if (digitos(f.doc).length === 11) return "sem"; // CPF nunca tem SUFRAMA
  const numero = numeroSuframa(f);
  if (!numero) return "sem";
  return situacaoSuframaAprovada(f.suframa_situacao) ? "aprovado" : "bloqueado";
}

/** Atalho: a proposta pode usar o benefício da Zona Franca? */
export function suframaAprovado(f: FonteSuframa | null | undefined): boolean {
  return statusSuframa(f) === "aprovado";
}

/** Material importado? (alíquota normal de ICMS em 4% — Resolução 13/2012). */
export function itemImportadoPorIcms(icms: number | null | undefined): boolean {
  const v = Number(icms);
  return Number.isFinite(v) && Math.abs(v - ICMS_SUFRAMA_IMPORTADO) < 1e-6;
}

export type AliquotasFiscais = {
  ipi: number | null;
  icms: number | null;
  pisCofins: number | null;
};

/**
 * Alíquotas efetivas de um item na venda SUFRAMA: sem IPI e sem PIS/COFINS.
 * O ICMS da operação é mantido (4% nos importados, alíquota interestadual nos
 * nacionais) — é assim que a planilha oficial monta o preço.
 */
export function aliquotasSuframa<T extends AliquotasFiscais>(aliq: T): T {
  return { ...aliq, ipi: 0, pisCofins: 0 };
}

/**
 * Preço unitário na venda SUFRAMA: parte do valor líquido do SAP e recompõe
 * apenas o ICMS "por dentro" (líquido ÷ (1 − ICMS)), arredondado a centavos.
 */
export function precoUnitarioSuframa(liquidoUnitario: number, icms: number | null | undefined): number {
  const a = Number(icms);
  const aliq = Number.isFinite(a) && a > 0 && a < 1 ? a : 0;
  const v = Number(liquidoUnitario) || 0;
  return Math.round((v / (1 - aliq)) * 100) / 100;
}


/** Rótulo curto usado em telas, resumo e PDF. */
export const SUFRAMA_LABEL = "Venda SUFRAMA — Zona Franca de Manaus";

/** Resumo dos benefícios, em uma linha. */
export const SUFRAMA_BENEFICIOS =
  "Sem PIS/COFINS, sem IPI, ICMS 4% nos materiais importados e isento nos nacionais.";
