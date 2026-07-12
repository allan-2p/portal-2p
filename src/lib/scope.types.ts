export type FilterScope = "geral" | "pre_vendas" | "carteira" | "individual";
export type SFTeam = "pre_vendas" | "carteira";

export type MyScope = {
  scope: FilterScope;
  sf_user_id: string | null;
  /** IDs de vendedores SF que o usuário pode ver. `null` = sem restrição (Geral). */
  allowed_sf_ids: string[] | null;
};