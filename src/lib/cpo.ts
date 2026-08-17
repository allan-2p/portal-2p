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
  preco_sugerido?: number;
  ativo: boolean;
  ncm_id?: string | null;
  ncm_codigo?: string | null;
  imagem_path?: string | null;
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
  /** % fixo de representante sobre a venda (custo empresa). */
  pct_representante: number;
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
  pct_representante: 0,
  pct_indicacao: 0.0025,
  fator_clt: 1.66,
};


export type CpoItem = {
  key: string;
  produtoId: string;
  qtd: number;
  valor: number;
  valorManual: boolean;
  /** Último Preço Sugerido aplicado automaticamente neste item. */
  sugeridoAplicado?: number;
};

export type CpoFinalidadeUso = "uso_consumo" | "revenda" | "industrializacao";

export type CpoFreteMod = "FOB" | "CIF" | "DEDICADO";

/** Modalidades em que o frete é absorvido pela 2P. */
export const FRETE_ABSORVIDO: CpoFreteMod[] = ["CIF", "DEDICADO"];

export const labelFreteMod: Record<CpoFreteMod, string> = {
  FOB: "FOB — por conta do cliente (retirar)",
  CIF: "CIF — por conta da 2P (receber)",
  DEDICADO: "Dedicado — veículo exclusivo por conta da 2P",
};

/** Tipo de nota fiscal da operação. */
export type CpoTipoNf = "venda" | "triangulacao" | "bonificacao";

export const labelTipoNf: Record<CpoTipoNf, string> = {
  venda: "Venda",
  triangulacao: "Triangulação",
  bonificacao: "Bonificação",
};

/** Formas de pagamento aceitas na proposta. */
export type CpoFormaPagamento = "boleto_vista" | "boleto_prazo" | "pix" | "cartao_credito";

export const labelFormaPagamento: Record<CpoFormaPagamento, string> = {
  boleto_vista: "Boleto à vista (5 dias)",
  boleto_prazo: "Boleto a prazo",
  pix: "Pix",
  cartao_credito: "Cartão de crédito",
};

/** Endereço de entrega da proposta (usado depois no cálculo do frete). */
export type CpoEndereco = {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  contato: string;
  telefone: string;
};

export function novoEndereco(uf = ""): CpoEndereco {
  return {
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf,
    contato: "",
    telefone: "",
  };
}

/**
 * Dados de faturamento alternativos — usados quando a nota NÃO é emitida para
 * o cliente final (revenda/intermediário). Nesse caso o consultor informa
 * novamente o destinatário fiscal da nota.
 */
export type CpoFaturamento = CpoEndereco & {
  doc: string;
  nome: string;
  ie: string;
  contribuinte: boolean;
};

export function novoFaturamento(uf = ""): CpoFaturamento {
  return { ...novoEndereco(uf), doc: "", nome: "", ie: "", contribuinte: false };
}

/** Transportadora escolhida na cotação do Fretefy. */
export type CpoTransportadora = {
  id: string;
  nome: string;
  documento: string;
  total: number;
  prazo: number;
};



export type CpoState = {
  /** Nome/identificação da proposta (padrão universal do portal). */
  propostaNome: string;
  /** Nº do pedido no SAP vinculado à proposta. */
  numeroSap: string;
  nome: string;
  telefone: string;

  email: string;
  doc: string;
  ie: string;
  uf: string;
  contribuinte: boolean;
  /** Regime tributário do cadastro (usado na exceção de SC). */
  regimeTributario?: string | null;
  finalidadeUso: CpoFinalidadeUso;
  /** Proposta veio de indicação (somente Carregadores). */
  indicacao: boolean;
  /** Padrinho da indicação, quando houver. */
  padrinhoId: string | null;
  padrinhoNome: string;
  /** Previsão de fechamento (AAAA-MM-DD) — campo opcional. */
  previsaoFechamento: string;
  /** Tipo de nota fiscal da operação. */
  tipoNf: CpoTipoNf;
  /** Faturar diretamente para o cliente final (desmarcado por padrão). */
  faturarClienteFinal: boolean;
  /** Destinatário fiscal alternativo (quando não é o cliente final). */
  faturamento: CpoFaturamento;
  formaPagamento: CpoFormaPagamento | "";
  /** Entrega em endereço diferente do faturamento (mesmo estado). */
  entregaDiferente: boolean;
  entrega: CpoEndereco;
  /** Modalidade de frete — começa vazia e é escolhida pelo usuário. */
  freteMod: CpoFreteMod | "";
  /** Entrega em área rural (perguntado apenas no CIF). */
  freteAreaRural: boolean;
  freteValor: number;
  /** Transportadora escolhida na cotação (CIF). */
  transportadora: CpoTransportadora | null;
  observacoes: string;
  itens: CpoItem[];
};



/**
 * Destinatário fiscal da nota: quando a NF é emitida para outro destinatário,
 * o ICMS segue os dados dele (UF, contribuinte, IE), não os do cliente final.
 */
