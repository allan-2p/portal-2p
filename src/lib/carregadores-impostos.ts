/**
 * Decomposição / reconstrução de preço dos Carregadores com precisão de
 * 6 casas decimais em TODOS os intermediários (alinhamento com o SAP).
 *
 * Regra de ouro: nenhum intermediário (IPI, ICMS, PIS/COFINS, valor sem IPI)
 * pode ser arredondado a 2 casas. Só o resultado final por item é arredondado
 * a 2 casas para exibição/cobrança — e o VALOR_PROD enviado ao SAP mantém
 * 2 casas por limite do campo.
 *
 * CALIBRAÇÃO PENDENTE: as bases exatas (base do ICMS e da PIS/COFINS, e se o
 * IPI entra na base) ainda estão sendo calibradas com o SAP através dos testes
 * QAS 0000010462 / 0000010464. Ajustar apenas os parâmetros de `BasesImpostos`
 * aqui — nenhum outro arquivo deve replicar a fórmula.
 */

/** Arredondamento padrão de intermediários: 6 casas decimais. */
export const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;

/** Arredondamento final (exibição/cobrança/SAP): 2 casas. */
export const r2 = (x: number): number => Math.round(x * 100) / 100;

export type AliquotasCarregadores = {
  /** IPI, por fora (ex.: 0.05). */
  ipi: number;
  /** ICMS da operação (ex.: 0.04). */
  icms: number;
  /** PIS + COFINS somados (ex.: 0.0925). */
  pisCofins: number;
};

/**
 * Bases de cálculo parametrizadas — em calibração com o SAP
 * (testes QAS 0000010462 / 0000010464).
 */
export type BasesImpostos = {
  /** ICMS incide sobre o valor com IPI? Hoje: não (base = valor sem IPI). */
  icmsSobreValorComIpi: boolean;
  /** PIS/COFINS descontam o ICMS da base? Hoje: sim. */
  pisCofinsDescontaIcms: boolean;
};

export const BASES_PADRAO: BasesImpostos = {
  icmsSobreValorComIpi: false,
  pisCofinsDescontaIcms: true,
};

export type DecomposicaoCarregadores = {
  /** Valor bruto de entrada (preço com impostos). */
  bruto: number;
  /** Valor sem IPI. */
  semIpi: number;
  ipi: number;
  icms: number;
  pisCofins: number;
  /** Valor líquido, sem nenhum imposto. */
  liquido: number;
  /** liquido / bruto — fator de conversão reutilizável. */
  fator: number;
};

/**
 * Fator líquido (liquido ÷ bruto) apenas em função das alíquotas.
 * Todos os intermediários em 6 casas.
 */
export function fatorLiquidoCarregadores(
  aliq: AliquotasCarregadores,
  bases: BasesImpostos = BASES_PADRAO,
): number {
  const semIpi = r6(1 / (1 + (aliq.ipi || 0)));
  const baseIcms = r6(bases.icmsSobreValorComIpi ? 1 : semIpi);
  const icms = r6(baseIcms * (aliq.icms || 0));
  const basePc = r6(bases.pisCofinsDescontaIcms ? semIpi - icms : semIpi);
  const pisCofins = r6(basePc * (aliq.pisCofins || 0));
  return r6(semIpi - icms - pisCofins);
}

/** Decompõe um preço COM impostos em suas parcelas (intermediários em 6 casas). */
export function decomporPrecoCarregadores(
  bruto: number,
  aliq: AliquotasCarregadores,
  bases: BasesImpostos = BASES_PADRAO,
): DecomposicaoCarregadores {
  const valor = r6(bruto || 0);
  const semIpi = r6(valor / (1 + (aliq.ipi || 0)));
  const ipi = r6(valor - semIpi);
  const baseIcms = r6(bases.icmsSobreValorComIpi ? valor : semIpi);
  const icms = r6(baseIcms * (aliq.icms || 0));
  const basePc = r6(bases.pisCofinsDescontaIcms ? semIpi - icms : semIpi);
  const pisCofins = r6(basePc * (aliq.pisCofins || 0));
  const liquido = r6(valor - ipi - icms - pisCofins);
  const fator = valor > 0 ? r6(liquido / valor) : 0;
  return { bruto: valor, semIpi, ipi, icms, pisCofins, liquido, fator };
}

/**
 * Reconstrói o preço COM impostos a partir do valor líquido
 * (inverso exato de `decomporPrecoCarregadores`).
 */
export function reconstruirPrecoCarregadores(
  liquido: number,
  aliq: AliquotasCarregadores,
  bases: BasesImpostos = BASES_PADRAO,
): number {
  const fator = fatorLiquidoCarregadores(aliq, bases);
  if (!(fator > 0)) return 0;
  return r6(r6(liquido || 0) / fator);
}
