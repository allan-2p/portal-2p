/** Registro de auditoria das moderações (server-side, dentro de server functions). */

type Ctx = { supabase: any; userId: string };

export type ModerationAuditEntry = {
  area: string;
  instanceId?: string;
  action: string;
  target?: string | null;
  summary: string;
  details?: Record<string, unknown>;
};

/**
 * Grava um registro de auditoria. Nunca lança: uma falha no log não pode
 * derrubar a alteração de moderação que o usuário acabou de fazer.
 */
export async function recordModeration(ctx: Ctx, entry: ModerationAuditEntry): Promise<void> {
  try {
    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", ctx.userId)
      .maybeSingle();

    await ctx.supabase.from("moderation_audit_log").insert({
      area: entry.area,
      instance_id: entry.instanceId ?? "grupo",
      action: entry.action,
      target: entry.target ?? null,
      summary: entry.summary,
      details: entry.details ?? {},
      actor_id: ctx.userId,
      actor_email: profile?.email ?? null,
      actor_name: profile?.full_name ?? null,
    });
  } catch {
    /* auditoria é best-effort */
  }
}
