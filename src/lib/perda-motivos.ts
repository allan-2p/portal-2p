/**
 * Motivos de perda de oportunidade — MESMOS valores da picklist
 * `Loss_Reason__c` do Salesforce. Ao "dar perda" numa proposta ainda em
 * rascunho ("Salvo"), o motivo é gravado em `propostas.motivo_perda`, a
 * descrição em `propostas.motivo_perda_obs` e ambos vão para a oportunidade
 * (`Loss_Reason__c` e `Descri_o_do_Motivo_de_Perda__c`), com o estágio
 * mudando para "Oportunidade Perdida".
 */
export const MOTIVOS_PERDA = [
  "Prazo de Entrega",
  "Prazo de Pagamento",
  "Preço do Produto",
  "Preço do Frete",
  "Oportunidade filha",
  "Solicitação incorreta do cliente",
  "Cliente Final Desistiu",
  "Cliente ainda com estoque",
  "Cliente fechou com a extrusora",
  "Pedido Excluído",
  "Comprou 2P no Kit",
  "Comprou concorrente no Kit",
  "Sem Retorno",
  "Consulta de Tabela de Preço",
  "Características do nosso produto",
  "Oportunidade Mecanicamente Perdida",
] as const;

export type MotivoPerda = (typeof MOTIVOS_PERDA)[number];

/** Motivos visíveis apenas para o Administrador do Sistema. */
export const MOTIVOS_PERDA_ADMIN: readonly string[] = ["Oportunidade Mecanicamente Perdida"];

export function motivoPerdaValido(v: unknown): v is MotivoPerda {
  return typeof v === "string" && (MOTIVOS_PERDA as readonly string[]).includes(v);
}

export function motivoPerdaSomenteAdmin(v: unknown): boolean {
  return typeof v === "string" && MOTIVOS_PERDA_ADMIN.includes(v);
}

/** Motivos que o usuário pode escolher (admin vê todos). */
export function motivosPerdaPara(isAdmin: boolean): string[] {
  return (MOTIVOS_PERDA as readonly string[]).filter((m) => isAdmin || !motivoPerdaSomenteAdmin(m));
}

/** Tamanho mínimo/máximo da descrição escrita pelo vendedor. */
export const OBS_PERDA_MIN = 8;
export const OBS_PERDA_MAX = 500;

/**
 * A org do Salesforce tem uma regra de validação ("Sua observação é inválida.
 * Necessário detalhar o motivo de perda.") que recusa descrições com menos de
 * 4 palavras em `Descri_o_do_Motivo_de_Perda__c`. Validar aqui evita que a
 * perda fique registrada só no portal e a oportunidade siga aberta no CRM.
 */
export const OBS_PERDA_MIN_PALAVRAS = 4;

/** Palavras da descrição (mesma contagem usada pela regra do Salesforce). */
export function palavrasObsPerda(v: unknown): number {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.split(/\s+/).length : 0;
}

/** A descrição atende o mínimo de caracteres e de palavras? */
export function obsPerdaValida(v: unknown): boolean {
  const t = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  return t.length >= OBS_PERDA_MIN && palavrasObsPerda(t) >= OBS_PERDA_MIN_PALAVRAS;
}

/**
 * Valida a descrição da perda (texto livre obrigatório). Devolve o texto já
 * normalizado; lança erro com mensagem amigável quando inválido.
 */
export function validarObsPerda(v: unknown): string {
  const t = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (!t) throw new Error("Descreva o motivo da perda.");
  if (t.length < OBS_PERDA_MIN) {
    throw new Error(`A descrição da perda precisa ter pelo menos ${OBS_PERDA_MIN} caracteres.`);
  }
  if (palavrasObsPerda(t) < OBS_PERDA_MIN_PALAVRAS) {
    throw new Error(
      `Detalhe melhor o motivo da perda: escreva pelo menos ${OBS_PERDA_MIN_PALAVRAS} palavras (o CRM recusa descrições curtas).`,
    );
  }
  return t.slice(0, OBS_PERDA_MAX);
}


/** A perda só é possível enquanto a proposta é rascunho ("Salvo"). */
export function podeDarPerda(status: string | null | undefined, perdida?: boolean): boolean {
  return String(status ?? "") === "Salvo" && !perdida;
}
