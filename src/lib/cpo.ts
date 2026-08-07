// Motor de cálculo e tipos do módulo CPO (Portal 2P Carregadores).
// Regras portadas da plataforma app.2pcarregadores.com.br:
//   Valor Item  = Valor / (1 + IPI)                (remove IPI embutido)
//   ICMS efetivo (não contribuinte) = origem + DIFAL absorvido "por dentro"
//   ICMS efetivo (contribuinte)     = origem  (DIFAL por conta do destinatário)
//   PIS/COFINS  = (ValorItem - ICMS) * 9,25%
//   Receita Líq = ValorItem - ICMS - PIS/COFINS
//   Margem Bruta = RL - custo dos equipamentos ; MB% = MB / Valor

export type CpoProduct = {
  id: string;
  nome: string;
  potencia: string | null;
  custo: number;
  ativo: boolean;
};

export type CpoUf = {
  uf: string;
  nome: string;
  aliq_interna: number;
  fcp: number;
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
};

export type CpoItem = {
  key: string;
  produtoId: string;
  qtd: number;
  valor: number;
  valorManual: boolean;
};

export type CpoState = {
  nome: string;
  telefone: string;
  email: string;
  doc: string;
  ie: string;
  uf: string;
  contribuinte: boolean;
  freteMod: "FOB" | "CIF";
  freteValor: number;
  itens: CpoItem[];
};

export type CpoResult = {
  valorItens: number;
  valorTotalProposta: number;
  valor: number;
  valorItem: number;
  origem: number;
  difalAbs: number;
  difalEstimado: number;
  icms: number;
  icmsRate: number;
  ipiValor: number;
  pisCofins: number;
  rl: number;
  custoTotal: number;
  mb: number;
  mbPct: number;
  comPct: number;
  comValor: number;
  aliqInterna: number;
  inter: number;
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
    freteMod: "FOB",
    freteValor: 0,
    itens: [novoItem()],
  };
}


export function calcularCpo(
  state: CpoState,
  produtos: CpoProduct[],
  ufs: CpoUf[],
  config: CpoConfig,
): CpoResult {
  const uf = ufs.find((u) => u.uf === state.uf);
  const aliqInterna = (uf?.aliq_interna ?? 0.18) + (uf?.fcp ?? 0);
  const inter = config.aliq_inter;
  const ipi = config.ipi;

  let valorItens = 0;
  let valorItemBase = 0;
  // A margem é calculada a partir do VALOR informado na proposta (receita
  // líquida após impostos). O custo cadastrado do produto não entra na conta.
  const custoTotal = 0;
  for (const it of state.itens) {
    valorItens += (it.valor || 0) * (it.qtd || 0);
    valorItemBase += ((it.valor || 0) / (1 + ipi)) * (it.qtd || 0);
  }


  const frete = state.freteValor || 0;
  const valorTotalProposta = valorItens + frete;
  const valor = valorItens;
  const valorItem = valorItemBase;

  const origem = valorItem * inter;
  const fatorDentro = aliqInterna < 1 ? (aliqInterna - inter) / (1 - aliqInterna) : 0;
  let difalAbs = 0;
  let difalEstimado = 0;
  let icms: number;
  if (state.contribuinte) {
    icms = origem;
    difalEstimado = valorItem * fatorDentro;
  } else {
    difalAbs = valorItem * fatorDentro;
    icms = origem + difalAbs;
  }

  let icmsRate = valorItem > 0 ? icms / valorItem : 0;
  icmsRate = Math.round(icmsRate * 10000) / 10000;
  const icmsFinal = valorItem * icmsRate;

  const ipiValor = valorItem * ipi;
  const pisCofins = (valorItem - icmsFinal) * config.pis_cofins;
  const rl = valorItem - icmsFinal - pisCofins;
  const mb = rl - custoTotal;
  const mbPct = valor > 0 ? mb / valor : 0;

  const comBase = config.comissao_base === "VALOR" ? valor : mb;
  const comPct = config.comissao_pct || 0;

  return {
    valorItens,
    valorTotalProposta,
    valor,
    valorItem,
    origem,
    difalAbs,
    difalEstimado,
    icms: icmsFinal,
    icmsRate,
    ipiValor,
    pisCofins,
    rl,
    custoTotal,
    mb,
    mbPct,
    comPct,
    comValor: comBase * comPct,
    aliqInterna,
    inter,
  };
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
