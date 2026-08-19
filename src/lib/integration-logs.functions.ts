import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Guard por tela/ação (default deny) — admin, acesso total ou perfil com a tela. */
async function assertFeature(
  ctx: { supabase: any; userId: string },
  feature: any,
  action: any = "visualizar",
) {
  const { requireAdminFeature } = await import("@/lib/guards.server");
  await requireAdminFeature(ctx, feature, action);
}

/** Leitura de log: liberada pela tela de origem OU pela permissão de Logs. */
async function assertLogRead(ctx: { supabase: any; userId: string }, fallback: any) {
  const { canAdminFeature, requireAdminFeature } = await import("@/lib/guards.server");
  if (await canAdminFeature(ctx, "admin.logs.integracoes", "visualizar")) return;
  await requireAdminFeature(ctx, fallback, "visualizar");
}


export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type IntegrationLogRow = {
  id: string;
  slug: string;
  level: "info" | "warn" | "error";
  event: string;
  message: string | null;
  detail: Record<string, JsonValue> | null;
  duration_ms: number | null;
  actor_email: string | null;
  created_at: string;
};

/** Histórico de sincronizações e erros — filtrável por integração e nível. */
export const listIntegrationLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    slug?: string;
    level?: "all" | "info" | "warn" | "error";
    limit?: number;
    offset?: number;
    /** Busca livre por evento, mensagem, documento ou razão social do cliente. */
    search?: string;
    /** Auditoria de um cliente específico (integration_logs.detail->>cliente_id). */
    clienteId?: string;
    /** Integrações de um pedido específico (integration_logs.detail->>proposta_id). */
    propostaId?: string;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertLogRead(context, "admin.integracoes");

    const limit = Math.min(Math.max(data.limit ?? 10, 1), 100);
    const offset = Math.max(data.offset ?? 0, 0);

    let q = context.supabase
      .from("integration_logs")
      .select("id, slug, level, event, message, detail, duration_ms, actor_email, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (data.slug) q = q.eq("slug", data.slug);
    if (data.level && data.level !== "all") q = q.eq("level", data.level);
    if (data.clienteId) q = q.eq("detail->>cliente_id", data.clienteId);
    if (data.propostaId) q = q.eq("detail->>proposta_id", data.propostaId);

    const termo = (data.search ?? "").trim().replace(/[,()*]/g, " ");
    if (termo) {
      q = q.or(
        [
          `event.ilike.*${termo}*`,
          `message.ilike.*${termo}*`,
          `slug.ilike.*${termo}*`,
          `detail->>doc.ilike.*${termo}*`,
          `detail->>razao_social.ilike.*${termo}*`,
          `detail->>cliente_id.ilike.*${termo}*`,
        ].join(","),
      );
    }


    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as IntegrationLogRow[], total: count ?? 0 };
  });

/** Resumo de erros recentes (últimas 24h) por integração. */
export const getIntegrationErrorSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertLogRead(context, "admin.integracoes");

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await context.supabase
      .from("integration_logs")
      .select("slug, created_at, message")
      .eq("level", "error")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const bySlug = new Map<string, { slug: string; count: number; lastAt: string; lastMessage: string | null }>();
    for (const r of data ?? []) {
      const cur = bySlug.get(r.slug);
      if (cur) cur.count += 1;
      else bySlug.set(r.slug, { slug: r.slug, count: 1, lastAt: r.created_at, lastMessage: r.message });
    }
    return { items: [...bySlug.values()].sort((a, b) => b.count - a.count) };
  });
