/**
 * Motivos de cancelamento de pedido — MESMOS valores da picklist
 * `Loss_Reason__c` do Salesforce (imagem de referência da org). Ao cancelar,
 * o motivo é gravado em `propostas.motivo_cancelamento`, aparece no detalhe
 * ("olhinho") e é enviado à oportunidade no Salesforce.
 */
export const MOTIVOS_CANCELAMENTO = [
  "Pedido Incorreto",
  "Problema Com Pagamento",
  "Pedido Duplicado",
  "Erro de Emissão de NF",
  "Erro Interno",
  "Desistiu da Compra",
] as const;

export type MotivoCancelamento = (typeof MOTIVOS_CANCELAMENTO)[number];

export function motivoCancelamentoValido(v: unknown): v is MotivoCancelamento {
  return typeof v === "string" && (MOTIVOS_CANCELAMENTO as readonly string[]).includes(v);
}

/** Tamanho mínimo/máximo da observação escrita pelo vendedor ao cancelar. */
export const OBS_CANCELAMENTO_MIN = 15;
export const OBS_CANCELAMENTO_MAX = 500;

/**
 * Valida a observação do cancelamento (texto livre obrigatório). Devolve o
 * texto já normalizado; lança erro com mensagem amigável quando inválido.
 */
export function validarObsCancelamento(v: unknown): string {
  const t = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (!t) throw new Error("Escreva uma observação explicando o cancelamento.");
  if (t.length < OBS_CANCELAMENTO_MIN) {
    throw new Error(`A observação do cancelamento precisa ter pelo menos ${OBS_CANCELAMENTO_MIN} caracteres.`);
  }
  return t.slice(0, OBS_CANCELAMENTO_MAX);
}
