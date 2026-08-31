/**
 * Trava entre forma de pagamento e condição de pagamento (ZTERM do SAP).
 *
 * Regra do comercial: a forma escolhida já define a condição, exceto no
 * boleto a prazo — só nesse caso o consultor escolhe o prazo livremente.
 *
 *   Cartão de crédito → 2PCC (CARTAO)
 *   Pix               → 2PPX (PIX)
 *   Boleto à vista    → 2P00 (A VISTA)
 *   Financiamento     → 2P00 (A VISTA)
 *   Boleto a prazo    → livre
 */
export type CondicaoTravada = { codigo: string; descricao: string };

const MAPA: Record<string, CondicaoTravada> = {
  boleto_vista: { codigo: "2P00", descricao: "A VISTA" },
  financiamento: { codigo: "2P00", descricao: "A VISTA" },
  pix: { codigo: "2PPX", descricao: "PIX" },
  cartao_credito: { codigo: "2PCC", descricao: "CARTAO" },
};

/** Condição obrigatória da forma; `null` quando o consultor pode escolher. */
export function condicaoDaFormaPagamento(forma: string | null | undefined): CondicaoTravada | null {
  return MAPA[String(forma ?? "")] ?? null;
}

/** Texto de apoio exibido abaixo do seletor travado. */
export function motivoCondicaoTravada(forma: string | null | undefined): string | null {
  const cond = condicaoDaFormaPagamento(forma);
  if (!cond) return null;
  return `Definida automaticamente pela forma de pagamento (${cond.descricao}). Para escolher outro prazo, use boleto a prazo.`;
}
