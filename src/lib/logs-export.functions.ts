import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Fontes de log que podem ser exportadas em CSV. */
const Input = z.object({
  source: z.enum(["atividade", "integracoes", "moderacao"]),
  days: z.number().int().min(1).max(365).default(30),
  limit: z.number().int().min(10).max(5000).default(2000),
});

const SOURCE_FEATURE = {
  atividade: "admin.atividade",
  integracoes: "admin.logs.integracoes",
  moderacao: "admin.logs.moderacao",
} as const;

const SOURCE_TABLE = {
  atividade: {
    table: "user_activity_log",
    cols: "created_at, email, event, detail, ip, user_agent",
  },
  integracoes: {
    table: "integration_logs",
    cols: "created_at, slug, level, event, message, duration_ms, actor_email",
  },
  moderacao: {
    table: "moderation_audit_log",
    cols: "created_at, area, instance_id, action, target, summary, actor_email",
  },
} as const;

function toCsv(rows: Record<string, unknown>[], cols: string[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.join(";");
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(";"));
  return [head, ...body].join("\n");
}

/**
 * Exporta registros de log em CSV. Exige a permissão dedicada
 * "Logs • Exportar registros" **e** a permissão de leitura da fonte.
 */
export const exportLogsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<{ filename: string; csv: string; rows: number }> => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context, "admin.logs.exportar", "visualizar");
    await requireAdminFeature(context, SOURCE_FEATURE[data.source], "visualizar");

    const { table, cols } = SOURCE_TABLE[data.source];
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from(table)
      .select(cols)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as unknown as Record<string, unknown>[];
    const colList = cols.split(",").map((c) => c.trim());
    const stamp = new Date().toISOString().slice(0, 10);

    return {
      filename: `log-${data.source}-${stamp}.csv`,
      csv: toCsv(list, colList),
      rows: list.length,
    };
  });
