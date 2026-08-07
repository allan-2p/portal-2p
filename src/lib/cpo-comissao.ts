// Política comercial de comissões — 2P Carregadores
// Regra: o vendedor altera apenas o valor da venda; o ICMS varia por Estado;
// o custo vem da lista de produtos. O percentual total de comissão é função do
// CMV (custo / venda) e incide sobre a margem bruta (MB).

export type Regime = "CLT" | "PJ";

export type RegraComissao = {
  key: string;
  papel: string;
  regime: Regime;
  /** % sobre o valor da venda que o beneficiário recebe (remuneração) */
  pctRemuneracao: number;
  /** Multiplicador de encargos aplicado à remuneração para chegar ao custo da empresa */
  fatorEncargos: number;
};

/** Fator de encargos padrão CLT (custo empresa / remuneração). */
export const FATOR_CLT = 1.66;

export const REGRAS_PADRAO: RegraComissao[] = [
  { key: "vendedor_clt", papel: "Vendedor", regime: "CLT", pctRemuneracao: 0.01, fatorEncargos: FATOR_CLT },
  { key: "vendedor_pj", papel: "Vendedor", regime: "PJ", pctRemuneracao: 0.0166, fatorEncargos: 1 },
  { key: "gerente_clt", papel: "Gerente", regime: "CLT", pctRemuneracao: 0.003, fatorEncargos: FATOR_CLT },
  { key: "gerente_pj", papel: "Gerente", regime: "PJ", pctRemuneracao: 0.005, fatorEncargos: 1 },
  { key: "indicacao_pj", papel: "Indicação", regime: "PJ", pctRemuneracao: 0.0025, fatorEncargos: 1 },
];

/**
 * Percentual total de comissão em função do CMV (custo/venda).
 * Planilha: =(2361*CMV^2 - 2896,4*CMV + 892,41)/100
 */
export function pctComissaoPorCmv(cmv: number): number {
  return (2361 * cmv * cmv - 2896.4 * cmv + 892.41) / 100 / 100;
}

export type EntradaComissao = {
  venda: number;
  custo: number;
  icms: number; // alíquota efetiva
  ipi: number;
  pisCofins: number;
};

export function calcularComissao(e: EntradaComissao) {
  const venda = e.venda || 0;
  const vIcms = venda * e.icms;
  const vIpi = venda * e.ipi;
  const vPisCofins = venda * e.pisCofins;
  const cmv = venda > 0 ? e.custo / venda : 0;
  const mb = venda - vIcms - vIpi - vPisCofins - e.custo;
  const mbPct = venda > 0 ? mb / venda : 0;
  const pctComissao = pctComissaoPorCmv(cmv);
  const comissaoTotal = mb * pctComissao;
  return { venda, vIcms, vIpi, vPisCofins, cmv, mb, mbPct, pctComissao, comissaoTotal };
}

export function calcularRegra(regra: RegraComissao, venda: number) {
  const remuneracao = venda * regra.pctRemuneracao;
  const custo = remuneracao * regra.fatorEncargos;
  return {
    ...regra,
    remuneracao,
    custo,
    pctCusto: regra.pctRemuneracao * regra.fatorEncargos,
  };
}