export function destinoFiscal(
  state: Pick<CpoState, "uf" | "contribuinte" | "ie" | "faturarClienteFinal" | "faturamento">,
) {
  const f = state.faturamento;
  if (state.faturarClienteFinal && f) {
    return {
      uf: (f.uf || state.uf || "").toUpperCase(),
      contribuinte: !!f.contribuinte,
      ie: f.ie ?? "",
    };
  }
  return {
    uf: (state.uf || "").toUpperCase(),
    contribuinte: !!state.contribuinte,
    ie: state.ie ?? "",
  };
}

/** Cliente contribuinte com IE: o DIFAL é recolhido por ele, sem impacto na margem da 2P. */
export function difalEhInformativo(state: Pick<CpoState, "contribuinte" | "ie">) {
  return state.contribuinte && !!(state.ie ?? "").trim();
}

export function isSimplesNacional(regime?: string | null) {
  return /simples/i.test(regime ?? "");
}


/**
 * Alíquota de ICMS da operação. Regra geral: interestadual do NCM (4%).
 * Exceção — vendas para dentro de SC:
 *   não contribuinte 17% · contribuinte Simples Nacional 12%
 *   demais contribuintes: revenda 4% · industrialização 10%
 */
export function aliqInterOperacao(args: {
  uf: string;
  contribuinte: boolean;
  regimeTributario?: string | null;
  finalidade: CpoFinalidadeUso;
  padrao: number;
}) {
  if (args.uf !== "SC") return args.padrao;
  if (!args.contribuinte) return 0.17;
  if (isSimplesNacional(args.regimeTributario)) return 0.12;
  if (args.finalidade === "industrializacao") return 0.1;
  return 0.04;
}

/**
 * DIFAL é calculado em uso e consumo/ativo e em revenda.
 * Industrialização é isenta — a mercadoria é insumo do processo produtivo.
 */
export const UF_ORIGEM = "SC";

/** Venda dentro de SC é operação interna: não há diferencial de alíquota (DIFAL). */
export function operacaoInterna(uf: string) {
  return (uf || "").toUpperCase() === UF_ORIGEM;
}

export function finalidadeGeraDifal(finalidade: CpoFinalidadeUso) {
  return finalidade !== "industrializacao";
}

/**
 * Em revenda o DIFAL é sempre apenas informativo: é apurado e exibido,
 * mas não é absorvido pela 2P e não afeta a receita líquida nem a margem.
 */
export function difalSempreInformativoPorFinalidade(finalidade: CpoFinalidadeUso) {
  return finalidade === "revenda";
}

/** Aviso de guia de DIFAL em compras para uso e consumo (independe de convênio ST). */
export function avisoDifalUsoConsumo(state: Pick<CpoState, "contribuinte" | "ie" | "finalidadeUso"> & { uf?: string }) {
  if (operacaoInterna(state.uf ?? "")) return null;
  if (state.finalidadeUso !== "uso_consumo" || !difalEhInformativo(state)) return null;
  return (
    "DIFAL: por se tratar de aquisição para uso e consumo, o destinatário poderá receber guia de recolhimento " +
    "do DIFAL no seu Estado, mesmo em UF sem convênio de ICMS-ST. Valor apresentado apenas em caráter informativo."
  );
}


/** Texto padrão de observações incluído em toda nova proposta. */
export const OBSERVACOES_PADRAO = "Valores dos itens expressos com IPI.";

/** Ressalva de DIFAL — só faz sentido para cliente contribuinte. */
export const OBSERVACAO_DIFAL_CONTRIBUINTE =
  "O DIFAL não é de responsabilidade da 2P, sendo o recolhimento de responsabilidade do destinatário.";

/**
 * Monta as observações finais: remove qualquer ressalva de DIFAL existente e
 * só a inclui novamente quando o cliente for contribuinte.
 */
