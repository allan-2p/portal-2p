import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/guards.server";

export type CpoProductAdmin = {
  id: string;
  codigo: string | null;
  nome: string;
  custo: number;
  ativo: boolean;
  ncm_id?: string | null;
};

/** Colunas do catálogo único do portal (`sap_produtos`). */
const COLS = "id, codigo, descricao, custo, ativo, ncm_id, visibilidade";

function toProduct(p: any): CpoProductAdmin {
  return {
    id: p.id,
    codigo: p.codigo ?? null,
    nome: p.descricao,
    custo: Number(p.custo ?? 0),
    ativo: p.ativo,
    ncm_id: p.ncm_id ?? null,
  };
}

/**
 * Produtos ativos com custo — usados no cálculo de CMV, margem e comissão da
 * proposta. Origem única: tabela `sap_produtos` do portal (alimentada pelo SAP
 * e pelas edições manuais), filtrada pela visibilidade de Carregadores.
 */
export const listCpoProductsForProposal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ products: CpoProductAdmin[] }> => {
    const { data, error } = await context.supabase
      .from("sap_produtos")
      .select(COLS)
      .in("visibilidade", ["carregadores", "ambos"])
      .eq("ativo", true)
      .order("descricao");
    if (error) throw new Error(error.message);
    return { products: (data ?? []).map(toProduct) };
  });


/** Lista de produtos com custo — restrita a administradores. */
export const adminListCpoProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ products: CpoProductAdmin[] }> => {
    await requireFeature(context, {
      instance: "carregadores",
      feature: "cpo.produtos",
      action: "visualizar",
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("sap_produtos")
      .select(COLS)
      .in("visibilidade", ["carregadores", "ambos"])
      .order("descricao");
    if (error) throw new Error(error.message);

    return { products: (data ?? []).map(toProduct) };
  });
