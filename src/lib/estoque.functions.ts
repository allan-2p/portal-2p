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

    const inicio = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchEstoqueSap, mapearEstoque } = await import("./sap-estoque.server");
    const { getAllMaterials, classificarTipo } = await import("./sap-produtos.server");

    const { data: run } = await supabaseAdmin
      .from("estoque_sync_runs")
      .insert({ status: "running", triggered_by: context.userId })
      .select("id")
      .single();

    const finish = async (patch: Record<string, unknown>) => {
      if (run?.id) {
        await supabaseAdmin
          .from("estoque_sync_runs")
          .update({ finished_at: new Date().toISOString(), ...patch })
          .eq("id", run.id);
      }
    };

    try {
      const [itens, catalogo] = await Promise.all([fetchEstoqueSap(), getAllMaterials()]);
      const { estoque, containers } = mapearEstoque(itens);
      const now = new Date().toISOString();

      // ---- estoque e containers: substituição completa (espelho do SAP) ----
      for (let i = 0; i < estoque.length; i += 500) {
        const { error } = await supabaseAdmin
          .from("estoque")
          .upsert(
            estoque.slice(i, i + 500).map((r) => ({ ...r, atualizado_em: now })),
            { onConflict: "material" },
          );
        if (error) throw new Error(`estoque: ${error.message}`);
      }
      const materiais = estoque.map((e) => e.material);
      if (materiais.length) {
        await supabaseAdmin.from("estoque").delete().not("material", "in", `(${materiais.join(",")})`);
      }

      await supabaseAdmin.from("containers").delete().neq("id_container", "");
      for (let i = 0; i < containers.length; i += 500) {
        const { error } = await supabaseAdmin
          .from("containers")
          .upsert(
            containers.slice(i, i + 500).map((c) => ({ ...c, atualizado_em: now })),
            { onConflict: "id_container,material" },
          );
        if (error) throw new Error(`containers: ${error.message}`);
      }

      // ---- produtos consolidados: catálogo + NCM/custo/preço do estoque ----
      const estoqueMap = new Map(estoque.map((e) => [e.material, e]));
      const { data: atuais } = await supabaseAdmin.from("produtos").select("codigo, visibilidade, ativo");
      const atuaisMap = new Map((atuais ?? []).map((r: any) => [r.codigo as string, r]));
      const { data: legado } = await supabaseAdmin.from("sap_produtos").select("codigo, visibilidade, ativo");
      const legadoMap = new Map((legado ?? []).map((r: any) => [r.codigo as string, r]));

      const codigos = new Set<string>([...catalogo.map((c) => c.codigo), ...estoqueMap.keys()]);
      const produtos = Array.from(codigos).map((codigo) => {
        const cat = catalogo.find((c) => c.codigo === codigo);
        const est = estoqueMap.get(codigo);
        const anterior = atuaisMap.get(codigo) ?? legadoMap.get(codigo);
        const descricao = cat?.descricao || est?.descricao || "";
        return {
          codigo,
          descricao,
          unidade: cat?.unidade ?? est?.umb ?? null,
          ncm: est?.ncm ?? cat?.ncm ?? null,
          tipo: descricao ? classificarTipo(descricao) : null,
          grp_mercadorias: est?.grp_mercadorias ?? null,
          custo: est?.cmm ?? 0,
          preco_venda: est?.preco_venda ?? 0,
          visibilidade: (anterior as any)?.visibilidade ?? "solar",
          no_catalogo: !!cat?.liberado,
          ativo: (anterior as any)?.ativo ?? true,
          origem: "sap",
          last_synced_at: now,
        };
      });

      for (let i = 0; i < produtos.length; i += 500) {
        const { error } = await supabaseAdmin
          .from("produtos")
          .upsert(produtos.slice(i, i + 500), { onConflict: "codigo" });
        if (error) throw new Error(`produtos: ${error.message}`);
      }

      // O NCM do SAP também alimenta o catálogo antigo do portal.
      let ncmAplicado = 0;
      for (const p of produtos) {
        if (!p.ncm) continue;
        const { error, count } = await supabaseAdmin
          .from("sap_produtos")
          .update({ ncm_codigo: p.ncm }, { count: "exact" })
          .eq("codigo", p.codigo)
          .is("ncm_codigo", null);
        if (!error) ncmAplicado += count ?? 0;
      }

      const { espelharProdutos } = await import("./produtos-mirror.server");
      const espelho = await espelharProdutos({
        produtos,
        estoque: estoque.map((r) => ({ ...r, atualizado_em: now })),
        containers: containers.map((c) => ({ ...c, atualizado_em: now })),
      });

      await finish({
        status: "success",
        materiais_count: estoque.length,
        containers_count: containers.length,
        ncm_aplicado: ncmAplicado,
      });

      const { logIntegrationEvent } = await import("./integration-logs.server");
      await logIntegrationEvent({
        slug: "sap",
        level: "info",
        event: "sync-estoque",
        message: `Estoque sincronizado: ${estoque.length} materiais, ${containers.length} containers, ${produtos.length} produtos consolidados.`,
        detail: { materiais: estoque.length, containers: containers.length, ncmAplicado, espelho },
        actorId: context.userId,
      });

      return {
        materiais: estoque.length,
        containers: containers.length,
        ncmAplicado,
        produtos: produtos.length,
        espelho,
        duracaoMs: Date.now() - inicio,
      };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      await finish({ status: "error", error_message: msg.slice(0, 500) });
      const { logIntegrationEvent } = await import("./integration-logs.server");
      await logIntegrationEvent({
        slug: "sap",
        level: "error",
        event: "sync-estoque",
        message: msg.slice(0, 500),
        detail: { duracao_ms: Date.now() - inicio },
        actorId: context.userId,
      });
      throw new Error(msg);
    }
  });
