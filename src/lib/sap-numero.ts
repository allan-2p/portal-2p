/** Exibe números do SAP (VBELN etc.) sem os zeros à esquerda. */
export function formatSapNumero(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (!/^\d+$/.test(s)) return s;
  const semZeros = s.replace(/^0+/, "");
  return semZeros || "0";
}

/** Exibe o número da proposta/pedido sem os zeros à esquerda (armazenado com padding). */
export function formatPropostaNumero(v: unknown): string {
  return formatSapNumero(v);
}

/**
 * Normaliza para GRAVAÇÃO: números do SAP (VBELN/NUM_NF) sem zeros à esquerda.
 * Nunca use na chave da NF-e (44 dígitos) nem na série.
 */
export function semZerosEsquerda(v: unknown): string {
  return formatSapNumero(v);
}

/** Re-padroniza o VBELN para os 10 dígitos que o SAP usa nos envelopes SOAP. */
export function vbelnSap(v: unknown): string {
  const s = formatSapNumero(v);
  return /^\d+$/.test(s) ? s.padStart(10, "0") : s;
}