export function observacoesComDifal(
  texto: string | null | undefined,
  state: Pick<CpoState, "contribuinte" | "ie"> & { uf?: string },
) {
  const base = (texto ?? "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && l !== OBSERVACAO_DIFAL_CONTRIBUINTE)
    .join("\n");
  if (!state.contribuinte || operacaoInterna(state.uf ?? "")) return base;
  return [base, OBSERVACAO_DIFAL_CONTRIBUINTE].filter(Boolean).join("\n");
}


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
    propostaNome: "",
    numeroSap: "",
    nome: "",

    telefone: "",
    email: "",
    doc: "",
    ie: "",
    uf: "SP",
    contribuinte: false,
    finalidadeUso: "uso_consumo",
    indicacao: false,
    padrinhoId: null,
    padrinhoNome: "",
    previsaoFechamento: "",
    tipoNf: "venda",
    faturarClienteFinal: false,
    faturamento: novoFaturamento("SP"),
    formaPagamento: "",
    entregaDiferente: false,
    entrega: novoEndereco("SP"),
    freteMod: "",
    freteAreaRural: false,
    freteValor: 0,
    transportadora: null,

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
  const destino = destinoFiscal(state);
  const uf = ufs.find((u) => u.uf === destino.uf);
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


  for (const it of state.itens) {
    const qtd = it.qtd || 0;
    const bruto = (it.valor || 0) * qtd;
    const prod = produtos.find((p) => p.id === it.produtoId);
    const r = ncmDoItem(it.produtoId);
    const interItem = aliqInterOperacao({
      uf: destino.uf,
      contribuinte: destino.contribuinte,
      regimeTributario: state.regimeTributario ?? null,
      finalidade: state.finalidadeUso,
      padrao: r.inter,
    });


    const semIpi = bruto / (1 + r.ipi);
    // Frete vai "por fora": não entra na base de ICMS/DIFAL nem na MB/comissão.
    const baseIcms = semIpi;
    const icmsItem = baseIcms * interItem;

    const pcItem = (semIpi - icmsItem) * r.pisCofins;

    valorItens += bruto;
    custoTotal += (prod?.custo || 0) * qtd;
    valorItem += semIpi;
    ipiValor += bruto - semIpi;
    icms += icmsItem;
    pisCofins += pcItem;
    interPonderado += interItem * bruto;

    if (r.geraDifal && finalidadeGeraDifal(state.finalidadeUso) && !operacaoInterna(destino.uf)) {
      const d = calcularDifal(bruto, interna, fcp, interItem);
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
  // Contribuinte com IE recolhe o DIFAL por guia no Estado dele → informativo, sem impacto na margem.
  const difal = { base: difalBase, valor: difalValor };
  const informativo =
    difalEhInformativo(destino) || difalSempreInformativoPorFinalidade(state.finalidadeUso);

  const difalAbs = informativo ? 0 : difal.valor;
  const difalEstimado = informativo ? difal.valor : 0;


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
  return { level: "good", msg: "MB% dentro da política." };
}

/**
 * Margem padrão aplicada sobre o custo para sugerir o preço de venda (37%).
 * Não confundir com a política de MB mínima (33%, `politica_mb_min`): o
 * sugerido nasce em 37% e a proposta nunca pode ser salva abaixo de 33%.
 */
export const MARGEM_PRECO_SUGERIDO = 0.37;

/**
 * Preço sugerido "seco" (sem impostos): custo / (1 - 0,37).
 * Usado apenas como referência no cadastro do produto.
 */
export function precoSugeridoPadrao(custo: number) {
  const c = Number(custo) || 0;
  if (c <= 0) return 0;
  return Math.round((c / (1 - MARGEM_PRECO_SUGERIDO)) * 100) / 100;
}

/**
 * Preço unitário (com IPI) que resulta na margem-alvo real da proposta.
 *
 * MB% da proposta = (RL - custo) / valor bruto, e a RL já é líquida de IPI,
 * ICMS, PIS/COFINS e DIFAL (quando não informativo). Por isso o preço precisa
 * ser "grossado" pelos impostos — usar custo/(1-0,37) direto derruba a MB%
 * para bem abaixo da política de 33%.
 */
export function precoParaMargem(
  produto: CpoProduct | undefined,
  state: Pick<CpoState, "uf" | "contribuinte" | "finalidadeUso"> & {
    ie?: string;
    regimeTributario?: string | null;
  },
  ufs: CpoUf[],
  config: CpoConfig,
  ncms: CpoNcm[] = [],
  margem: number = MARGEM_PRECO_SUGERIDO,
) {
  const custo = Number(produto?.custo) || 0;
  if (custo <= 0) return 0;

  const ncm = produto?.ncm_id ? ncms.find((n) => n.id === produto.ncm_id) : undefined;
  const ipi = ncm?.ipi ?? config.ipi;
  const pc = ncm?.pis_cofins ?? config.pis_cofins;
  const geraDifal = ncm ? ncm.gera_difal : true;

  const inter = aliqInterOperacao({
    uf: state.uf,
    contribuinte: state.contribuinte,
    regimeTributario: state.regimeTributario ?? null,
    finalidade: state.finalidadeUso,
    padrao: ncm?.aliq_inter ?? config.aliq_inter,
  });

  // Fração da receita líquida sobre o valor bruto (com IPI).
  const f = (1 - inter - (1 - inter) * pc) / (1 + ipi);

  // DIFAL só pesa na margem quando não é informativo.
  const ufRow = ufs.find((u) => u.uf === state.uf);
  const carga = (ufRow?.aliq_interna ?? 0.18) + (ufRow?.fcp ?? 0);
  const informativo =
    difalEhInformativo({ contribuinte: state.contribuinte, ie: state.ie ?? "" }) ||
    difalSempreInformativoPorFinalidade(state.finalidadeUso);
  const aplicaDifal =
    geraDifal &&
    finalidadeGeraDifal(state.finalidadeUso) &&
    !operacaoInterna(state.uf) &&
    !informativo &&
    carga > inter &&
    carga < 1;
  const dPct = aplicaDifal ? (carga - inter) / (1 - carga) : 0;

  const denom = f - dPct - margem;
  if (!(denom > 0)) return 0;
  return Math.round((custo / denom) * 100) / 100;
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
