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
