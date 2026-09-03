/**
 * Conversão do preço de venda dos Carregadores para o valor líquido enviado ao
 * SAP (VALOR_PROD), com precisão de 6 casas decimais em TODOS os intermediários.
 *
 * O vendedor digita o preço FINAL do item (T, com todos os impostos). A conta é:
 *
 *   precoSemIpi = T / (1 + aliqIPI)
 *   ICMS        = precoSemIpi × aliqICMS
 *   PIS/COFINS  = (precoSemIpi − ICMS) × aliqPISCOFINS
 *   VALOR_PROD  = precoSemIpi − ICMS − PIS/COFINS
 *
 * Regra de ouro: nenhum intermediário (sem IPI, IPI, ICMS, PIS/COFINS) pode ser
 * arredondado a 2 casas. Só o resultado final por item vai a 2 casas — limite do
 * campo VALOR_PROD no SAP.
 */

/** Arredondamento padrão de intermediários: 6 casas decimais. */
export const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;

/** Arredondamento final (exibição/cobrança/SAP): 2 casas. */
export const r2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * Fator histórico calibrado empiricamente com o SAP (QAS 0000010462/0000010464,
 * 24/08/2026) para ICMS 4%. APOSENTADO em 03/09/2026: o líquido passou a sair da
 * fórmula fiscal (base do PIS/COFINS = sem IPI − ICMS). Mantido apenas como
 * referência histórica — não usar em cálculo.
 * @deprecated
 */
export const FATOR_LIQUIDO_SAP_ICMS4 = 0.870722;

export type AliquotasCarregadores = {
  /** IPI, por fora (ex.: 0.05). Vem do NCM do cadastro do produto. */
  ipi: number;
  /** ICMS da operação (ex.: 0.04). */
  icms: number;
  /** PIS + COFINS somados (ex.: 0.0925). */
  pisCofins: number;
};

export type DecomposicaoCarregadores = {
  /** Valor bruto de entrada (preço com impostos, T). */
  bruto: number;
  /** Valor sem IPI (T / (1 + IPI)). */
  semIpi: number;
  ipi: number;
  icms: number;
  pisCofins: number;
  /** Valor líquido, sem nenhum imposto — é o que vai no VALOR_PROD. */
  liquido: number;
  /** liquido / bruto. */
  fator: number;
};

/** Preço sem IPI, em 6 casas. */
export function precoSemIpi(bruto: number, aliqIpi: number): number {
  return r6(r6(bruto || 0) / (1 + (aliqIpi || 0)));
}

/**
 * VALOR_PROD unitário (ou por linha, conforme o valor passado) enviado ao SAP.
 * Intermediários em 6 casas; resultado final em 2 casas.
 */
export function valorProdCarregadores(bruto: number, aliq: AliquotasCarregadores): number {
  return r2(decomporPrecoCarregadores(bruto, aliq).liquido);
}

/** Fator líquido (liquido ÷ bruto) apenas em função das alíquotas. */
export function fatorLiquidoCarregadores(aliq: AliquotasCarregadores): number {
  const semIpi = r6(1 / (1 + (aliq.ipi || 0)));
  const icms = r6(semIpi * (aliq.icms || 0));
  const pisCofins = r6(r6(semIpi - icms) * (aliq.pisCofins || 0));
  return r6(semIpi - icms - pisCofins);
}

/**
 * Decompõe o preço COM impostos nas parcelas exibidas na proposta
 * (líquido, ICMS, PIS/COFINS, IPI), derivadas da MESMA conta do VALOR_PROD:
 * ICMS por dentro do valor sem IPI e PIS/COFINS sobre (sem IPI − ICMS).
 */
export function decomporPrecoCarregadores(
  bruto: number,
  aliq: AliquotasCarregadores,
): DecomposicaoCarregadores {
  const valor = r6(bruto || 0);
  const semIpi = precoSemIpi(valor, aliq.ipi);
  const ipi = r6(valor - semIpi);

  const icms = r6(semIpi * (aliq.icms || 0));
  const pisCofins = r6(r6(semIpi - icms) * (aliq.pisCofins || 0));
  const liquido = r6(semIpi - icms - pisCofins);

  const fator = valor > 0 ? r6(liquido / valor) : 0;
  return { bruto: valor, semIpi, ipi, icms, pisCofins, liquido, fator };
}

/**
 * Reconstrói o preço COM impostos a partir do valor líquido
 * (inverso exato de `decomporPrecoCarregadores`).
 */
export function reconstruirPrecoCarregadores(liquido: number, aliq: AliquotasCarregadores): number {
  const fator = fatorLiquidoCarregadores(aliq);
  if (!(fator > 0)) return 0;
  return r6(r6(liquido || 0) / fator);
}
