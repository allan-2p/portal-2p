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


export type ModerationAuditRow = {
  id: string;
  area: string;
  instance_id: string;
  action: string;
  target: string | null;
  summary: string;
  details: Record<string, string | number | boolean | null> | null;
  actor_email: string | null;
  actor_name: string | null;
  created_at: string;
};

/** Histórico de alterações feitas nas telas de Moderação. Admin apenas. */
export const listModerationAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { area?: string; areas?: string[]; instanceId?: string; limit?: number; offset?: number }) => input,
  )
  .handler(async ({ data, context }) => {
    await assertFeature(context, "admin.metas", "editar");

    const limit = Math.min(Math.max(data.limit ?? 10, 1), 100);
    const offset = Math.max(data.offset ?? 0, 0);

    let q = context.supabase
      .from("moderation_audit_log")
      .select("id, area, instance_id, action, target, summary, details, actor_email, actor_name, created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (data.area) q = q.eq("area", data.area);
    else if (data.areas?.length) q = q.in("area", data.areas);
    if (data.instanceId) q = q.eq("instance_id", data.instanceId);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as ModerationAuditRow[], total: count ?? 0 };
  });
