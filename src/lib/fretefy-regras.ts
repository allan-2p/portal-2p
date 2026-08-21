/**
 * Regras comerciais de frete da 2P (catálogo declarativo, client-safe).
 *
 * Este módulo concentra as restrições por transportadora, os adicionais (TDE)
 * e as taxas extras. Ele é consumido tanto pelo motor de cotação no servidor
 * quanto pelo painel de Integrações, garantindo que a regra exibida ao time
 * seja exatamente a regra aplicada na proposta.
 */

export type TrilhoRef = { codigo: string; nome: string };

/** Origem fixa das cotações. */
export const ORIGEM = { uf: "SC", cidade: "Itajaí", cep: "88313000" };

/** CNPJs das transportadoras com regra específica. */
export const CNPJ = {
  BRASPRESS: "48740351012767",
  SAO_MIGUEL: "00428307001593",
  TRANSCARAPIA: "00904848000307",
  SCHREIBER: "10349430000339",
} as const;

/** Catálogo de trilhos usados nas regras (código SAP → descrição). */
export const TRILHOS: TrilhoRef[] = [
  { codigo: "200000028", nome: "2P-TC4800 Trilho 2P Alum 6063 4,80M" },
  { codigo: "100000024", nome: "2P-TCR2400 Trilho 2P Reforçado 2,40M" },
  { codigo: "100000020", nome: "2P-TC2400 Trilho 2P Alum 6063 2,40M" },
  { codigo: "200000051", nome: "2P-TCR4800 Trilho 2P Reforçado 4,80M" },
  { codigo: "200000021", nome: "2P-MT4600 Trilho Smart10 Alum 6063 4,60M" },
  { codigo: "200000080", nome: "2P-TC3600 Trilho 2P Alum 6063 3,60M" },
  { codigo: "100000260", nome: "2P-MINI4800 Mini Trilho 4,80M Avulso" },
  { codigo: "200000383", nome: "2P-TCL2400 Trilho 2P 2,40M" },
  { codigo: "200000384", nome: "2P-TCL4800 Trilho 2P 4,80M" },
  { codigo: "200000505", nome: "2P-TLP3200 Trilho p/ Prisioneiro 3,20M" },
  { codigo: "200000522", nome: "2P-TC3450 Trilho 2P Alum 6063 3,45M" },
  { codigo: "100000320", nome: "2P-Mini Trilho 3.4x4,60M Avulso" },
  { codigo: "100000321", nome: "2P-Mini Trilho 3.4x4,85M Avulso" },
  { codigo: "100000327", nome: "2P-Mini Trilho 3.4x4,50M Avulso" },
  { codigo: "200000586", nome: "2P-TCL2700 Trilho 2P 2,70M" },
  { codigo: "100000261", nome: "2P-Trilho 2P (100000261)" },
];

export const COD_TRILHOS = TRILHOS.map((t) => t.codigo);

export const nomeTrilho = (codigo: string) =>
  TRILHOS.find((t) => t.codigo === codigo)?.nome ?? codigo;

/** Trilhos que a Braspress não transporta. */
export const TRILHOS_BRASPRESS = [
  "200000028", "100000024", "100000020", "100000261", "200000051", "200000021",
  "200000080", "100000260", "200000383", "200000384", "200000505", "200000522",
  "200000586",
];

/** Trilhos que a Expresso São Miguel não transporta. */
export const TRILHOS_SAO_MIGUEL = [
  "200000028", "200000051", "200000021", "200000080", "100000260", "200000384",
  "200000505", "200000522",
];

/** Peças acima de 2,40M — geram adicional (TDE) na Schreiber. */
export const TRILHOS_SCHREIBER_TDE = ["200000586", "100000320", "100000321"];

/** Peças acima de 2,40M — geram adicional (TDE) na Transcarapia. */
export const TRILHOS_TRANSCARAPIA = [
  "200000028", "200000051", "200000021", "200000080", "100000260", "200000384",
  "200000505", "200000522", "100000320", "100000321", "100000327",
];

