import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/guards.server";
import { recordModeration } from "@/lib/moderation-audit.server";
import { precoSugeridoPadrao } from "@/lib/carregadores";

export type CarregadoresProductAdmin = {
  id: string;
  codigo: string | null;
  nome: string;
  custo: number;
  preco_sugerido: number;
  ativo: boolean;
  ncm_id?: string | null;
  ncm_codigo?: string | null;
  imagem_path?: string | null;
};

/** Colunas do catálogo único do portal (`sap_produtos`). */
const COLS =
  "id, codigo, descricao, custo, preco_sugerido, ativo, ncm_id, ncm_codigo, visibilidade, imagem_path";

function toProduct(p: any): CarregadoresProductAdmin {
  return {
    id: p.id,
    codigo: p.codigo ?? null,
    nome: p.descricao,
    custo: Number(p.custo ?? 0),
    preco_sugerido: Number(p.preco_sugerido ?? 0) || precoSugeridoPadrao(Number(p.custo ?? 0)),
    ativo: p.ativo,
    ncm_id: p.ncm_id ?? null,
    ncm_codigo: p.ncm_codigo ?? null,
    imagem_path: p.imagem_path ?? null,
  };
}

/**
 * Produtos ativos com custo — usados no cálculo de CMV, margem e comissão da
 * proposta. Origem única: tabela `sap_produtos` do portal (alimentada pelo SAP
 * e pelas edições manuais), filtrada pela visibilidade de Carregadores.
 */
export const listCarregadoresProductsForProposal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ products: CarregadoresProductAdmin[] }> => {
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
export const adminListCarregadoresProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ products: CarregadoresProductAdmin[] }> => {
    await requireFeature(context, {
      instance: "carregadores",
      feature: "carregadores.produtos",
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

/**
 * Edição do produto na Gestão de Produtos (nome, custo, preço sugerido, status).
 * A gravação acontece no servidor: a tabela `sap_produtos` não aceita escrita
 * direta pelo navegador, o que fazia a alteração ser descartada em silêncio.
 */
export const updateCarregadoresProduct = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        nome: z.string().trim().min(1, "Informe o nome do produto."),
        custo: z.number().nonnegative(),
        preco_sugerido: z.number().nonnegative(),
        ativo: z.boolean(),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ product: CarregadoresProductAdmin }> => {
    await requireFeature(context, {
      instance: "carregadores",
      feature: "carregadores.produtos",
      action: "moderar",
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: atual, error: readError } = await supabaseAdmin
      .from("sap_produtos")
      .select(COLS)
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!atual) throw new Error("Produto não encontrado.");

    if (data.ativo) {
      const { validateAtivacaoCarregadores } = await import("@/lib/product-visibility");
      const impedimento = validateAtivacaoCarregadores({
        custo: data.custo,
        ncm_id: (atual as any).ncm_id ?? null,
        ncm_codigo: (atual as any).ncm_codigo ?? null,
      });
      if (impedimento) throw new Error(impedimento);
    }

    const { data: updated, error } = await supabaseAdmin
      .from("sap_produtos")
      .update({
        descricao: data.nome,
        custo: data.custo,
        preco_sugerido: data.preco_sugerido,
        ativo: data.ativo,
      })
      .eq("id", data.id)
      .select(COLS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Não foi possível salvar o produto.");

    await recordModeration(context, {
      area: "carregadores_produtos",
      instanceId: "carregadores",
      action: "atualizou",
      target: data.nome,
      summary: `Produto atualizado: ${data.nome}`,
      details: {
        de: { nome: (atual as any).descricao, custo: Number((atual as any).custo ?? 0), preco_sugerido: Number((atual as any).preco_sugerido ?? 0), ativo: (atual as any).ativo },
        para: { nome: data.nome, custo: data.custo, preco_sugerido: data.preco_sugerido, ativo: data.ativo },
      },
    });

    return { product: toProduct(updated) };
  });

/** Ativa/desativa o produto para uso nas propostas de Carregadores. */
export const setCarregadoresProductAtivo = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ product: CarregadoresProductAdmin }> => {
    await requireFeature(context, {
      instance: "carregadores",
      feature: "carregadores.produtos",
      action: "moderar",
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: atual, error: readError } = await supabaseAdmin
      .from("sap_produtos")
      .select(COLS)
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!atual) throw new Error("Produto não encontrado.");

    if (data.ativo) {
      const { validateAtivacaoCarregadores } = await import("@/lib/product-visibility");
      const impedimento = validateAtivacaoCarregadores({
        custo: Number((atual as any).custo ?? 0),
        ncm_id: (atual as any).ncm_id ?? null,
        ncm_codigo: (atual as any).ncm_codigo ?? null,
      });
      if (impedimento) throw new Error(impedimento);
    }

    const { data: updated, error } = await supabaseAdmin
      .from("sap_produtos")
      .update({ ativo: data.ativo })
      .eq("id", data.id)
      .select(COLS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Não foi possível alterar o status do produto.");

    await recordModeration(context, {
      area: "carregadores_produtos",
      instanceId: "carregadores",
      action: data.ativo ? "ativou" : "desativou",
      target: (atual as any).descricao,
      summary: `Produto ${data.ativo ? "ativado" : "desativado"}: ${(atual as any).descricao}`,
    });

    return { product: toProduct(updated) };
  });
