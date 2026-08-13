import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type IntegrationLogRow = {
  id: string;
  slug: string;
  level: "info" | "warn" | "error";
  event: string;
  message: string | null;
  detail: unknown;
  duration_ms: number | null;
  actor_email: string | null;
  created_at: string;
};

/** Histórico de sincronizações e erros — filtrável por integração e nível. */
export const listIntegrationLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { slug?: string; level?: "all" | "info" | "warn" | "error"; limit?: number; offset?: number }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin");
    if (roleError || !isAdmin) throw new Error("Forbidden: admin role required");

    const limit = Math.min(Math.max(data.limit ?? 10, 1), 100);
    const offset = Math.max(data.offset ?? 0, 0);

    let q = context.supabase
      .from("integration_logs")
      .select("id, slug, level, event, message, detail, duration_ms, actor_email, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (data.slug) q = q.eq("slug", data.slug);
    if (data.level && data.level !== "all") q = q.eq("level", data.level);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as IntegrationLogRow[], total: count ?? 0 };
  });

/** Resumo de erros recentes (últimas 24h) por integração. */
export const getIntegrationErrorSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin");
    if (roleError || !isAdmin) throw new Error("Forbidden: admin role required");

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
