/**
 * Motor de aplicação das regras de frete da 2P sobre as cotações do Fretefy.
 *
 * O catálogo de regras (transportadoras, trilhos bloqueados, TDEs) vive em
 * `fretefy-regras.ts` para poder ser exibido no painel de Integrações.
 */

import {
  CNPJ,
  COD_TRILHOS,
  FRETE_REGRAS_PADRAO,
  mesclarFreteRegras,
  temCarregadorAcimaDe,
  type FreteRegrasConfig,
  type UnidadeFrete,
} from "./fretefy-regras";

export * from "./fretefy-regras";

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const soDigitos = (s?: string) => (s ?? "").replace(/\D/g, "");

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
  cfg: FreteRegrasConfig = FRETE_REGRAS_PADRAO,
  unidade?: UnidadeFrete,
): boolean {
  const regra = cfg.transportadoras[cnpj];
  // Paridade com a plataforma antiga: os bloqueios olham APENAS o trilho
  // detectado no carrinho, não todos os itens.
  const trilho = detectarTrilho(codigosCarrinho);
  const tem = (lista: string[]) => !!trilho && lista.includes(trilho);
  // Regras de trilho valem na 2P Solar; a regra de potência vale nos carregadores.
  const usaTrilhos = unidade !== "carregadores";
  const usaCarregadores = unidade !== "solar";
  if (cnpj === CNPJ.BRASPRESS) {
    if (usaTrilhos && regra?.ativa !== false && tem(regra?.trilhos ?? [])) return false;
    if (
      usaCarregadores &&
      cfg.bloqueioCarregadorBraspress &&
      temCarregadorAcimaDe(nomesCarrinho, cfg.potenciaMaxBraspressKw)
    )
      return false;
  }
  if (
    usaTrilhos &&
    cnpj === CNPJ.SAO_MIGUEL &&
    regra?.ativa !== false &&
    tem(regra?.trilhos ?? [])
  )
    return false;
  return true;
}

/** Lê as regras personalizadas no banco; cai no padrão em qualquer falha. */
export async function carregarFreteRegras(): Promise<FreteRegrasConfig> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("frete_regras_config")
      .select("config")
      .eq("id", 1)
      .maybeSingle();
    return mesclarFreteRegras(data?.config);
  } catch {
    return FRETE_REGRAS_PADRAO;
  }
}

export type ContextoFrete = {
  codigosCarrinho: string[];
  nomesCarrinho?: string[] | undefined;
  documento?: string | undefined;
  /** S = entrega normal · D = dedicado · G = grátis · N = retirada */
  tipoEntrega: "S" | "D" | "G" | "N";
  areaRural?: boolean | undefined;
  /** Unidade de negócio da proposta — define quais regras se aplicam. */
  unidade?: UnidadeFrete | undefined;
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
export function aplicarRegras(
  opt: OpcaoBruta,
  ctx: ContextoFrete,
  cfg: FreteRegrasConfig = FRETE_REGRAS_PADRAO,
): OpcaoFrete {
  const cnpj = String(opt.transportadoraDocumento ?? "");
  const sla = Number(opt.sla ?? 0);
  const prazo = sla > 24 ? Math.round(sla / 24) : 1;
  const ajustes: string[] = [];
  let total = round2(Number(opt.total ?? 0));

  const doc = soDigitos(ctx.documento);
  if (cnpj === CNPJ.BRASPRESS && cfg.despachoBraspressCpf && doc.length > 0 && doc.length <= 11) {
    const desp = (opt.componentes ?? []).find((c) => c.descricao === "DESPACHO");
    if (desp) {
      total += Number(desp.valor ?? 0);
      ajustes.push(`Despacho Braspress (CPF): +${round2(Number(desp.valor ?? 0))}`);
    }
  }
  for (const [alvo, nome] of [
    [CNPJ.SCHREIBER, "Schreiber"],
    [CNPJ.TRANSCARAPIA, "Transcarapia"],
  ] as const) {
    const regra = cfg.transportadoras[alvo];
    if (
      ctx.unidade !== "carregadores" &&
      cnpj === alvo &&
      regra?.ativa !== false &&
      (() => {
        const trilho = detectarTrilho(ctx.codigosCarrinho);
        return !!trilho && (regra?.trilhos ?? []).includes(trilho);
      })()
    ) {
      total += regra?.adicional ?? 0;
      ajustes.push(`TDE ${nome}: +${regra?.adicional ?? 0}`);
    }
  }
  if (ctx.tipoEntrega === "S" && ctx.areaRural) {
    total += cfg.adicionalAreaRural;
    ajustes.push(`Área rural: +${cfg.adicionalAreaRural}`);
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
