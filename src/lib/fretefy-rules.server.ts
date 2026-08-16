/**
 * Regras de cotação de frete da 2P no Fretefy.
 *
 * Portadas fielmente do sistema legado (calculadora.php): origem fixa em
 * Itajaí/SC, bloqueio de transportadoras por trilho, TDEs por transportadora,
 * taxa de despacho da Braspress para CPF e adicional de área rural.
 */

export const ORIGEM = { uf: "SC", cidade: "Itajaí", cep: "88313000" };

export const CNPJ = {
  BRASPRESS: "48740351012767",
  SAO_MIGUEL: "00428307001593",
  TRANSCARAPIA: "00904848000307",
  SCHREIBER: "10349430000339",
};

/** Códigos de trilho considerados na cotação. */
export const COD_TRILHOS = [
  "200000028", "100000024", "100000020", "100000261", "100000320", "100000321",
  "200000051", "200000021", "200000080", "100000260", "200000383", "200000384",
  "200000505", "200000522", "200000586",
];

/** Trilhos que bloqueiam a Braspress. */
export const TRILHOS_BRASPRESS = [
  "200000028", "100000024", "100000020", "100000261", "200000051", "200000021",
  "200000080", "100000260", "200000383", "200000384", "200000505", "200000522",
  "200000586",
];

/** Trilhos que bloqueiam a São Miguel. */
export const TRILHOS_SAO_MIGUEL = [
  "200000028", "200000051", "200000021", "200000080", "100000260", "200000384",
  "200000505", "200000522",
];

/** Trilhos que geram TDE de R$ 250 na Schreiber. */
export const TRILHOS_SCHREIBER_TDE = ["200000586", "100000320", "100000321"];

/** Trilhos que geram TDE de R$ 300 na Transcarapia. */
export const TRILHOS_TRANSCARAPIA = [
  "200000028", "200000051", "200000021", "200000080", "100000260", "200000384",
  "200000505", "200000522", "100000320", "100000321", "100000327",
];

export const TDE_SCHREIBER = 250;
export const TDE_TRANSCARAPIA = 300;
export const ADICIONAL_AREA_RURAL = 300;

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const soDigitos = (s?: string) => (s ?? "").replace(/\D/g, "");

/** Normaliza o código do produto (remove zeros à esquerda). */
export function normalizarCodigo(codigo: string) {
  return String(codigo ?? "").replace(/^0+/, "");
}

/** Primeiro trilho do carrinho presente na lista oficial. */
export function detectarTrilho(codigosCarrinho: string[]): string | null {
  for (const c of codigosCarrinho) if (COD_TRILHOS.includes(c)) return c;
  return null;
}

/** false = transportadora bloqueada para o trilho do carrinho. */
export function filtraFretes(codigoTrilho: string | null, cnpj: string): boolean {
  const tem = (lista: string[]) => codigoTrilho != null && lista.includes(codigoTrilho);
  if (tem(TRILHOS_BRASPRESS) && cnpj === CNPJ.BRASPRESS) return false;
  if (tem(TRILHOS_SAO_MIGUEL) && cnpj === CNPJ.SAO_MIGUEL) return false;
  return true;
}

export type ContextoFrete = {
  codigosCarrinho: string[];
  documento?: string | undefined;
  /** S = entrega normal · D = dedicado · G = grátis · N = retirada */
  tipoEntrega: "S" | "D" | "G" | "N";
  areaRural?: boolean | undefined;
};

export type OpcaoBruta = {
  transportadoraId?: string;
  transportadoraDocumento?: string;
  nome?: string;
  total?: number;
  sla?: number;
  componentes?: { descricao?: string; valor?: number }[];
};

export type OpcaoFrete = {
  id_transportadora: string;
  transportadora: string;
  transportadoraDocumento: string;
  total: number;
  prazo: number;
  /** Ajustes aplicados sobre o valor bruto da cotação. */
  ajustes: string[];
};

/** Aplica SLA → prazo em dias e as taxas específicas da 2P. */
export function aplicarRegras(opt: OpcaoBruta, ctx: ContextoFrete): OpcaoFrete {
  const cnpj = String(opt.transportadoraDocumento ?? "");
  const sla = Number(opt.sla ?? 0);
  const prazo = sla > 24 ? Math.round(sla / 24) : 1;
  const ajustes: string[] = [];
  let total = round2(Number(opt.total ?? 0));

  const doc = soDigitos(ctx.documento);
  if (cnpj === CNPJ.BRASPRESS && doc.length > 0 && doc.length <= 11) {
    const desp = (opt.componentes ?? []).find((c) => c.descricao === "DESPACHO");
    if (desp) {
      total += Number(desp.valor ?? 0);
      ajustes.push(`Despacho Braspress (CPF): +${round2(Number(desp.valor ?? 0))}`);
    }
  }
  if (cnpj === CNPJ.SCHREIBER && ctx.codigosCarrinho.some((c) => TRILHOS_SCHREIBER_TDE.includes(c))) {
    total += TDE_SCHREIBER;
    ajustes.push(`TDE Schreiber: +${TDE_SCHREIBER}`);
  }
  if (cnpj === CNPJ.TRANSCARAPIA && ctx.codigosCarrinho.some((c) => TRILHOS_TRANSCARAPIA.includes(c))) {
    total += TDE_TRANSCARAPIA;
    ajustes.push(`TDE Transcarapia: +${TDE_TRANSCARAPIA}`);
  }
  if (ctx.tipoEntrega === "S" && ctx.areaRural) {
    total += ADICIONAL_AREA_RURAL;
    ajustes.push(`Área rural: +${ADICIONAL_AREA_RURAL}`);
  }

  return {
    id_transportadora: String(opt.transportadoraId ?? ""),
    transportadora: String(opt.nome ?? "Transportadora"),
    transportadoraDocumento: cnpj,
    total: round2(total),
    prazo,
    ajustes,
  };
}
