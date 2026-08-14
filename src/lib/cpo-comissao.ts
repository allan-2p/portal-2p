// ============================================================================
// Política comercial de comissões — 2P Carregadores
// Base: planilha "Cálculo comissão Carregadores — Vendedor 07/2026".
//
//   CMV               = Custo ÷ Receita Líquida
//   % comissão total  = (4 + 7,4 / (1 + e^(2,05·(CMV%−57,8)))) / 100
//   Comissão total    = MB × % comissão total   → CUSTO TOTAL PARA A EMPRESA
//
// Do custo total deduzem-se os percentuais fixos de Gerente e Indicação
// (gerente % sobre a venda; indicação valor fixo de R$ 250, iguais em CLT e PJ). O saldo é a comissão do vendedor
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
/** Percentual fixo do Representante sobre a venda. */
export const PCT_REPRESENTANTE = 0;
/** Comissão de indicação: valor fixo em reais (não é percentual). */
export const VALOR_INDICACAO = 250;

/**
 * Os papéis da política deixam de ser cargos livres: cada linha corresponde ao
 * Perfil de permissão do consultor dono do cliente.
 */
export const PERFIL_POR_PAPEL = {
  vendedor: "Consultor | Closer | 2P Carregadores",
  gerente: "Gerente | 2P Carregadores",
  representante: "Representante | 2P Carregadores",
} as const;

export type ParamsComissao = {
  cmvMax: number;
  pctGerente: number;
  pctRepresentante: number;
  /** Valor fixo (R$) da comissão de indicação. */
  valorIndicacao: number;
  fatorClt: number;
};

export const PARAMS_PADRAO: ParamsComissao = {
  cmvMax: CMV_MAX,
  pctGerente: PCT_GERENTE,
  pctRepresentante: PCT_REPRESENTANTE,
  valorIndicacao: VALOR_INDICACAO,
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
  /** Perfil de permissão correspondente ao papel. */
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
  /** Indicação é tratada à parte — não é um papel da tabela de perfis. */
  indicacao: { valor: number; aplicada: boolean };
};

/**
 * Rateia o custo total da comissão entre os perfis: gerente e representante são
 * fixos sobre a venda, a indicação (quando houver) é um valor fixo e o consultor
 * dono do cliente fica com o saldo. CMV acima do limite zera a comissão.
 */
export function ratearComissao(args: {
  venda: number;
  comissaoTotal: number;
  cmv: number;
  regimeVendedor: Regime;
  regimeGerente?: Regime;
  regimeRepresentante?: Regime;
  /** Marcado na proposta (Carregadores). Padrão: true. */
  comIndicacao?: boolean;
  params?: Partial<ParamsComissao>;
}): Rateio {
  const p = { ...PARAMS_PADRAO, ...(args.params ?? {}) };
  const bloqueado = args.cmv > p.cmvMax;
  const total = bloqueado ? 0 : args.comissaoTotal;

  const custoGerente = args.venda * p.pctGerente;
  const custoRepresentante = args.venda * p.pctRepresentante;
  const comIndicacao = args.comIndicacao !== false;
  const custoIndicacao = comIndicacao && args.venda > 0 ? p.valorIndicacao : 0;
  const custoVendedor = Math.max(0, total - custoGerente - custoRepresentante - custoIndicacao);
  const regimeGerente = args.regimeGerente ?? "CLT";
  const regimeRepresentante = args.regimeRepresentante ?? "PJ";

  const rem = (custo: number, regime: Regime) => (regime === "CLT" ? custo / p.fatorClt : custo);

  const linha = (
    key: string,
    papel: string,
    regime: Regime,
    custo: number,
    fixo: boolean,
  ): RateioLinha => ({
    key,
    papel,
    regime,
    pctCusto: args.venda > 0 ? custo / args.venda : 0,
    custo,
    remuneracao: rem(custo, regime),
    pctRemuneracao: args.venda > 0 ? rem(custo, regime) / args.venda : 0,
    fixo,
  });

  const linhas: RateioLinha[] = [
    linha("vendedor", PERFIL_POR_PAPEL.vendedor, args.regimeVendedor, custoVendedor, false),
    linha("gerente", PERFIL_POR_PAPEL.gerente, regimeGerente, custoGerente, true),
    linha("representante", PERFIL_POR_PAPEL.representante, regimeRepresentante, custoRepresentante, true),
  ];

  return {
    comissaoTotal: total,
    bloqueado,
    linhas,
    custoVendedor,
    indicacao: { valor: custoIndicacao, aplicada: comIndicacao },
  };
}

