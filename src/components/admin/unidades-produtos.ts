// Constantes das unidades usadas na Gestão de Produtos / Estoque.
// Ficam fora do componente para não quebrar o Fast Refresh do Vite
// (um módulo de componente só deve exportar componentes).

export type UnidadeProdutos = "solar" | "carregadores" | "grupo2p";

export const UNIDADE_LABEL: Record<UnidadeProdutos, string> = {
  solar: "2P Solar",
  carregadores: "2P Carregadores",
  grupo2p: "Grupo 2P",
};
