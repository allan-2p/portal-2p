import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordModeration } from "@/lib/moderation-audit.server";

export type SapVisibilidade = "solar" | "carregadores" | "ambos";

export type SapProdutoRow = {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  permissao: string;
  lista_preco: string | null;
  ativo: boolean;
  visibilidade: SapVisibilidade;
  last_synced_at: string | null;
};

export type SapSyncRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  inserted_count: number;
  updated_count: number;
  error_message: string | null;
};

/** Define em quais portais o produto aparece (propostas, catálogos, etc). */
export const setSapProdutoVisibilidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        visibilidade: z.enum(["solar", "carregadores", "ambos"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Apenas administradores podem alterar a visibilidade de produtos.");
    const { error } = await context.supabase
      .from("sap_produtos")
      .update({ visibilidade: data.visibilidade })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordModeration(context, {
      area: "produtos",
      action: "atualizou",
      target: data.id,
      summary: `Visibilidade do produto alterada para "${data.visibilidade}"`,
    });
    return { ok: true };
  });

export const listSapProdutos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ produtos: SapProdutoRow[]; lastRun: SapSyncRun | null }> => {
    const { data, error } = await context.supabase
      .from("sap_produtos")
      .select("id, codigo, descricao, tipo, permissao, lista_preco, ativo, visibilidade, last_synced_at")
      .order("descricao");
    if (error) throw new Error(error.message);


    const { data: runs } = await context.supabase
      .from("sap_produtos_sync_runs")
      .select("id, started_at, finished_at, status, inserted_count, updated_count, error_message")
      .order("started_at", { ascending: false })
      .limit(1);

    return {
      produtos: (data ?? []) as SapProdutoRow[],
      lastRun: ((runs ?? [])[0] as SapSyncRun | undefined) ?? null,
    };
  });

export const listSapSyncRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ runs: SapSyncRun[] }> => {
    const { data, error } = await context.supabase
      .from("sap_produtos_sync_runs")
      .select("id, started_at, finished_at, status, inserted_count, updated_count, error_message")
      .order("started_at", { ascending: false })
      .limit(25);
    if (error) throw new Error(error.message);
    return { runs: (data ?? []) as SapSyncRun[] };
  });

export const validateSapRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { validarRegras } = await import("./sap-produtos.server");
    return { problemas: validarRegras() };
  });

export const syncSapProdutos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ inserted: number; updated: number; deactivated: number }> => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin");
    if (roleError || !isAdmin) throw new Error("Forbidden: admin role required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { classificarTipo, getProducts, validarRegras } = await import("./sap-produtos.server");

    // Trava de segurança: regras inválidas classificariam o catálogo errado.
    const problemas = validarRegras();
    const erros = problemas.filter((p) => p.nivel === "erro");
    if (erros.length > 0) {
      throw new Error(
        `Regras de classificação inválidas: ${erros.map((e) => `${e.prefixo} — ${e.mensagem}`).join(" | ")}`,
      );
    }

    const { data: run } = await supabaseAdmin
      .from("sap_produtos_sync_runs")
      .insert({ status: "running", triggered_by: context.userId })
      .select("id")
      .single();

    const finish = async (patch: Record<string, unknown>) => {
      if (run?.id) {
        await supabaseAdmin
          .from("sap_produtos_sync_runs")
          .update({ finished_at: new Date().toISOString(), ...patch })
          .eq("id", run.id);
      }
    };

    try {
      const materiais = await getProducts();
      if (materiais.length === 0) {
        throw new Error("SAP: RFC listar_material não retornou materiais — sincronização abortada.");
      }

      const { data: existentes } = await supabaseAdmin.from("sap_produtos").select("codigo, ativo");
      const known = new Set((existentes ?? []).map((r: any) => r.codigo));

      const now = new Date().toISOString();
      const rows = materiais.map((m) => ({
        codigo: m.codigo,
        descricao: m.descricao,
        tipo: classificarTipo(m.descricao),
        permissao: m.permissao,
        lista_preco: m.lista_preco,
        ativo: true,
        sap_raw: m.raw as any,
        last_synced_at: now,
      }));

      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabaseAdmin.from("sap_produtos").upsert(chunk, { onConflict: "codigo" });
        if (error) throw new Error(error.message);
      }

      // Merge: o que não veio mais do SAP fica inativo (sem apagar histórico).
      const vindos = new Set(rows.map((r) => r.codigo));
      const orfaos = (existentes ?? [])
        .filter((r: any) => r.ativo && !vindos.has(r.codigo))
        .map((r: any) => r.codigo as string);
      for (let i = 0; i < orfaos.length; i += 500) {
        const chunk = orfaos.slice(i, i + 500);
        const { error } = await supabaseAdmin
          .from("sap_produtos")
          .update({ ativo: false, last_synced_at: now })
          .in("codigo", chunk);
        if (error) throw new Error(error.message);
      }

      const inserted = rows.filter((r) => !known.has(r.codigo)).length;
      const updated = rows.length - inserted;
      await finish({ status: "success", inserted_count: inserted, updated_count: updated });
      const { logIntegrationEvent } = await import("./integration-logs.server");
      await logIntegrationEvent({
        slug: "sap",
        level: "info",
        event: "sync",
        message: `Sincronização concluída: ${inserted} novos, ${updated} atualizados, ${orfaos.length} desativados.`,
        detail: { inserted, updated, deactivated: orfaos.length },
        actorId: context.userId,
      });
      return { inserted, updated, deactivated: orfaos.length };
    } catch (e: any) {
      await finish({ status: "error", error_message: String(e?.message ?? e).slice(0, 500) });
      const { logIntegrationEvent } = await import("./integration-logs.server");
      await logIntegrationEvent({
        slug: "sap",
        level: "error",
        event: "sync",
        message: String(e?.message ?? e).slice(0, 500),
        actorId: context.userId,
      });
      throw e;
    }
  });

