// ============================================================================
// Motor de cálculo e tipos do módulo CPO (Portal 2P Carregadores).
// Base: planilhas "Precificação Carregadores — Memória Cálculo",
// "Tabela DIFAL — Não Contribuinte" e "Informações Fiscais".
//
//   Valor da venda   = valor do item COM IPI (é o que o vendedor digita)
//   Valor sem IPI    = Venda ÷ (1 + IPI)
//   IPI              = Venda − Valor sem IPI
//   ICMS na NF       = Valor sem IPI × 4%   (SEMPRE 4% — nunca somar o DIFAL)
//   PIS/COFINS       = (Valor sem IPI − ICMS) × 9,25%
//   DIFAL            = custo adicional no cabeçalho da NF (não altera o ICMS):
//                      base  = Venda ÷ (1 − (interna + FCP))
//                      DIFAL = base × (interna + FCP − 4%)
//   Receita Líquida  = Venda − IPI − ICMS − PIS/COFINS − DIFAL (quando custo da 2P)
//   CMV              = Custo ÷ Receita Líquida
//   Margem Bruta     = Receita Líquida − Custo   ;  MB% = MB ÷ Venda
// ============================================================================

export type CpoNcm = {
  id: string;
  codigo: string;
  descricao: string;
  ipi: number;
  pis_cofins: number;
  aliq_inter: number;
  tem_st: boolean;
  gera_difal: boolean;
  observacoes: string | null;
  ativo: boolean;
};

export type CpoProduct = {
  id: string;
  codigo?: string | null;
  nome: string;
  custo: number;
  ativo: boolean;
  ncm_id?: string | null;
};

export type CpoUf = {
  uf: string;
  nome: string;
  aliq_interna: number;
  fcp: number;
  convenio_st?: boolean;
};

export type CpoConfig = {
  ipi: number;
  pis_cofins: number;
  aliq_inter: number;
  majoracao_sem_ie: number;
  politica_mb_min: number;
  mb_atencao: number;
  comissao_base: "MB" | "VALOR";
  comissao_pct: number;
  /** CMV máximo que o vendedor pode orçar sem aprovação da diretoria. */
  cmv_max: number;
  /** % fixo de gerente sobre a venda (custo empresa). */
  pct_gerente: number;
  /** % fixo de indicação sobre a venda (custo empresa) — vale para CLT e PJ. */
  pct_indicacao: number;
  /** Fator de encargos CLT (custo empresa ÷ remuneração). */
  fator_clt: number;
};

export const CPO_CONFIG_FALLBACK: CpoConfig = {
  ipi: 0.05,
  pis_cofins: 0.0925,
  aliq_inter: 0.04,
  majoracao_sem_ie: 0.25,
  politica_mb_min: 0.33,
  mb_atencao: 0.4,
  comissao_base: "MB",
  comissao_pct: 0,
  cmv_max: 0.605,
  pct_gerente: 0.005,
  pct_indicacao: 0.0025,
  fator_clt: 1.66,
};

export type CpoItem = {
  key: string;
  produtoId: string;
  qtd: number;
  valor: number;
  valorManual: boolean;
};

export type CpoFinalidadeUso = "uso_consumo" | "revenda" | "industrializacao";

export type CpoFreteMod = "FOB" | "CIF" | "DEDICADO";

/** Modalidades em que o frete é absorvido pela 2P. */
export const FRETE_ABSORVIDO: CpoFreteMod[] = ["CIF", "DEDICADO"];

export const labelFreteMod: Record<CpoFreteMod, string> = {
  FOB: "FOB — por conta do cliente",
  CIF: "CIF — por conta da 2P",
  DEDICADO: "Dedicado — veículo exclusivo por conta da 2P",
};

export type CpoState = {
  nome: string;
  telefone: string;
  email: string;
  doc: string;
  ie: string;
  uf: string;
  contribuinte: boolean;
  finalidadeUso: CpoFinalidadeUso;
  freteMod: CpoFreteMod;
  freteValor: number;
  observacoes: string;
  itens: CpoItem[];
};

/** Texto padrão de observações incluído em toda nova proposta. */
export const OBSERVACOES_PADRAO =
  "Valores dos itens expressos com IPI. O DIFAL não é de responsabilidade da 2P, sendo o recolhimento de responsabilidade do destinatário.";

