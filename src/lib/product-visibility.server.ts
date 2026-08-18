import type { SupabaseClient } from "@supabase/supabase-js";

const ABERTAS = ["Salvo", "Enviada"];

/** Conta propostas de Carregadores em aberto que já usam o produto. */
export async function countOpenProposalsWithProduct(
  supabase: SupabaseClient<any, any, any>,
  productId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("propostas")
    .select("id, itens")
    .in("status", ABERTAS)
    .limit(1000);
  if (error) return 0;
  return (data ?? []).filter((p: any) => {
    const itens = Array.isArray(p.itens) ? p.itens : [];
    return itens.some(
      (i: any) => i?.produto_id === productId || i?.produtoId === productId || i?.id === productId,
    );
  }).length;
}
