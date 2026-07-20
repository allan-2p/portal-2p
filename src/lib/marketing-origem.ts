// Categoriza um valor de Origem/Sub-Origem do Salesforce como "paid" ou "organic".
// Heurística conservadora: reconhece explicitamente ads / mídia paga; o resto é
// considerado orgânico (que é o comportamento default para origens não classificadas).

const PAID_RE =
  /\b(ads?|pago|paga|paid|pmax|meta|facebook|fb|instagram\s*ads?|ig\s*ads?|google\s*ads?|linkedin\s*ads?|tiktok\s*ads?|youtube\s*ads?|patrocinad[oa]|trafego\s*pago|tráfego\s*pago|remarketing|display)\b/i;

const ORGANIC_HINT_RE =
  /\b(org[âa]nico|indica[çc][ãa]o|direto|site|blog|youtube(?!\s*ads)|instagram(?!\s*ads)|whatsapp|e-?mail\s*mkt|newsletter|seo|orgânica|organica)\b/i;

export function classifyOrigem(origem: string | null | undefined): "paid" | "organic" {
  if (!origem) return "organic";
  if (PAID_RE.test(origem)) return "paid";
  if (ORGANIC_HINT_RE.test(origem)) return "organic";
  return "organic";
}
