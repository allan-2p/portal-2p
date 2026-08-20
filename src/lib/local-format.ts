/** Formatação padrão de localidade (cidade + UF) usada em telas e PDFs. */

/** Separador oficial entre cidade e UF em todo o portal. */
export const CIDADE_UF_SEP = " / ";

/**
 * Formata "Cidade / UF" de forma consistente.
 * Retorna o fallback quando nenhum dos dois estiver preenchido.
 */
export function cidadeUf(
  cidade?: string | null,
  uf?: string | null,
  fallback = "—",
): string {
  const c = String(cidade ?? "").trim();
  const u = String(uf ?? "").trim().toUpperCase();
  const txt = [c, u].filter(Boolean).join(CIDADE_UF_SEP);
  return txt || fallback;
}

/** Mesma formatação, com o CEP anexado quando houver. */
export function cidadeUfCep(
  cidade?: string | null,
  uf?: string | null,
  cep?: string | null,
  fallback = "—",
): string {
  const base = cidadeUf(cidade, uf, "");
  const c = String(cep ?? "").trim();
  const txt = [base, c].filter(Boolean).join(" — ");
  return txt || fallback;
}
