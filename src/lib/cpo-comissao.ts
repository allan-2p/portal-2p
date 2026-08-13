// ============================================================================
// Política comercial de comissões — 2P Carregadores
// Base: planilha "Cálculo comissão Carregadores — Vendedor 07/2026".
//
//   CMV               = Custo ÷ Receita Líquida
//   % comissão total  = (4 + 7,4 / (1 + e^(2,05·(CMV%−57,8)))) / 100
//   Comissão total    = MB × % comissão total   → CUSTO TOTAL PARA A EMPRESA
//
// Do custo total deduzem-se os percentuais fixos de Gerente e Indicação
// (ambos sobre a venda, iguais em CLT e PJ). O saldo é a comissão do vendedor
// — por isso ela é extremamente variável.
//
//   Custo vendedor = Comissão total − Custo gerente − Custo indicação
//   Remuneração    = custo (PJ)  ou  custo ÷ 1,66 (CLT)
//
// CMV acima de 60,5% bloqueia o orçamento (exige aprovação da diretoria).
// ============================================================================

import { pctComissaoPorCmv } from "./cpo";

export { pctComissaoPorCmv };

export type Regime = "CLT" | "PJ";

/** Fator de encargos padrão CLT (custo empresa / remuneração). */
export const FATOR_CLT = 1.66;

/** CMV máximo permitido ao vendedor sem aprovação especial da diretoria. */
export const CMV_MAX = 0.605;

/** Percentuais fixos deduzidos do custo total da comissão (sobre a venda). */
export const PCT_GERENTE = 0.005;
export const PCT_INDICACAO = 0.0025;

export type ParamsComissao = {
  cmvMax: number;
  pctGerente: number;
  pctIndicacao: number;
  fatorClt: number;
};

export const PARAMS_PADRAO: ParamsComissao = {
  cmvMax: CMV_MAX,
  pctGerente: PCT_GERENTE,
  pctIndicacao: PCT_INDICACAO,
  fatorClt: FATOR_CLT,
};

export type EntradaComissao = {
  venda: number;
  custo: number;
  /** Alíquota de ICMS na NF (sempre a interestadual, 4%). */
  icms: number;
  ipi: number;
  pisCofins: number;
  /** DIFAL absorvido pela 2P (custo no cabeçalho da NF). */
  difal?: number;
};

export function calcularComissao(e: EntradaComissao) {
  const venda = e.venda || 0;
  const valorSemIpi = venda / (1 + e.ipi);
  const vIpi = venda - valorSemIpi;
  const vIcms = valorSemIpi * e.icms;
  const vPisCofins = (valorSemIpi - vIcms) * e.pisCofins;
  const difal = e.difal || 0;

  const rl = venda - vIpi - vIcms - vPisCofins - difal;
  const cmv = rl > 0 ? e.custo / rl : 0;
  const mb = rl - e.custo;
  const mbPct = venda > 0 ? mb / venda : 0;
  const pctComissao = pctComissaoPorCmv(cmv);
  const comissaoTotal = mb * pctComissao;

  return { venda, valorSemIpi, vIcms, vIpi, vPisCofins, difal, rl, cmv, mb, mbPct, pctComissao, comissaoTotal };
}

export type RateioLinha = {
  key: string;
  papel: string;
  regime: Regime;
  /** % do custo da empresa sobre a venda */
  pctCusto: number;
  custo: number;
  remuneracao: number;
  pctRemuneracao: number;
  fixo: boolean;
};

export type Rateio = {
  comissaoTotal: number;
  bloqueado: boolean;
  linhas: RateioLinha[];
  custoVendedor: number;
};

/**
 * Rateia o custo total da comissão: gerente e indicação são fixos sobre a
 * venda; o vendedor fica com o saldo. CMV acima do limite zera a comissão.
 */
export function ratearComissao(args: {
  venda: number;
  comissaoTotal: number;
  cmv: number;
  regimeVendedor: Regime;
  regimeGerente?: Regime;
  params?: Partial<ParamsComissao>;
}): Rateio {
  const p = { ...PARAMS_PADRAO, ...(args.params ?? {}) };
  const bloqueado = args.cmv > p.cmvMax;
  const total = bloqueado ? 0 : args.comissaoTotal;

  const custoGerente = args.venda * p.pctGerente;
  const custoIndicacao = args.venda * p.pctIndicacao;
  const custoVendedor = Math.max(0, total - custoGerente - custoIndicacao);
  const regimeGerente = args.regimeGerente ?? "CLT";

  const rem = (custo: number, regime: Regime) => (regime === "CLT" ? custo / p.fatorClt : custo);

  const linhas: RateioLinha[] = [
    {
      key: "vendedor",
      papel: "Vendedor",
      regime: args.regimeVendedor,
      pctCusto: args.venda > 0 ? custoVendedor / args.venda : 0,
      custo: custoVendedor,
      remuneracao: rem(custoVendedor, args.regimeVendedor),
      pctRemuneracao: args.venda > 0 ? rem(custoVendedor, args.regimeVendedor) / args.venda : 0,
      fixo: false,
    },
    {
      key: "gerente",
      papel: "Gerente",
      regime: regimeGerente,
      pctCusto: p.pctGerente,
      custo: custoGerente,
      remuneracao: rem(custoGerente, regimeGerente),
      pctRemuneracao: args.venda > 0 ? rem(custoGerente, regimeGerente) / args.venda : 0,
      fixo: true,
    },
    {
      key: "indicacao",
      papel: "Indicação",
      regime: "PJ",
      pctCusto: p.pctIndicacao,
      custo: custoIndicacao,
      remuneracao: custoIndicacao,
      pctRemuneracao: p.pctIndicacao,
      fixo: true,
    },
  ];

  return { comissaoTotal: total, bloqueado, linhas, custoVendedor };
}
