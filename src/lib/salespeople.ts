// Carteira de vendedores considerada nas visões de Segmentação, Dashboards
// e demais painéis que precisam da mesma base consistente.
export const CARTEIRA_OWNER_IDS = [
  "005U400000FDLnbIAH", // Matheus Nunes
  "005Dn000007GxFcIAK", // Gustavo Chahad
  "005U400000B5NYjIAN", // Raphael Vaz
] as const;

export const CARTEIRA_OWNER_SET = new Set<string>(CARTEIRA_OWNER_IDS);

export const CARTEIRA_OWNER_NAMES: Record<string, string> = {
  "005U400000FDLnbIAH": "Matheus Nunes",
  "005Dn000007GxFcIAK": "Gustavo Chahad",
  "005U400000B5NYjIAN": "Raphael Vaz",
};

// Consultores que saíram da carteira Solar — não devem aparecer nos filtros
// de vendedor das telas de Perfil de Cliente / Segmentação.
export const FORMER_OWNER_IDS = new Set<string>([
  "005Dn000007GxFrIAK", // Bruno Amaral (migrado para 2P Carregadores)
]);

export const FORMER_OWNER_NAMES = new Set<string>(["Bruno Amaral"]);

