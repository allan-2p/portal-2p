import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordModeration } from "@/lib/moderation-audit.server";
import { VISIBILIDADE_LABELS, validateVisibilidadeChange, type Visibilidade } from "@/lib/product-visibility";
import { requireAnyFeature } from "@/lib/guards.server";

export type SapVisibilidade = Visibilidade;


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
  origem: string | null;
  custo: number | null;
  ncm_id: string | null;
  ncm_codigo: string | null;
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
    await requireAnyFeature(context, [
      { instance: "solar", feature: "admin.objetos.produtos", action: "moderar" },
      { instance: "carregadores", feature: "admin.objetos.produtos", action: "moderar" },
      { instance: "carregadores", feature: "cpo.produtos", action: "moderar" },
    ]);

    const { data: produto, error: readError } = await context.supabase
      .from("sap_produtos")
      .select("id, descricao, origem, custo, ncm_id, visibilidade")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!produto) throw new Error("Produto não encontrado.");

    const { countOpenProposalsWithProduct } = await import("@/lib/product-visibility.server");
    const propostasAbertas =
      produto.visibilidade !== data.visibilidade && data.visibilidade === "solar"
        ? await countOpenProposalsWithProduct(context.supabase as never, data.id)
        : 0;

    const bloqueio = validateVisibilidadeChange(data.visibilidade, {
      origem: produto.origem,
      custo: Number(produto.custo ?? 0),
      ncm_id: produto.ncm_id,
      propostasAbertas,
    });
    if (bloqueio) throw new Error(bloqueio);

    // Ao entrar em Carregadores sem NCM/custo o produto vai para a Gestão de
    // Produtos como inativo — a ativação acontece lá, depois do NCM definido.
    const { validateAtivacaoCarregadores, showsInCarregadores } = await import("@/lib/product-visibility");
    const pendente =
      showsInCarregadores(data.visibilidade) &&
      validateAtivacaoCarregadores({ custo: Number(produto.custo ?? 0), ncm_id: produto.ncm_id }) !== null;

    const { error } = await context.supabase
      .from("sap_produtos")
      .update(pendente ? { visibilidade: data.visibilidade, ativo: false } : { visibilidade: data.visibilidade })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordModeration(context, {
      area: "produtos",
      action: "atualizou",
      target: produto.descricao ?? data.id,
      summary: `Visibilidade do produto alterada para "${VISIBILIDADE_LABELS[data.visibilidade]}"`,
      details: { de: produto.visibilidade, para: data.visibilidade },
    });
    return { ok: true };
  });