export type CpoResult = {
  valorItens: number;
  valorTotalProposta: number;
  valor: number;
  valorItem: number;
  origem: number;
  /** DIFAL cobrado como custo adicional no cabeçalho da NF (não contribuinte). */
  difalAbs: number;
  /** DIFAL informativo (contribuinte) — recolhimento do destinatário. */
  difalEstimado: number;
  difalBase: number;
  icms: number;
  icmsRate: number;
  ipiValor: number;
  pisCofins: number;
  rl: number;
  custoTotal: number;
  cmv: number;
  cmvExcedido: boolean;
  mb: number;
  mbPct: number;
  comPct: number;
  comValor: number;
  aliqInterna: number;
  inter: number;
  convenioSt: boolean;
};

export function novoItem(): CpoItem {
  return {
    key: Math.random().toString(36).slice(2),
    produtoId: "",
    qtd: 1,
    valor: 0,
    valorManual: false,
  };
}

export function novoEstado(): CpoState {
  return {
    nome: "",
    telefone: "",
    email: "",
    doc: "",
    ie: "",
    uf: "SP",
    contribuinte: false,
    finalidadeUso: "uso_consumo",
    freteMod: "FOB",
    freteValor: 0,
    observacoes: OBSERVACOES_PADRAO,
    itens: [novoItem()],
  };
}

export const labelFinalidadeUso: Record<CpoFinalidadeUso, string> = {
  uso_consumo: "Uso e consumo",
  revenda: "Revenda",
  industrializacao: "Industrialização",
};

/** DIFAL "por dentro" conforme a Tabela DIFAL — Não Contribuinte. */
export function calcularDifal(vendaComIpi: number, aliqInterna: number, fcp: number, inter: number) {
  const carga = aliqInterna + fcp;
  if (!(carga > 0) || carga >= 1 || !(vendaComIpi > 0)) return { base: 0, valor: 0, pct: 0 };
  const base = vendaComIpi / (1 - carga);
  const valor = Math.max(0, base * (carga - inter));
  return { base, valor, pct: valor / vendaComIpi };
}

export function calcularCpo(
  state: CpoState,
  produtos: CpoProduct[],
  ufs: CpoUf[],
  config: CpoConfig,
  ncms: CpoNcm[] = [],
): CpoResult {
  const uf = ufs.find((u) => u.uf === state.uf);
  const interna = uf?.aliq_interna ?? 0.18;
  const fcp = uf?.fcp ?? 0;
  const aliqInterna = interna + fcp;

  // As alíquotas são regras do NCM; a config global só é fallback.
  const ncmDoItem = (produtoId: string) => {
    const prod = produtos.find((p) => p.id === produtoId);
    const ncm = prod?.ncm_id ? ncms.find((n) => n.id === prod.ncm_id) : undefined;
    return {
      ipi: ncm?.ipi ?? config.ipi,
      pisCofins: ncm?.pis_cofins ?? config.pis_cofins,
      inter: ncm?.aliq_inter ?? config.aliq_inter,
      geraDifal: ncm ? ncm.gera_difal : true,
    };
  };

  let valorItens = 0;
  let custoTotal = 0;
  let valorItem = 0; // base sem IPI
  let ipiValor = 0;
  let icms = 0;
  let pisCofins = 0;
  let difalBase = 0;
  let difalValor = 0;
  let interPonderado = 0;

  const frete = state.freteValor || 0;
  const brutoTotal = state.itens.reduce((s, it) => s + (it.valor || 0) * (it.qtd || 0), 0);

  for (const it of state.itens) {
    const qtd = it.qtd || 0;
    const bruto = (it.valor || 0) * qtd;
    const prod = produtos.find((p) => p.id === it.produtoId);
    const r = ncmDoItem(it.produtoId);

    const semIpi = bruto / (1 + r.ipi);
    // ICMS incide sobre o valor da mercadoria + frete rateado por item.
    const freteItem = brutoTotal > 0 ? frete * (bruto / brutoTotal) : 0;
    const baseIcms = semIpi + freteItem;
    const icmsItem = baseIcms * r.inter;
    const pcItem = (semIpi - icmsItem) * r.pisCofins;

    valorItens += bruto;
    custoTotal += (prod?.custo || 0) * qtd;
    valorItem += semIpi;
    ipiValor += bruto - semIpi;
    icms += icmsItem;
    pisCofins += pcItem;
    interPonderado += r.inter * bruto;

    if (r.geraDifal) {
      const d = calcularDifal(bruto + freteItem, interna, fcp, r.inter);
      difalBase += d.base;
      difalValor += d.valor;
    }
  }

  const valorTotalProposta = valorItens + frete;
  const valor = valorItens;


  const inter = valorItens > 0 ? interPonderado / valorItens : config.aliq_inter;
  const origem = icms;
  const icmsRate = inter;

  // DIFAL não entra no ICMS: é custo adicional no cabeçalho da NF.
  const difal = { base: difalBase, valor: difalValor };
  const difalAbs = state.contribuinte ? 0 : difal.valor;
  const difalEstimado = state.contribuinte ? difal.valor : 0;


  const rl = valorItens - ipiValor - icms - pisCofins - difalAbs;
  const cmv = rl > 0 ? custoTotal / rl : 0;
  const mb = rl - custoTotal;
  const mbPct = valor > 0 ? mb / valor : 0;

  // Comissão total (custo da empresa) em função do CMV, sobre a MB.
  const comPct = custoTotal > 0 ? pctComissaoPorCmv(cmv) : 0;
  const cmvExcedido = custoTotal > 0 && cmv > config.cmv_max;
  const comValor = cmvExcedido ? 0 : mb * comPct;

  return {
    valorItens,
    valorTotalProposta,
    valor,
    valorItem,
    origem,
    difalAbs,
    difalEstimado,
    difalBase: difal.base,
    icms,
    icmsRate,
    ipiValor,
    pisCofins,
    rl,
    custoTotal,
    cmv,
    cmvExcedido,
    mb,
    mbPct,
    comPct,
    comValor,
    aliqInterna,
    inter,
    convenioSt: !!uf?.convenio_st,
  };
}

