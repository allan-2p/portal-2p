import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAnyFeature } from "@/lib/guards.server";

export type EstoqueLinha = {
  material: string;
  descricao: string | null;
  ncm: string | null;
  umb: string | null;
  grp_mercadorias: string | null;
  cmm: number;
  preco_venda: number;
  est_livre: number;
  qtd_pend_faturar: number;
  est_entreposto: number;
  atualizado_em: string;
};

export type ContainerLinha = {
  id_container: string;
  material: string;
  est_entreposto: number;
  supplier: string | null;
  dt_remessa: string | null;
};

export type EstoqueSyncRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  materiais_count: number;
  containers_count: number;
  ncm_aplicado: number;
  error_message: string | null;
};

export type ProdutoConsolidado = {
  codigo: string;
  descricao: string;
  unidade: string | null;
  ncm: string | null;
  tipo: string | null;
  grp_mercadorias: string | null;
  custo: number;
  preco_venda: number;
  visibilidade: string;
  no_catalogo: boolean;
  ativo: boolean;
  last_synced_at: string | null;
};

const FEATURES_ESTOQUE = [
  { instance: "solar" as const, feature: "admin.objetos.produtos" as const, action: "moderar" as const },
  { instance: "carregadores" as const, feature: "admin.objetos.produtos" as const, action: "moderar" as const },
  { instance: "carregadores" as const, feature: "carregadores.produtos" as const, action: "moderar" as const },
];

export const listEstoque = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      produtos: ProdutoConsolidado[];
      estoque: EstoqueLinha[];
      containers: ContainerLinha[];
      lastRun: EstoqueSyncRun | null;
    }> => {
      const [{ data: produtos }, { data: estoque }, { data: containers }, { data: runs }] = await Promise.all([
        context.supabase
          .from("produtos")
          .select(
            "codigo, descricao, unidade, ncm, tipo, grp_mercadorias, custo, preco_venda, visibilidade, no_catalogo, ativo, last_synced_at",
          )
          .order("descricao"),
        context.supabase
          .from("estoque")
          .select(
            "material, descricao, ncm, umb, grp_mercadorias, cmm, preco_venda, est_livre, qtd_pend_faturar, est_entreposto, atualizado_em",
          )
          .order("descricao"),
        context.supabase
          .from("containers")
          .select("id_container, material, est_entreposto, supplier, dt_remessa")
          .order("dt_remessa"),
        context.supabase
          .from("estoque_sync_runs")
          .select("id, started_at, finished_at, status, materiais_count, containers_count, ncm_aplicado, error_message")
          .order("started_at", { ascending: false })
          .limit(1),
      ]);

      return {
        produtos: (produtos ?? []) as ProdutoConsolidado[],
        estoque: (estoque ?? []) as EstoqueLinha[],
        containers: (containers ?? []) as ContainerLinha[],
        lastRun: ((runs ?? [])[0] as EstoqueSyncRun | undefined) ?? null,
      };
    },
  );

export const listEstoqueSyncRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ runs: EstoqueSyncRun[] }> => {
    const { data, error } = await context.supabase
      .from("estoque_sync_runs")
      .select("id, started_at, finished_at, status, materiais_count, containers_count, ncm_aplicado, error_message")
      .order("started_at", { ascending: false })
      .limit(25);
    if (error) throw new Error(error.message);
    return { runs: (data ?? []) as EstoqueSyncRun[] };
  });

/** Cascata de disponibilidade: imediato → entreposto → próxima remessa. */
export const checkDisponibilidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ material: z.string().min(1), qtd: z.number().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("check_disponibilidade", {
      p_material: data.material,
      p_qtd: data.qtd,
    });
    if (error) throw new Error(error.message);
    return res as {
      ok: boolean;
      disponivel?: boolean;
      tipo?: string;
      dt_remessa?: string;
      msg?: string;
    };
  });

export type EstoqueSyncResult = {
  materiais: number;
  containers: number;
  ncmAplicado: number;
  produtos: number;
  espelho: { target: string; ok: boolean; skipped?: boolean; message?: string }[];
  duracaoMs: number;
};

/**
 * Sincroniza estoque + NCM (RFC ZHDIT_ZMMR059), consolida a tabela `produtos`
 * (catálogo do SAP + NCM + custo + preço) e replica para Solar e Carregadores.
 */
export const syncEstoqueProdutos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EstoqueSyncResult> => {
    await requireAnyFeature(context, FEATURES_ESTOQUE);
    const { executarSyncEstoque } = await import("./estoque-sync.server");
    return await executarSyncEstoque(context.userId);
  });
