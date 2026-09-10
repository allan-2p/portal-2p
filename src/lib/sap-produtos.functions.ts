import { createServerFn } from "@tanstack/react-start";
import { catalogoDb } from "@/lib/catalogo-db.server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordModeration } from "@/lib/moderation-audit.server";
import { VISIBILIDADE_LABELS, validateVisibilidadeChange, type Visibilidade } from "@/lib/product-visibility";
import { requireAnyFeature } from "@/lib/guards.server";
import { FEATURES_CATALOGO } from "@/lib/catalogo-features";

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
  /** Tem preço vigente no SAP (VK12) na última varredura. */
  vendavel_sap: boolean | null;
  /** Decisão manual que vence a varredura de preço (null = automático). */
  ativo_override: boolean | null;
  ativo_override_motivo: string | null;
  /** Visibilidade travada manualmente (null = automático). */
  visibilidade_override: SapVisibilidade | null;
  preco_vk12: number | null;
  preco_checado_em: string | null;
  /** Preço de referência do portal (usado quando o SAP não precifica). */
  preco_sugerido: number | null;
  /** Caminho da foto no bucket de produtos. */
  imagem_path: string | null;
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

/**
 * Volta a visibilidade ao modo automático: sem override, as sincronizações do
 * SAP podem definir a instância pelo grupo de mercadoria de novo.
 */
export const limparSapProdutoVisibilidadeOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAnyFeature(context, FEATURES_CATALOGO);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (await catalogoDb()).from("sap_produtos")
      .update({
        visibilidade_override: null,
        visibilidade_override_por: null,
        visibilidade_override_em: null,
        visibilidade_override_motivo: null,
      } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordModeration(context, {
      area: "produtos",
      action: "override-removido",
      target: data.id,
      summary: "Visibilidade voltou ao modo automático (segue o grupo de mercadoria do SAP).",
    });
    return { ok: true };
  });

/** Define em quais portais o produto aparece (propostas, catálogos, etc). */
export const setSapProdutoVisibilidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        visibilidade: z.enum(["nenhuma", "solar", "carregadores", "ambos"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAnyFeature(context, FEATURES_CATALOGO);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: produto, error: readError } = await (await catalogoDb()).from("sap_produtos")
      .select("id, descricao, origem, custo, ncm_id, ncm_codigo, visibilidade, ativo_override")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!produto) throw new Error("Produto não encontrado.");

    const { countOpenProposalsWithProduct } = await import("@/lib/product-visibility.server");
    const propostasAbertas =
      produto.visibilidade !== data.visibilidade && data.visibilidade === "solar"
        ? await countOpenProposalsWithProduct(data.id)
        : 0;

    const bloqueio = validateVisibilidadeChange(data.visibilidade, {
      origem: produto.origem,
      custo: Number(produto.custo ?? 0),
      ncm_id: produto.ncm_id,
      propostasAbertas,
    });
    if (bloqueio) throw new Error(bloqueio);

    // Ao entrar em Carregadores sem NCM/custo o produto vai para a Gestão de
    // Produtos como inativo — a menos que o status tenha sido definido
    // manualmente, que é a regra máxima de aparecer ou não na instância.
    const { validateAtivacaoCarregadores, showsInCarregadores } = await import("@/lib/product-visibility");
    const pendente =
      (produto as any).ativo_override !== true &&
      showsInCarregadores(data.visibilidade) &&
      validateAtivacaoCarregadores({ custo: Number(produto.custo ?? 0), ncm_id: produto.ncm_id, ncm_codigo: (produto as any).ncm_codigo ?? null }) !== null;


    // Decisão manual: grava também o override, para que as sincronizações do
    // SAP (catálogo e estoque) não voltem a visibilidade para o padrão.
    const override = {
      visibilidade_override: data.visibilidade,
      visibilidade_override_por: (context as any).userId ?? null,
      visibilidade_override_em: new Date().toISOString(),
      visibilidade_override_motivo: "Definida manualmente na moderação de produtos.",
    };
    const { error } = await (await catalogoDb()).from("sap_produtos")
      .update(
        (data.visibilidade === "nenhuma"
          ? { visibilidade: null, ativo: false, ...override }
          : pendente
            ? { visibilidade: data.visibilidade, ativo: false, ...override }
            : { visibilidade: data.visibilidade, ...override }) as any,
      )
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Espelha no catálogo consolidado, que é o lido pelos wizards.
    const { data: codigoRow } = await (await catalogoDb()).from("sap_produtos")
      .select("codigo")
      .eq("id", data.id)
      .maybeSingle();
    if ((codigoRow as any)?.codigo) {
      await (await catalogoDb()).from("produtos")
        .update({
          visibilidade: data.visibilidade,
          ...(data.visibilidade === "nenhuma" || pendente ? { ativo: false } : {}),
        })
        .eq("origem", "sap")
        .eq("codigo", String((codigoRow as any).codigo));
    }
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (await catalogoDb()).from("sap_produtos")
      .select(
        "id, codigo, descricao, tipo, permissao, lista_preco, ativo, visibilidade, last_synced_at, origem, custo, ncm_id, ncm_codigo, vendavel_sap, ativo_override, ativo_override_motivo, visibilidade_override, preco_vk12, preco_checado_em, preco_sugerido, imagem_path",
      )
      .order("descricao");
    if (error) throw new Error(error.message);


    const { data: runs } = await (await catalogoDb()).from("sap_produtos_sync_runs")
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
    const { data, error } = await (await catalogoDb()).from("sap_produtos_sync_runs")
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