/**
 * % total de comissão (custo da empresa) sobre a MB, em função do CMV.
 * Planilha "Cálculo comissão Carregadores": (4 + 7,4 / (1 + e^(2,05·(CMV%−57,8)))) / 100
 */
export function pctComissaoPorCmv(cmv: number): number {
  const x = cmv * 100;
  return (4 + 7.4 / (1 + Math.exp(2.05 * (x - 57.8)))) / 100;
}

/** Texto padrão de DIFAL informativo para clientes contribuintes. */
export function textoDifalContribuinte(opts: {
  ufNome: string;
  aliqInterna: number;
  fcp: number;
  valor: number;
  temIe: boolean;
}) {
  return (
    `DIFAL: Estimativa calculada de forma informativa sobre o valor do item da NF-e, considerando ICMS interno de ` +
    `${fmtPct(opts.aliqInterna)} e adicional de pobreza de ${fmtPct(opts.fcp)} para a UF ${opts.ufNome}. ` +
    `Este valor não é definitivo e pode variar conforme enquadramento fiscal, convênios, ICMS-ST e validação no faturamento. ` +
    (opts.temIe
      ? `Como há IE informada, a cobrança efetiva ainda depende da análise fiscal da operação. `
      : `Sem IE informada, a cobrança tende a ser efetiva na operação. `) +
    `Mas a estimativa é de ${fmtBRL(opts.valor)}.`
  );
}

export type MbStatus = { level: "bad" | "warn" | "good"; msg: string };

export function statusMB(mbPct: number, config: CpoConfig): MbStatus {
  if (mbPct < config.politica_mb_min)
    return {
      level: "bad",
      msg: `MB% abaixo da política mínima de ${fmtPct(config.politica_mb_min)}. Ajuste a proposta para continuar.`,
    };
  if (mbPct < config.mb_atencao)
    return { level: "warn", msg: "MB% dentro da política, mas em faixa de atenção." };
  return { level: "good", msg: "MB% dentro da política." };
}

export const fmtBRL = (v: number) =>
  (isFinite(v) ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtPct = (v: number) =>
  `${(isFinite(v) ? v * 100 : 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export function parseMoeda(s: string | number) {
  if (typeof s === "number") return s;
  const clean = (s || "")
    .toString()
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = parseFloat(clean);
  return isFinite(n) ? n : 0;
}
