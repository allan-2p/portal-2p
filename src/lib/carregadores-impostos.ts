/**
 * Conversão do preço de venda dos Carregadores para o valor líquido enviado ao
 * SAP (VALOR_PROD), com precisão de 6 casas decimais em TODOS os intermediários.
 *
 * O vendedor digita o preço FINAL do item (T, com todos os impostos). A conta é:
 *
 *   precoSemIpi = T / (1 + aliqIPI)
 *   VALOR_PROD  = precoSemIpi × FATOR_LIQUIDO_SAP_ICMS4
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
 * Fator que converte o preço sem IPI no valor líquido aceito pelo SAP.
 * Calibrado empiricamente com o SAP (testes QAS 0000010462/0000010464,
 * 24/08/2026); válido para ICMS interestadual 4% (produto importado — caso
 * padrão Carregadores).
 */
export const FATOR_LIQUIDO_SAP_ICMS4 = 0.870722;

/** Alíquota de ICMS para a qual o fator acima foi calibrado. */
export const ICMS_CALIBRADO = 0.04;

/** Mensagem única de bloqueio quando a operação sai da faixa calibrada. */
export const AVISO_FORA_CALIBRACAO = "alíquota fora da calibração — validar com fiscal";

/** True quando a operação usa a alíquota de ICMS calibrada (4%). */
export function dentroDaCalibracao(icms: number): boolean {
  return Math.abs((icms || 0) - ICMS_CALIBRADO) < 1e-9;
}

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
  /** False quando o ICMS da operação está fora da faixa calibrada (≠ 4%). */
  calibrado: boolean;
};

/** Preço sem IPI, em 6 casas. */
export function precoSemIpi(bruto: number, aliqIpi: number): number {
  return r6(r6(bruto || 0) / (1 + (aliqIpi || 0)));
}

/**
 * VALOR_PROD unitário (ou por linha, conforme o valor passado) enviado ao SAP.
 * Intermediários em 6 casas; resultado final em 2 casas.
 */
export function valorProdCarregadores(bruto: number, aliqIpi: number): number {
  const semIpi = precoSemIpi(bruto, aliqIpi);
  return r2(r6(semIpi * FATOR_LIQUIDO_SAP_ICMS4));
}

/** Fator líquido (liquido ÷ bruto) apenas em função das alíquotas. */
export function fatorLiquidoCarregadores(aliq: AliquotasCarregadores): number {
  const semIpi = r6(1 / (1 + (aliq.ipi || 0)));
  if (dentroDaCalibracao(aliq.icms)) return r6(semIpi * FATOR_LIQUIDO_SAP_ICMS4);
  // Fora da calibração: fórmula teórica (ICMS e PIS/COFINS por dentro do
  // valor sem IPI). Serve para exibição — o envio ao SAP é bloqueado.
  const icms = r6(semIpi * (aliq.icms || 0));
  const pisCofins = r6(r6(semIpi - icms) * (aliq.pisCofins || 0));
  return r6(semIpi - icms - pisCofins);
}

/**
 * Decompõe o preço COM impostos nas parcelas exibidas na proposta
 * (líquido, ICMS, PIS/COFINS, IPI), derivadas da MESMA conta do VALOR_PROD:
 * o líquido é o fator calibrado, o ICMS é a alíquota da operação e o
 * PIS/COFINS é o resíduo.
 */
export function decomporPrecoCarregadores(
  bruto: number,
  aliq: AliquotasCarregadores,
): DecomposicaoCarregadores {
  const valor = r6(bruto || 0);
  const semIpi = precoSemIpi(valor, aliq.ipi);
  const ipi = r6(valor - semIpi);
  const calibrado = dentroDaCalibracao(aliq.icms);

  let icms: number;
  let pisCofins: number;
  let liquido: number;
  if (calibrado) {
    liquido = r6(semIpi * FATOR_LIQUIDO_SAP_ICMS4);
    icms = r6(semIpi * ICMS_CALIBRADO);
    pisCofins = r6(semIpi - liquido - icms);
  } else {
    icms = r6(semIpi * (aliq.icms || 0));
    pisCofins = r6(r6(semIpi - icms) * (aliq.pisCofins || 0));
    liquido = r6(semIpi - icms - pisCofins);
  }

  const fator = valor > 0 ? r6(liquido / valor) : 0;
  return { bruto: valor, semIpi, ipi, icms, pisCofins, liquido, fator, calibrado };
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
