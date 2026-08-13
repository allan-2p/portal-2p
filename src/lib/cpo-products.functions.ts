import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CpoProductAdmin = {
  id: string;
  codigo: string | null;
  nome: string;
  potencia: string | null;
  custo: number;
  ativo: boolean;
  ncm_id?: string | null;
};

/**
 * Produtos ativos com custo — usados no cálculo de CMV, margem e comissão da
 * proposta. Restrito a usuários autenticados do portal.
 */
export const listCpoProductsForProposal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ products: CpoProductAdmin[] }> => {
    const { data, error } = await context.supabase
      .from("cpo_products")
      .select("id, codigo, nome, potencia, custo, ativo, ncm_id")
      .order("nome");
    if (error) throw new Error(error.message);
    return {
      products: (data ?? []).map((p: any) => ({
        id: p.id,
        codigo: p.codigo ?? null,
        nome: p.nome,
        potencia: p.potencia,
        custo: Number(p.custo),
        ativo: p.ativo,
        ncm_id: p.ncm_id ?? null,
      })),
    };
  });


/** Lista de produtos com custo — restrita a administradores. */
export const adminListCpoProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ products: CpoProductAdmin[] }> => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin");
    if (roleError || !isAdmin) throw new Error("Forbidden: admin role required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("cpo_products")
      .select("id, codigo, nome, potencia, custo, ativo")
      .order("nome");
    if (error) throw new Error(error.message);

    return {
      products: (data ?? []).map((p: any) => ({
        id: p.id,
        codigo: p.codigo ?? null,
        nome: p.nome,
        potencia: p.potencia,
        custo: Number(p.custo),
        ativo: p.ativo,
      })),
    };
  });