export type SapSyncResult = {
  inserted: number;
  updated: number;
  deactivated: number;
  unchanged: number;
  catalogoAtualizado: number;
  catalogoInalterado: number;
  totalSap: number;
  totalLiberados: number;
  semNcm: number;
  duracaoMs: number;
  /** Varredura de preço no SAP disparada no fim da sincronização. */
  vendaveis?: { verificados: number; ativados: number; desativados: number; erro?: string };
};

/** Traduz falhas técnicas do SAP Bridge em mensagens acionáveis. */
function descreverErroSap(e: unknown): string {
  const raw = String((e as any)?.message ?? e ?? "Erro desconhecido");
  if (/listar_material não retornou/i.test(raw))
    return "O SAP respondeu, mas não devolveu nenhum material. Verifique se o usuário de integração tem acesso à RFC listar_material e se a lista de preços está preenchida no SAP.";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(raw))
    return `Não foi possível conectar ao SAP Bridge. Verifique se o serviço está no ar e se a URL/porta está correta. (${raw})`;
  if (/timeout|ETIMEDOUT|aborted/i.test(raw))
    return `O SAP demorou demais para responder e a sincronização foi interrompida. Tente novamente em alguns minutos. (${raw})`;
  if (/401|403|unauthor|forbidden|credenc/i.test(raw))
    return `O SAP Bridge recusou as credenciais de integração. Peça a revisão do usuário/senha do serviço. (${raw})`;
  if (/50\d|SOAP|Fault/i.test(raw))
    return `O SAP retornou um erro interno ao processar a RFC. Encaminhe esta mensagem ao time SAP: ${raw}`;
  if (/permission denied|row-level security|violates/i.test(raw))
    return `Falha ao gravar no banco do portal durante a sincronização: ${raw}`;
  return raw;
}

