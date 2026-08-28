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
