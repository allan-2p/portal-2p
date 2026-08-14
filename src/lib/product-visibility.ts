// Regras únicas de visibilidade de produto (catálogo `sap_produtos`).
// Usadas pela Administração (Produtos), pela Gestão de Produtos do Solar e
// de Carregadores e por tudo que depende do catálogo em Carregadores
// (propostas, impostos/NCM, CMV, margem e comissão).

export type Visibilidade = "nenhuma" | "solar" | "carregadores" | "ambos";

export const VISIBILIDADE_LABELS: Record<Visibilidade, string> = {
  nenhuma: "Sem visibilidade",
  solar: "2P Solar",
  carregadores: "2P Carregadores",
  ambos: "Grupo 2P",
};

export const VISIBILIDADE_OPTIONS: { value: Visibilidade; label: string }[] = [
  { value: "nenhuma", label: VISIBILIDADE_LABELS.nenhuma },
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
  /** NCM textual vindo do SAP (ZMMR059) — é a fonte real do NCM no portal. */
  ncm_codigo?: string | null;
  /** Propostas de Carregadores em aberto que já usam o produto. */
  propostasAbertas?: number;
};

/**
 * Bloqueia combinações inválidas de visibilidade. Retorna a mensagem do
 * impedimento ou null.
 *
 * NCM e custo NÃO bloqueiam aqui: liberar o produto para 2P Carregadores é
 * decisão de Configurações › Objetos e Campos. Ele entra na Gestão de Produtos
 * de Carregadores como inativo e só pode ser ativado lá depois do NCM e do
 * custo definidos (ver `validateAtivacaoCarregadores`).
 *
 * - Não é possível tirar de Carregadores um produto criado manualmente lá
 *   (não existe no SAP, ficaria órfão) nem um produto usado em propostas
 *   em aberto.
 */
export function validateVisibilidadeChange(
  next: Visibilidade,
  ctx: ProductVisibilityContext,
): string | null {
  if (showsInCarregadores(next)) return null;

  if (ctx.origem === "manual") {
    return "Produto criado manualmente em 2P Carregadores não pode sair dessa instância. Use 2P Carregadores ou Grupo 2P.";
  }
  if ((ctx.propostasAbertas ?? 0) > 0) {
    return `Produto está em ${ctx.propostasAbertas} proposta(s) de Carregadores em aberto. Finalize ou cancele essas propostas antes de removê-lo da instância.`;
  }
  return null;
}

/**
 * Regras para ATIVAR um produto na Gestão de Produtos de 2P Carregadores.
 * Retorna a mensagem do impedimento ou null.
 */
export function validateAtivacaoCarregadores(ctx: ProductVisibilityContext): string | null {
  const temNcm = !!(ctx.ncm_id || (ctx.ncm_codigo ?? "").trim());
  if (!temNcm) {
    return "O NCM deste produto ainda não veio do SAP. Ajuste o cadastro do material no SAP e rode a sincronização — o NCM define IPI, PIS/COFINS, ST e DIFAL.";
  }

  if (!ctx.custo || Number(ctx.custo) <= 0) {
    return "Defina o custo do produto antes de ativá-lo em 2P Carregadores — o custo é a base de CMV, margem e comissão.";
  }
  return null;
}

/** Produto pronto para ser ativado/usado em Carregadores. */
export function podeAtivarEmCarregadores(ctx: ProductVisibilityContext): boolean {
  return validateAtivacaoCarregadores(ctx) === null;
}
