// Regras únicas de visibilidade de produto (catálogo `sap_produtos`).
// Usadas pela Administração (Produtos), pela Gestão de Produtos do Solar e
// de Carregadores e por tudo que depende do catálogo em Carregadores
// (propostas, impostos/NCM, CMV, margem e comissão).

export type Visibilidade = "solar" | "carregadores" | "ambos";

export const VISIBILIDADE_LABELS: Record<Visibilidade, string> = {
  solar: "2P Solar",
  carregadores: "2P Carregadores",
  ambos: "Grupo 2P",
};

export const VISIBILIDADE_OPTIONS: { value: Visibilidade; label: string }[] = [
  { value: "solar", label: VISIBILIDADE_LABELS.solar },
  { value: "carregadores", label: VISIBILIDADE_LABELS.carregadores },
  { value: "ambos", label: VISIBILIDADE_LABELS.ambos },
];

/** Aparece no portal 2P Carregadores (propostas, DRE, comissões). */
export function showsInCarregadores(v: string | null | undefined): boolean {
  return v === "carregadores" || v === "ambos";
}

/** Aparece no portal 2P Solar. */
export function showsInSolar(v: string | null | undefined): boolean {
  return v === "solar" || v === "ambos";
}

export type ProductVisibilityContext = {
  origem?: string | null;
  custo?: number | null;
  ncm_id?: string | null;
  /** Propostas de Carregadores em aberto que já usam o produto. */
  propostasAbertas?: number;
};

/**
 * Bloqueia combinações inválidas. Retorna a mensagem do impedimento ou null.
 *
 * - Para aparecer em Carregadores o produto precisa de NCM (define IPI,
 *   PIS/COFINS, ST e DIFAL) e de custo > 0 (base de CMV, margem e comissão).
 * - Não é possível tirar de Carregadores um produto criado manualmente lá
 *   (não existe no SAP, ficaria órfão) nem um produto usado em propostas
 *   em aberto.
 */
export function validateVisibilidadeChange(
  next: Visibilidade,
  ctx: ProductVisibilityContext,
): string | null {
  const entraNoCarregadores = showsInCarregadores(next);

  if (entraNoCarregadores) {
    if (!ctx.ncm_id) {
      return "Defina o NCM do produto antes de liberá-lo para 2P Carregadores — ele define IPI, PIS/COFINS, ST e DIFAL das propostas.";
    }
    if (!ctx.custo || Number(ctx.custo) <= 0) {
      return "Defina o custo do produto antes de liberá-lo para 2P Carregadores — o custo é a base de CMV, margem e comissão.";
    }
    return null;
  }

  if (ctx.origem === "manual") {
    return "Produto criado manualmente em 2P Carregadores não pode sair dessa instância. Use 2P Carregadores ou Grupo 2P.";
  }
  if ((ctx.propostasAbertas ?? 0) > 0) {
    return `Produto está em ${ctx.propostasAbertas} proposta(s) de Carregadores em aberto. Finalize ou cancele essas propostas antes de removê-lo da instância.`;
  }
  return null;
}