export const syncSapProdutos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SapSyncResult> => {
    await requireAnyFeature(context, FEATURES_CATALOGO);

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

    const { data: run } = await (await catalogoDb()).from("sap_produtos_sync_runs")
      .insert({ status: "running", triggered_by: context.userId })
      .select("id")
      .single();

    const finish = async (patch: Record<string, unknown>) => {
      if (run?.id) {
        await (await catalogoDb()).from("sap_produtos_sync_runs")
          .update({ finished_at: new Date().toISOString(), ...patch })
          .eq("id", run.id);
      }
    };

    const iniciadoEm = Date.now();
    try {
      const todosMateriais = await getAllMaterials();
      const materiais = selecionarLiberados(todosMateriais);
      if (materiais.length === 0) {
        throw new Error("SAP: RFC listar_material não retornou materiais — sincronização abortada.");
      }

      // O NCM não vem na listar_material: buscamos sempre junto na RFC de
      // estoque (ZHDIT_ZMMR059), que é a fonte oficial do NCM por material.
      const ncmSapMap = new Map<string, string>();
      try {
        const { fetchEstoqueSap, mapearEstoque } = await import("./sap-estoque.server");
        const { estoque } = mapearEstoque(await fetchEstoqueSap({ grupos: "" }));
        for (const e of estoque) if (e.ncm) ncmSapMap.set(e.material, e.ncm);
      } catch (err) {
        console.error("[SAP] NCM (ZMMR059) indisponível nesta sincronização:", err);
      }
      const ncmDe = (m: { codigo: string; ncm?: string | null }) => m.ncm || ncmSapMap.get(m.codigo) || null;

      const now = new Date().toISOString();


      // ---------- Espelho completo do SAP (aba "Todos os produtos do SAP") ----------
      // Sincronização incremental: só grava os materiais que mudaram desde a
      // última execução (comparação campo a campo com o que já está no banco).
      const { data: espelhoExistente } = await (await catalogoDb()).from("sap_catalogo_sap")
        .select("codigo, descricao, unidade, ncm_codigo, no_catalogo");
      const espelhoMap = new Map(
        (espelhoExistente ?? []).map((r: any) => [
          String(r.codigo),
          `${r.descricao ?? ""}|${r.unidade ?? ""}|${r.ncm_codigo ?? ""}|${r.no_catalogo ? 1 : 0}`,
        ]),
      );
      // Envio manual manda: material já colocado no catálogo do portal continua
      // lá em qualquer sincronização — só sai por decisão de alguém na
      // Administração. O SAP só pode ADICIONAR ao catálogo, nunca remover.
      const jaNoCatalogo = new Set(
        (espelhoExistente ?? []).filter((r: any) => r.no_catalogo).map((r: any) => String(r.codigo)),
      );
      const espelho = todosMateriais
        .map((m) => ({
          codigo: m.codigo,
          descricao: m.descricao,
          unidade: m.unidade,
          ncm_codigo: ncmDe(m),
          no_catalogo: m.liberado || jaNoCatalogo.has(m.codigo),
          sap_raw: m.raw as any,
          last_synced_at: now,
        }))
        .filter((r) => {
          const anterior = espelhoMap.get(r.codigo);
          const atual = `${r.descricao ?? ""}|${r.unidade ?? ""}|${r.ncm_codigo ?? ""}|${r.no_catalogo ? 1 : 0}`;
          return anterior === undefined || anterior !== atual;
        });
      const catalogoInalterado = todosMateriais.length - espelho.length;
      for (let i = 0; i < espelho.length; i += 500) {
        const { error } = await (await catalogoDb()).from("sap_catalogo_sap")
          .upsert(espelho.slice(i, i + 500), { onConflict: "codigo" });
        if (error) throw new Error(error.message);
      }

      const dbCat = await catalogoDb();
      const { colunasComTravas } = await import("@/lib/catalogo-travas.server");
      const { semCamposTravados } = await import("@/lib/catalogo-travas");
      const { data: existentes } = await dbCat.from("sap_produtos")
        .select(
          await colunasComTravas(
            dbCat,
            "codigo, ativo, ativo_override, origem, descricao, tipo, permissao, lista_preco, ncm_codigo, ncm_id",
          ),
        );
      const known = new Set(((existentes ?? []) as any[]).map((r: any) => r.codigo as string));
      const atuaisMap = new Map((existentes ?? []).map((r: any) => [r.codigo as string, r]));

      // NCM do SAP alimenta o produto e, quando o código existir na tabela de
      // NCMs do portal, vincula automaticamente as alíquotas.
      const ncmsSap = Array.from(new Set(materiais.map((m) => ncmDe(m)).filter(Boolean))) as string[];
      const ncmMap = new Map<string, string>();
      if (ncmsSap.length > 0) {
        const { data: ncmRows } = await (await catalogoDb()).from("carregadores_ncm")
          .select("id, codigo")
          .in("codigo", ncmsSap);
        for (const n of (ncmRows ?? []) as { id: string; codigo: string }[]) {
          ncmMap.set(String(n.codigo).replace(/\D/g, ""), n.id);
        }
      }

      // Todas as linhas do lote precisam ter as MESMAS chaves: no upsert em
      // lote, a chave ausente em uma linha zera a coluna dela. Por isso o NCM
      // vem sempre no payload, caindo no valor já gravado quando o SAP não
      // trouxer nada.
      const rows = materiais.map((m) => {
        const ncm = ncmDe(m);
        const ncmId = ncm ? (ncmMap.get(ncm) ?? null) : null;
        const atual: any = atuaisMap.get(m.codigo);
        // Nome editado na Gestão de Produtos é trava: o SAP não o reescreve.
        // (o valor atual entra no payload para o lote manter as mesmas chaves)
        const descricaoTravada = Object.keys(semCamposTravados({ descricao: 1 }, atual)).length === 0;
        return {
          codigo: m.codigo,
          descricao: descricaoTravada ? (atual?.descricao ?? m.descricao) : m.descricao,
          tipo: classificarTipo(m.descricao),
          permissao: m.permissao,
          lista_preco: m.lista_preco,
          sap_raw: m.raw as any,
          last_synced_at: now,
          ncm_codigo: ncm ?? atual?.ncm_codigo ?? null,
          ncm_id: ncmId ?? atual?.ncm_id ?? null,
        };
      });


      // Novos entram SEM visibilidade (e inativos): a instância é definida
      // depois, na Administração › Produtos. Nos já existentes o SAP não sobrescreve o
      // ativo/inativo definido pela moderação do portal.
      const novos = rows.filter((r) => !known.has(r.codigo)).map((r) => ({ ...r, ativo: false, visibilidade: null, origem: "sap" }));
      for (let i = 0; i < novos.length; i += 500) {
        const { error } = await (await catalogoDb()).from("sap_produtos")
          .upsert(novos.slice(i, i + 500), { onConflict: "codigo" });
        if (error) throw new Error(error.message);
      }
      const mudou = (novo: any, atual: any) =>


        (atual.descricao ?? "") !== (novo.descricao ?? "") ||
        (atual.tipo ?? "") !== (novo.tipo ?? "") ||
        (atual.permissao ?? "") !== (novo.permissao ?? "") ||
        (atual.lista_preco ?? "") !== (novo.lista_preco ?? "") ||
        (novo.ncm_codigo !== undefined && (atual.ncm_codigo ?? "") !== (novo.ncm_codigo ?? "")) ||
        (novo.ncm_id !== undefined && (atual.ncm_id ?? "") !== (novo.ncm_id ?? ""));

      const existentesRows = rows.filter((x) => known.has(x.codigo));
      const atualizados = existentesRows
        .filter((x) => mudou(x, atuaisMap.get(x.codigo)))
        .map((x) => ({ ...x, ativo: (atuaisMap.get(x.codigo) as any)?.ativo ?? true }));
      const unchanged = existentesRows.length - atualizados.length;
      for (let i = 0; i < atualizados.length; i += 500) {
        const { error } = await (await catalogoDb()).from("sap_produtos")
          .upsert(atualizados.slice(i, i + 500), { onConflict: "codigo" });
        if (error) throw new Error(error.message);
      }


      // Merge: o que não veio mais do SAP fica inativo (sem apagar histórico).
      // Produtos criados manualmente no portal, materiais enviados de propósito
      // ao catálogo do portal e itens forçados ativos na moderação não são
      // afetados — só saem por decisão manual.
      const vindos = new Set(rows.map((r) => r.codigo));
      const orfaos = (existentes ?? [])
        .filter(
          (r: any) =>
            r.ativo &&
            r.ativo_override !== true &&
            r.origem !== "manual" &&
            !vindos.has(r.codigo) &&
            !jaNoCatalogo.has(String(r.codigo)),
        )
        .map((r: any) => r.codigo as string);
      for (let i = 0; i < orfaos.length; i += 500) {
        const chunk = orfaos.slice(i, i + 500);
        const { error } = await (await catalogoDb()).from("sap_produtos")
          .update({ ativo: false, last_synced_at: now })
          .in("codigo", chunk);
        if (error) throw new Error(error.message);
      }

      const inserted = novos.length;
      const updated = atualizados.length;
      await finish({ status: "success", inserted_count: inserted, updated_count: updated });
      const { logIntegrationEvent } = await import("./integration-logs.server");
      await logIntegrationEvent({
        slug: "sap",
        level: "info",
        event: "sync",
        message: `Sincronização incremental: ${inserted} novos, ${updated} atualizados, ${unchanged} sem mudança, ${orfaos.length} desativados.`,
        detail: {
          inserted,
          updated,
          unchanged,
          deactivated: orfaos.length,
          catalogo_atualizado: espelho.length,
          catalogo_inalterado: catalogoInalterado,
        },
        actorId: context.userId,
      });

      // Regra permanente: depois de importar o mestre, o critério de vendável é
      // ter preço no SAP. Aqui verificamos os materiais novos (e uma fatia dos
      // mais antigos sem checagem); o cron diário cobre o restante.
      let vendaveis: SapSyncResult["vendaveis"];
      try {
        const { runJob } = await import("@/lib/job-runs.server");
        const { varrerCatalogoVendaveis } = await import("@/lib/sap-catalogo-vendaveis.server");
        const codigosNovos = novos.map((n) => n.codigo);
        const r = await runJob(
          {
            job: "sap.sync-produtos",
            trigger: "portal",
            payload: { origem: "sync-produtos", novos: codigosNovos.length },
            actorId: context.userId,
          },
          () =>
            varrerCatalogoVendaveis({
              limite: 250,
              ...(codigosNovos.length ? { codigos: codigosNovos } : {}),
              actorId: context.userId,
            }) as any,
        );
        const res = (r as any)?.result ?? (r as any) ?? {};
        vendaveis = {
          verificados: Number(res.verificados ?? 0),
          ativados: Number(res.ativados ?? 0),
          desativados: Number(res.desativados ?? 0),
        };
      } catch (e: any) {
        vendaveis = { verificados: 0, ativados: 0, desativados: 0, erro: String(e?.message ?? e) };
      }

      return {
        inserted,
        updated,
        deactivated: orfaos.length,
        unchanged,
        vendaveis,
        catalogoAtualizado: espelho.length,
        catalogoInalterado,
        totalSap: todosMateriais.length,
        totalLiberados: materiais.length,
        semNcm: materiais.filter((m) => !ncmDe(m)).length,
        duracaoMs: Date.now() - iniciadoEm,
      };
    } catch (e: any) {
      const amigavel = descreverErroSap(e);
      await finish({ status: "error", error_message: amigavel.slice(0, 500) });
      const { logIntegrationEvent } = await import("./integration-logs.server");
      await logIntegrationEvent({
        slug: "sap",
        level: "error",
        event: "sync",
        message: amigavel.slice(0, 500),
        detail: { original: String(e?.message ?? e).slice(0, 1000), duracao_ms: Date.now() - iniciadoEm },
        actorId: context.userId,
      });
      throw new Error(amigavel);
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
    const { data, error } = await (await catalogoDb()).from("sap_catalogo_sap")
      .select("codigo, descricao, unidade, ncm_codigo, no_catalogo, last_synced_at")
      .order("codigo");
    if (error) throw new Error(error.message);
    return { itens: (data ?? []) as SapCatalogoRow[] };
  });