export const TDE_SCHREIBER = 250;
export const TDE_TRANSCARAPIA = 300;
export const ADICIONAL_AREA_RURAL = 300;
/** Potência (kW) a partir da qual a Braspress não transporta o carregador. */
export const POTENCIA_MAX_BRASPRESS_KW = 60;

/** Unidade de negócio à qual a regra se aplica. */
export type UnidadeFrete = "solar" | "carregadores";

export type RegraTransportadora = {
  /** Unidade em que a regra é aplicada e exibida. */
  unidade: UnidadeFrete;
  razaoSocial: string;
  codigoSap: string;
  cnpj: string;
  tipo: "bloqueio" | "tde";
  /** Valor do adicional, quando tipo = tde. */
  adicional?: number;
  resumo: string;
  trilhos: string[];
  extras?: string[];
};

/** Regras exibidas no painel de Integrações e aplicadas na cotação. */
export const REGRAS_TRANSPORTADORAS: RegraTransportadora[] = [
  {
    unidade: "solar",
    razaoSocial: "BRASPRESS TRANSPORTES URGENTES LTDA",
    codigoSap: "2000000812",
    cnpj: CNPJ.BRASPRESS,
    tipo: "bloqueio",
    resumo: "Não transporta nenhum dos trilhos listados.",
    trilhos: TRILHOS_BRASPRESS,
    extras: ["Para cliente pessoa física (CPF), a taxa de despacho é somada ao valor da cotação."],
  },
  {
    unidade: "solar",
    razaoSocial: "EXPRESSO SÃO MIGUEL S/A",
    codigoSap: "1000001407",
    cnpj: CNPJ.SAO_MIGUEL,
    tipo: "bloqueio",
    resumo: "Não transporta os trilhos listados.",
    trilhos: TRILHOS_SAO_MIGUEL,
  },
  {
    unidade: "solar",
    razaoSocial: "SCHREIBER LOGÍSTICA LTDA",
    codigoSap: "2000002588",
    cnpj: CNPJ.SCHREIBER,
    tipo: "tde",
    adicional: TDE_SCHREIBER,
    resumo: "Transporta todos os trilhos, com adicional (TDE) por envio apenas para os trilhos listados.",
    trilhos: TRILHOS_SCHREIBER_TDE,
  },
  {
    unidade: "solar",
    razaoSocial: "TRANSCARAPIA TRANSPORTES LTDA",
    codigoSap: "2000005188",
    cnpj: CNPJ.TRANSCARAPIA,
    tipo: "tde",
    adicional: TDE_TRANSCARAPIA,
    resumo: "Transporta todos os trilhos, com adicional (TDE) por envio para peças acima de 2,40M.",
    trilhos: TRILHOS_TRANSCARAPIA,
  },
];

/**
 * Regras de frete específicas da 2P Carregadores.
 * Não usam trilhos: o critério é a potência do carregador no carrinho.
 */
export const REGRAS_CARREGADORES = [
  {
    unidade: "carregadores" as const,
    razaoSocial: "BRASPRESS TRANSPORTES URGENTES LTDA",
    codigoSap: "2000000812",
    cnpj: CNPJ.BRASPRESS,
    resumo: `Não transporta carregadores acima de ${POTENCIA_MAX_BRASPRESS_KW} kW (ex.: 80 kW) — a Braspress sai da lista de opções.`,
    extras: ["Para cliente pessoa física (CPF), a taxa de despacho é somada ao valor da cotação."],
  },
];

/** Regras de transportadora exibidas/aplicadas em uma unidade. */
export const regrasDaUnidade = (unidade: UnidadeFrete) =>
  REGRAS_TRANSPORTADORAS.filter((r) => r.unidade === unidade);

/** Regras gerais, válidas para qualquer transportadora. */
export const REGRAS_GERAIS = [
  `Origem fixa da cotação: ${ORIGEM.cidade}/${ORIGEM.uf} (CEP ${ORIGEM.cep}).`,
  `Entrega em área rural: adicional de R$ ${ADICIONAL_AREA_RURAL},00 sobre o valor cotado.`,
  "Cotação em duas passadas: o valor da nota é recalculado incluindo o frete antes da cotação final.",
  "Frete FOB não tem valor na proposta; frete dedicado usa valor informado manualmente.",
];

