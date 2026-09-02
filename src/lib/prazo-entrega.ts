/**
 * Prazo de entrega (dias úteis) exibido na proposta — olhinho, resumo da
 * finalização e PDF usam exatamente a mesma frase.
 *
 * Origem do prazo (coluna `propostas.frete_prazo`):
 * - CIF: automático, é o SLA da transportadora escolhida na cotação;
 * - DEDICADO: informado manualmente pelo vendedor na etapa de frete;
 * - FOB: não há prazo do nosso lado.
 */
export function textoPrazoEntrega(
  prazo: number | null | undefined,
  freteMod?: string | null,
): string {
  const dias = Number(prazo ?? 0);
  if (Number.isFinite(dias) && dias > 0) {
    return `${dias} ${dias === 1 ? "dia útil" : "dias úteis"} após a confirmação do pedido`;
  }
  const mod = String(freteMod ?? "").trim();
  return `A confirmar na aprovação, conforme modalidade ${mod || "de frete"}.`;
}