/**
 * Envia (ou remove) um material do espelho completo do SAP para o catálogo do
 * portal. Ao entrar com `visibilidade`, o produto já nasce ativo (status
 * manual, que é a regra máxima) na instância escolhida.
 */
export const setSapCatalogoNoPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        codigo: z.string().min(1),
        no_catalogo: z.boolean(),
        visibilidade: z.enum(["solar", "carregadores", "ambos"]).optional(),
      })
      .parse(d),
  )

  .handler(async ({ data, context }) => {
    await requireAnyFeature(context, FEATURES_CATALOGO);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { classificarTipo } = await import("./sap-produtos.server");

    const { data: material, error: readError } = await (await catalogoDb()).from("sap_catalogo_sap")
      .select("codigo, descricao, unidade, ncm_codigo, sap_raw")
      .eq("codigo", data.codigo)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!material) throw new Error("Material não encontrado no espelho do SAP.");

    if (data.no_catalogo) {
      const ncm = (material as any).ncm_codigo as string | null;
      let ncmId: string | null = null;
      if (ncm) {
        const { data: n } = await (await catalogoDb()).from("carregadores_ncm")
          .select("id")
          .eq("codigo", ncm)
          .maybeSingle();
        ncmId = (n as any)?.id ?? null;
      }
      // Entrando no catálogo com instância escolhida: já nasce ativo e com o
      // status/visibilidade travados manualmente (regra máxima sobre o SAP).
      const manual = data.visibilidade
        ? {
            ativo: true,
            visibilidade: data.visibilidade,
            ativo_override: true,
            ativo_override_por: (context as any).userId ?? null,
            ativo_override_em: new Date().toISOString(),
            ativo_override_motivo: "Incluído no catálogo pela Gestão de Produtos.",
            visibilidade_override: data.visibilidade,
            visibilidade_override_por: (context as any).userId ?? null,
            visibilidade_override_em: new Date().toISOString(),
            visibilidade_override_motivo: "Definida ao incluir no catálogo.",
          }
        : {};
      const { data: existente } = await (await catalogoDb()).from("sap_produtos")
        .select("id")
        .eq("codigo", material.codigo)
        .maybeSingle();

      if (existente) {
        const { error } = await (await catalogoDb()).from("sap_produtos")
          .update({ descricao: material.descricao, ...(ncm ? { ncm_codigo: ncm } : {}), ...(ncmId ? { ncm_id: ncmId } : {}), ...manual } as any)
          .eq("codigo", material.codigo);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await (await catalogoDb()).from("sap_produtos").insert({
          codigo: material.codigo,
          descricao: material.descricao ?? "",
          tipo: classificarTipo(material.descricao ?? ""),
          permissao: "Todos",
          origem: "sap",
          ativo: false,
          visibilidade: null,
          last_synced_at: new Date().toISOString(),
          sap_raw: (material as any).sap_raw ?? null,
          ...(ncm ? { ncm_codigo: ncm } : {}),
          ...(ncmId ? { ncm_id: ncmId } : {}),
          ...manual,
        } as any);
        if (error) throw new Error(error.message);
      }

      if (data.visibilidade) {
        await (await catalogoDb()).from("produtos")
          .update({ ativo: true, visibilidade: data.visibilidade })
          .eq("origem", "sap")
          .eq("codigo", String(material.codigo));
      }
    } else {
      const { error } = await (await catalogoDb()).from("sap_produtos")
        .update({ ativo: false, visibilidade: null })
        .eq("codigo", material.codigo);
      if (error) throw new Error(error.message);
    }


    const { error: flagError } = await (await catalogoDb()).from("sap_catalogo_sap")
      .update({ no_catalogo: data.no_catalogo })
      .eq("codigo", material.codigo);
    if (flagError) throw new Error(flagError.message);

    await recordModeration(context, {
      area: "produtos",
      action: data.no_catalogo ? "adicionou ao catálogo" : "removeu do catálogo",
      target: material.codigo,
      summary: `${material.codigo} ${data.no_catalogo ? "enviado para" : "removido do"} catálogo do portal: ${material.descricao ?? ""}`,
    });

    return { ok: true };
  });


