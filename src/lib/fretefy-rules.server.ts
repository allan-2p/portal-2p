/**
 * Motor de aplicação das regras de frete da 2P sobre as cotações do Fretefy.
 *
 * O catálogo de regras (transportadoras, trilhos bloqueados, TDEs) vive em
 * `fretefy-regras.ts` para poder ser exibido no painel de Integrações.
 */

import {
  ADICIONAL_AREA_RURAL,
  CNPJ,
  COD_TRILHOS,
  POTENCIA_MAX_BRASPRESS_KW,
  TDE_SCHREIBER,
  TDE_TRANSCARAPIA,
  TRILHOS_BRASPRESS,
  TRILHOS_SAO_MIGUEL,
  TRILHOS_SCHREIBER_TDE,
  TRILHOS_TRANSCARAPIA,
  normalizarCodigo,
  temCarregadorAcimaDe,
} from "./fretefy-regras";

export * from "./fretefy-regras";

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

/**
 * false = transportadora bloqueada para o carrinho.
 * Basta um item bloqueado para a transportadora sair da lista.
 */
export function filtraFretes(
  codigosCarrinho: string[],
  cnpj: string,
  nomesCarrinho: string[] = [],
): boolean {
  const tem = (lista: string[]) => codigosCarrinho.some((c) => lista.includes(c));
  if (cnpj === CNPJ.BRASPRESS) {
    if (tem(TRILHOS_BRASPRESS)) return false;
    if (temCarregadorAcimaDe(nomesCarrinho, POTENCIA_MAX_BRASPRESS_KW)) return false;
  }
  if (cnpj === CNPJ.SAO_MIGUEL && tem(TRILHOS_SAO_MIGUEL)) return false;
  return true;
}

export type ContextoFrete = {
  codigosCarrinho: string[];
  nomesCarrinho?: string[] | undefined;
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
