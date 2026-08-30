/**
 * Server functions do Atlas: conversas, mensagens e alertas.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AtlasThread = {
  id: string;
  titulo: string;
  last_message_at: string;
  created_at: string;
};

export type AtlasMensagem = {
  id: string;
  role: "user" | "assistant";
  parts: unknown[];
  created_at: string;
};

export const listarThreadsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("atlas_threads")
      .select("id, titulo, last_message_at, created_at")
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as AtlasThread[];
  });

export const criarThreadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as Record<string, unknown>;
    return { titulo: typeof i["titulo"] === "string" ? i["titulo"].slice(0, 120) : undefined };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("atlas_threads")
      .insert({ user_id: context.userId, titulo: data.titulo || "Nova conversa" } as never)
      .select("id, titulo, last_message_at, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row as AtlasThread;
  });

export const renomearThreadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; titulo: string }) => {
    if (!input?.id) throw new Error("Conversa inválida.");
    return { id: input.id, titulo: String(input.titulo ?? "").slice(0, 120) || "Nova conversa" };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("atlas_threads")
      .update({ titulo: data.titulo } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const excluirThreadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Conversa inválida.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("atlas_threads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listarMensagensFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { threadId: string }) => {
    if (!input?.threadId) throw new Error("Conversa inválida.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("atlas_mensagens")
      .select("id, role, parts, created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return (rows ?? []) as AtlasMensagem[];
  });

// ---------------------------------------------------------------------------
// Alertas (radar)
// ---------------------------------------------------------------------------

export type AtlasAlerta = {
  id: string;
  instancia: string;
  cliente_nome: string;
  cliente_doc: string | null;
  cliente_id: string | null;
  consultor_nome: string | null;
  severidade: "atencao" | "critico";
  score: number;
  sinais: Array<{ tipo: string; titulo: string; detalhe: string }>;
  metricas: Record<string, unknown>;
  resumo: string | null;
  recomendacao: string | null;
  situacao: "aberto" | "tratado" | "silenciado";
  silenciado_ate: string | null;
  periodo_inicio: string;
  periodo_fim: string;
  created_at: string;
};

export const listarAlertasFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as Record<string, unknown>;
    const situacao = typeof i["situacao"] === "string" ? i["situacao"] : "aberto";
    return {
      situacao: ["aberto", "tratado", "silenciado", "todos"].includes(situacao) ? situacao : "aberto",
      clienteDoc: typeof i["clienteDoc"] === "string" ? i["clienteDoc"] : undefined,
      limite: typeof i["limite"] === "number" ? i["limite"] : 100,
    };
  })
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("atlas_alertas")
      .select(
        "id, instancia, cliente_nome, cliente_doc, cliente_id, consultor_nome, severidade, score, sinais, metricas, resumo, recomendacao, situacao, silenciado_ate, periodo_inicio, periodo_fim, created_at",
      )
      .order("score", { ascending: false })
      .limit(Math.min(Math.max(data.limite, 1), 300));
    if (data.situacao !== "todos") q = q.eq("situacao", data.situacao);
    if (data.clienteDoc) q = q.eq("cliente_doc", data.clienteDoc.replace(/\D/g, ""));
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as AtlasAlerta[];
  });

export const atualizarAlertaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; acao: "tratar" | "reabrir" | "silenciar"; dias?: number }) => {
    if (!input?.id) throw new Error("Alerta inválido.");
    if (!["tratar", "reabrir", "silenciar"].includes(input.acao)) throw new Error("Ação inválida.");
    return { id: input.id, acao: input.acao, dias: Math.min(Math.max(input.dias ?? 30, 1), 365) };
  })
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> =
      data.acao === "tratar"
        ? { situacao: "tratado", tratado_em: new Date().toISOString(), tratado_por: context.userId }
        : data.acao === "silenciar"
          ? {
              situacao: "silenciado",
              silenciado_ate: new Date(Date.now() + data.dias * 86400000).toISOString(),
            }
          : { situacao: "aberto", tratado_em: null, tratado_por: null, silenciado_ate: null };

    const { error } = await context.supabase
      .from("atlas_alertas")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Roda o radar sob demanda (somente admin/diretor). */
export const rodarRadarFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: pode } = await context.supabase.rpc("can_manage_all_propostas", {
      _user_id: context.userId,
    });
    if (!pode) throw new Error("Somente administradores podem rodar o radar do Atlas.");
    const { runJob } = await import("@/lib/job-runs.server");
    const { executorFor } = await import("@/lib/jobs-registry.server");
    const run = await runJob(
      { job: "cron.atlas-radar", trigger: "portal", actorId: context.userId },
      () => executorFor("cron.atlas-radar")({}),
    );
    return run;
  });