/**
 * Override manual do "ativo": o time decide, e a varredura de preço do SAP
 * (`sap.sync-produtos`) passa a respeitar essa decisão. `override: null` volta
 * o material para o critério automático (tem preço na VK12 → ativo).
 */
export const setSapProdutoOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        override: z.boolean().nullable(),
        motivo: z.string().trim().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireAnyFeature(context, FEATURES_CATALOGO);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: atual, error: readErr } = await (await catalogoDb()).from("sap_produtos")
      .select("codigo, descricao, ativo, vendavel_sap")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!atual) throw new Error("Produto não encontrado.");

    // Sem override, o status volta a ser o que a varredura encontrou.
    const ativo = data.override ?? Boolean((atual as any).vendavel_sap);
    const { error } = await (await catalogoDb()).from("sap_produtos")
      .update({
        ativo,
        ativo_override: data.override,
        ativo_override_por: data.override === null ? null : ((context as any).userId ?? null),
        ativo_override_em: data.override === null ? null : new Date().toISOString(),
        ativo_override_motivo: data.override === null ? null : (data.motivo ?? "Definido manualmente na Gestão de Produtos."),
      } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await (await catalogoDb()).from("produtos")
      .update({ ativo })
      .eq("origem", "sap")
      .eq("codigo", String((atual as any).codigo));

    await recordModeration(context, {
      area: "sap_produtos",
      instanceId: "admin",
      action: data.override === null ? "override-removido" : data.override ? "ativou" : "desativou",
      target: (atual as any).descricao,
      summary:
        data.override === null
          ? `Override manual removido: ${(atual as any).descricao} volta ao critério de preço do SAP.`
          : `Override manual: ${(atual as any).descricao} ${data.override ? "ativado" : "desativado"} independente do preço do SAP.`,
      details: { vendavel_sap: (atual as any).vendavel_sap ?? null, motivo: data.motivo ?? null },
    });

    return { ok: true };
  });