/** Normaliza o código do produto (remove zeros à esquerda). */
export function normalizarCodigo(codigo: string) {
  return String(codigo ?? "").replace(/^0+/, "");
}

/** Detecta carregador veicular acima do limite pela potência no nome do produto. */
export function temCarregadorAcimaDe(nomes: string[], kwLimite: number) {
  return nomes.some((n) => {
    const m = String(n ?? "").match(/(\d+(?:[.,]\d+)?)\s*k\s*w/gi);
    if (!m) return false;
    return m.some((s) => {
      const v = Number(String(s).replace(/[^\d.,]/g, "").replace(",", "."));
      return Number.isFinite(v) && v > kwLimite;
    });
  });
}

/* ------------------------------------------------------------------ *
 * Personalização pelo painel (Moderação › 2P Solar › Regras de Fretes)
 * ------------------------------------------------------------------ */

export type FreteRegraOverride = {
  /** Regra ligada/desligada — desligada, a transportadora cota sem restrição. */
  ativa: boolean;
  /** Valor do adicional (TDE) por envio; ignorado em regras de bloqueio. */
  adicional: number;
  /** Códigos SAP de trilho que disparam o bloqueio ou o adicional. */
  trilhos: string[];
};

export type FreteRegrasConfig = {
  adicionalAreaRural: number;
  potenciaMaxBraspressKw: number;
  /** Bloqueio da Braspress por potência do carregador (2P Carregadores). */
  bloqueioCarregadorBraspress: boolean;
  /** Cobrar a taxa de despacho da Braspress quando o cliente é CPF. */
  despachoBraspressCpf: boolean;
  /** CNPJ da transportadora → regra. */
  transportadoras: Record<string, FreteRegraOverride>;
};

/** Configuração padrão (o que está codificado no catálogo acima). */
export const FRETE_REGRAS_PADRAO: FreteRegrasConfig = {
  adicionalAreaRural: ADICIONAL_AREA_RURAL,
  potenciaMaxBraspressKw: POTENCIA_MAX_BRASPRESS_KW,
  bloqueioCarregadorBraspress: true,
  despachoBraspressCpf: true,
  transportadoras: Object.fromEntries(
    REGRAS_TRANSPORTADORAS.map((r) => [
      r.cnpj,
      { ativa: true, adicional: r.adicional ?? 0, trilhos: [...r.trilhos] } as FreteRegraOverride,
    ]),
  ),
};

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Mescla o que está salvo no banco com o padrão — nunca devolve campos vazios. */
export function mesclarFreteRegras(raw: unknown): FreteRegrasConfig {
  const c = (raw ?? {}) as Partial<FreteRegrasConfig>;
  const salvas = (c.transportadoras ?? {}) as Record<string, Partial<FreteRegraOverride>>;
  const transportadoras: Record<string, FreteRegraOverride> = {};
  for (const [cnpj, padrao] of Object.entries(FRETE_REGRAS_PADRAO.transportadoras)) {
    const s = salvas[cnpj] ?? {};
    transportadoras[cnpj] = {
      ativa: typeof s.ativa === "boolean" ? s.ativa : padrao.ativa,
      adicional: num(s.adicional, padrao.adicional),
      trilhos: Array.isArray(s.trilhos) ? s.trilhos.map(String) : [...padrao.trilhos],
    };
  }
  return {
    adicionalAreaRural: num(c.adicionalAreaRural, FRETE_REGRAS_PADRAO.adicionalAreaRural),
    potenciaMaxBraspressKw: num(c.potenciaMaxBraspressKw, FRETE_REGRAS_PADRAO.potenciaMaxBraspressKw),
    bloqueioCarregadorBraspress:
      typeof c.bloqueioCarregadorBraspress === "boolean"
        ? c.bloqueioCarregadorBraspress
        : FRETE_REGRAS_PADRAO.bloqueioCarregadorBraspress,
    despachoBraspressCpf:
      typeof c.despachoBraspressCpf === "boolean"
        ? c.despachoBraspressCpf
        : FRETE_REGRAS_PADRAO.despachoBraspressCpf,
    transportadoras,
  };
}