export const listSapProdutos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ produtos: SapProdutoRow[]; lastRun: SapSyncRun | null }> => {
    const { data, error } = await context.supabase
      .from("sap_produtos")
      .select("id, codigo, descricao, tipo, permissao, lista_preco, ativo, visibilidade, last_synced_at, origem, custo, ncm_id, ncm_codigo")
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
  .handler(async ({ context }): Promise<{ inserted: number; updated: number; deactivated: number; unchanged: number; catalogoAtualizado: number; catalogoInalterado: number }> => {
    await requireAnyFeature(context, [
      { instance: "solar", feature: "admin.objetos.produtos", action: "moderar" },
      { instance: "carregadores", feature: "admin.objetos.produtos", action: "moderar" },
      { instance: "carregadores", feature: "cpo.produtos", action: "moderar" },
    ]);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { classificarTipo, getAllMaterials, selecionarLiberados, validarRegras } = await import(
      "./sap-produtos.server"
    );

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
      const todosMateriais = await getAllMaterials();
      const materiais = selecionarLiberados(todosMateriais);
      if (materiais.length === 0) {
        throw new Error("SAP: RFC listar_material não retornou materiais — sincronização abortada.");
      }

      const now = new Date().toISOString();

      // Espelho completo do SAP (aba "Todos os produtos do SAP").
      const espelho = todosMateriais.map((m) => ({
        codigo: m.codigo,
        descricao: m.descricao,
        unidade: m.unidade,
        ncm_codigo: m.ncm,
        no_catalogo: m.liberado,
        sap_raw: m.raw as any,
        last_synced_at: now,
      }));
      for (let i = 0; i < espelho.length; i += 500) {
        const { error } = await supabaseAdmin
          .from("sap_catalogo_sap")
          .upsert(espelho.slice(i, i + 500), { onConflict: "codigo" });
        if (error) throw new Error(error.message);
      }

      const { data: existentes } = await supabaseAdmin
        .from("sap_produtos")
        .select("codigo, ativo, origem");
      const known = new Set((existentes ?? []).map((r: { codigo: string }) => r.codigo));

      // NCM do SAP alimenta o produto e, quando o código existir na tabela de
      // NCMs do portal, vincula automaticamente as alíquotas.
      const ncmsSap = Array.from(new Set(materiais.map((m) => m.ncm).filter(Boolean))) as string[];
      const ncmMap = new Map<string, string>();
      if (ncmsSap.length > 0) {
        const { data: ncmRows } = await supabaseAdmin
          .from("cpo_ncm")
          .select("id, codigo")
          .in("codigo", ncmsSap);
        for (const n of (ncmRows ?? []) as { id: string; codigo: string }[]) {
          ncmMap.set(String(n.codigo).replace(/\D/g, ""), n.id);
        }
      }

      const rows = materiais.map((m) => {
        const ncmId = m.ncm ? (ncmMap.get(m.ncm) ?? null) : null;
        return {
          codigo: m.codigo,
          descricao: m.descricao,
          tipo: classificarTipo(m.descricao),
          permissao: m.permissao,
          lista_preco: m.lista_preco,
          sap_raw: m.raw as any,
          last_synced_at: now,
          ...(m.ncm ? { ncm_codigo: m.ncm } : {}),
          ...(ncmId ? { ncm_id: ncmId } : {}),
        };
      });

      // Novos entram ativos; nos já existentes o SAP não sobrescreve o
      // ativo/inativo definido pela moderação do portal.
      const novos = rows.filter((r) => !known.has(r.codigo)).map((r) => ({ ...r, ativo: true, origem: "sap" }));
      for (let i = 0; i < novos.length; i += 500) {
        const { error } = await supabaseAdmin
          .from("sap_produtos")
          .upsert(novos.slice(i, i + 500), { onConflict: "codigo" });
        if (error) throw new Error(error.message);
      }
      const ativoAtual = new Map((existentes ?? []).map((r: any) => [r.codigo as string, r.ativo as boolean]));
      const atualizados = rows
        .filter((x) => known.has(x.codigo))
        .map((x) => ({ ...x, ativo: ativoAtual.get(x.codigo) ?? true }));
      for (let i = 0; i < atualizados.length; i += 500) {
        const { error } = await supabaseAdmin
          .from("sap_produtos")
          .upsert(atualizados.slice(i, i + 500), { onConflict: "codigo" });
        if (error) throw new Error(error.message);
      }


      // Merge: o que não veio mais do SAP fica inativo (sem apagar histórico).
      // Produtos criados manualmente no portal não são afetados.
      const vindos = new Set(rows.map((r) => r.codigo));
      const orfaos = (existentes ?? [])
        .filter((r: any) => r.ativo && r.origem !== "manual" && !vindos.has(r.codigo))
        .map((r: any) => r.codigo as string);
      for (let i = 0; i < orfaos.length; i += 500) {
        const chunk = orfaos.slice(i, i + 500);
        const { error } = await supabaseAdmin
          .from("sap_produtos")
          .update({ ativo: false, last_synced_at: now })
          .in("codigo", chunk);
        if (error) throw new Error(error.message);
      }

      const inserted = novos.length;

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


export type SapCatalogoRow = {
  codigo: string;
  descricao: string;
  unidade: string | null;
  ncm_codigo: string | null;
  no_catalogo: boolean;
  last_synced_at: string | null;
};

/** Espelho completo do SAP (todos os materiais), somente leitura. */
export const listSapCatalogoCompleto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ itens: SapCatalogoRow[] }> => {
    const { data, error } = await context.supabase
      .from("sap_catalogo_sap")
      .select("codigo, descricao, unidade, ncm_codigo, no_catalogo, last_synced_at")
      .order("codigo");
    if (error) throw new Error(error.message);
    return { itens: (data ?? []) as SapCatalogoRow[] };
  });