/** Roda a varredura de preço do SAP sob demanda (mesmo motor do cron). */
export const varrerCatalogoVendaveisAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ limite: z.number().int().min(1).max(900).optional(), codigos: z.array(z.string()).optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireAnyFeature(context, FEATURES_CATALOGO);
    const { runJob } = await import("@/lib/job-runs.server");
    const { varrerCatalogoVendaveis } = await import("@/lib/sap-catalogo-vendaveis.server");
    const r = await runJob(
      {
        job: "sap.sync-produtos",
        trigger: "manual",
        payload: { limite: data.limite ?? 250, codigos: data.codigos?.length ?? 0 },
        actorId: (context as any).userId ?? null,
      },
      () =>
        varrerCatalogoVendaveis({
          limite: data.limite ?? 250,
          ...(data.codigos?.length ? { codigos: data.codigos } : {}),
          actorId: (context as any).userId ?? null,
        }),
    );
    if (!r.ok) throw new Error(r.error);
    return r.result;
  });

/**
 * Edição manual dos campos do catálogo (nome, custo, preço sugerido e foto).
 * Centraliza o que antes era editado nas abas "Produtos do portal" (Solar) e
 * "Produtos" (Carregadores): o catálogo é a única fonte desses dados.
 */
export const atualizarSapProdutoCampos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        descricao: z.string().trim().min(1).max(200).optional(),
        custo: z.number().nonnegative().optional(),
        preco_sugerido: z.number().nonnegative().optional(),
        imagem_path: z.string().trim().max(300).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireAnyFeature(context, FEATURES_CATALOGO);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = await catalogoDb();
    const { colunasComTravas } = await import("@/lib/catalogo-travas.server");
    const { unirCamposTravados } = await import("@/lib/catalogo-travas");
    const temTravas = await (await import("@/lib/catalogo-travas.server")).temColunaCamposManuais(db);
    const { data: atual, error: readErr } = await db
      .from("sap_produtos")
      .select(
        await colunasComTravas(
          db,
          "id, codigo, descricao, custo, preco_sugerido, imagem_path, ativo, visibilidade, ncm_id, ncm_codigo",
        ),
      )
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!atual) throw new Error("Produto não encontrado.");

    const patch: Record<string, unknown> = {};
    if (data.descricao !== undefined) patch['descricao'] = data.descricao;
    if (data.custo !== undefined) patch['custo'] = data.custo;
    if (data.preco_sugerido !== undefined) patch['preco_sugerido'] = data.preco_sugerido;
    if (data.imagem_path !== undefined) patch['imagem_path'] = data.imagem_path;
    if (Object.keys(patch).length === 0) return { ok: true };

    // Trava: campo editado à mão deixa de ser regravado por qualquer sincronização.
    if (temTravas) {
      patch['campos_manuais'] = unirCamposTravados((atual as any).campos_manuais, Object.keys(patch));
    }

    // Produto ativo em Carregadores continua exigindo custo e NCM válidos.
    const { showsInCarregadores, validateAtivacaoCarregadores } = await import("@/lib/product-visibility");
    if ((atual as any).ativo && showsInCarregadores((atual as any).visibilidade) && data.custo !== undefined) {
      const impedimento = validateAtivacaoCarregadores({
        custo: data.custo,
        ncm_id: (atual as any).ncm_id ?? null,
        ncm_codigo: (atual as any).ncm_codigo ?? null,
      });
      if (impedimento) throw new Error(impedimento);
    }

    const { error } = await db.from("sap_produtos").update(patch as any).eq("id", data.id);
    if (error) throw new Error(error.message);

    // Espelha no catálogo consolidado lido pelos wizards.
    const espelho: Record<string, unknown> = {};
    if (data.descricao !== undefined) espelho['nome'] = data.descricao;
    if (data.custo !== undefined) espelho['custo'] = data.custo;
    if (data.preco_sugerido !== undefined) espelho['preco_sugerido'] = data.preco_sugerido;
    if ((atual as any).codigo && Object.keys(espelho).length > 0) {
      await db
        .from("produtos")
        .update(espelho as any)
        .eq("origem", "sap")
        .eq("codigo", String((atual as any).codigo));
    }

    await recordModeration(context, {
      area: "sap_produtos",
      instanceId: "admin",
      action: "atualizou",
      target: (atual as any).descricao ?? data.id,
      summary: `Catálogo atualizado: ${(atual as any).descricao ?? data.id}`,
      details: {
        de: {
          descricao: (atual as any).descricao,
          custo: Number((atual as any).custo ?? 0),
          preco_sugerido: Number((atual as any).preco_sugerido ?? 0),
          imagem_path: (atual as any).imagem_path ?? null,
        },
        para: patch,
      },
    });

    return { ok: true };
  });
