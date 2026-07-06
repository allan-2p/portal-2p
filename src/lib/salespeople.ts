// Carteira de vendedores considerada nas visões de Segmentação, Dashboards
// e demais painéis que precisam da mesma base consistente.
export const CARTEIRA_OWNER_IDS = [
  "005U400000FDLnbIAH", // Matheus Nunes
  "005Dn000007GxFcIAK", // Gustavo Chahad
  "005Dn000007GxFrIAK", // Bruno Amaral
  "005U400000B5NYjIAN", // Raphael Vaz
] as const;

export const CARTEIRA_OWNER_SET = new Set<string>(CARTEIRA_OWNER_IDS);

export const CARTEIRA_OWNER_NAMES: Record<string, string> = {
  "005U400000FDLnbIAH": "Matheus Nunes",
  "005Dn000007GxFcIAK": "Gustavo Chahad",
  "005Dn000007GxFrIAK": "Bruno Amaral",
  "005U400000B5NYjIAN": "Raphael Vaz",
};
