/** Helpers server-only para o log de auditoria de permissões. */

type Ctx = { supabase: any; userId: string };

export type PermSnapshotRow = { user_id: string; instance_id: string; feature_key: string };

export async function snapshotPermissions(
  ctx: Ctx,
  userIds: string[],
  instanceId: string,
): Promise<{ perms: PermSnapshotRow[]; instances: string[] }> {
  const [{ data: perms }, { data: inst }] = await Promise.all([
    ctx.supabase
      .from("user_feature_permissions")
      .select("user_id, instance_id, feature_key")
      .in("user_id", userIds)
      .eq("instance_id", instanceId),
    ctx.supabase
      .from("user_instance_access")
      .select("user_id")
      .in("user_id", userIds)
      .eq("instance_id", instanceId),
  ]);
  return {
    perms: (perms ?? []) as PermSnapshotRow[],
    instances: (inst ?? []).map((r: any) => r.user_id as string),
  };
}

export async function recordAudit(
  ctx: Ctx,
  entry: {
    action: string;
    instance_id: string;
    user_ids: string[];
    feature_keys: string[];
    details?: Record<string, unknown>;
    before: { perms: PermSnapshotRow[]; instances: string[] };
  },
) {
  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("email")
    .eq("id", ctx.userId)
    .maybeSingle();
  await ctx.supabase.from("permission_audit_log").insert({
    actor_id: ctx.userId,
    actor_email: profile?.email ?? null,
    action: entry.action,
    instance_id: entry.instance_id,
    user_ids: entry.user_ids,
    feature_keys: entry.feature_keys,
    details: entry.details ?? {},
    before_state: entry.before as unknown as Record<string, unknown>,
  });
}

/** Restaura o estado anterior registrado em um log. */
export async function restoreSnapshot(
  ctx: Ctx,
  log: {
    instance_id: string;
    user_ids: string[];
    before_state: { perms: PermSnapshotRow[]; instances: string[] };
  },
) {
  const userIds = log.user_ids ?? [];
  if (userIds.length === 0) return;
  const before = log.before_state ?? { perms: [], instances: [] };

  const { error: delErr } = await ctx.supabase
    .from("user_feature_permissions")
    .delete()
    .in("user_id", userIds)
    .eq("instance_id", log.instance_id);
  if (delErr) throw new Error(delErr.message);

  if ((before.perms ?? []).length) {
    const now = new Date().toISOString();
    const { error } = await ctx.supabase.from("user_feature_permissions").upsert(
      before.perms.map((p) => ({
        user_id: p.user_id,
        instance_id: p.instance_id,
        feature_key: p.feature_key,
        allowed: true,
        updated_at: now,
      })),
      { onConflict: "user_id,instance_id,feature_key" },
    );
    if (error) throw new Error(error.message);
  }

  // Instâncias: revoga as que não existiam antes
  const hadInstance = new Set(before.instances ?? []);
  const toRevoke = userIds.filter((u) => !hadInstance.has(u));
  if (toRevoke.length) {
    await ctx.supabase
      .from("user_instance_access")
      .delete()
      .in("user_id", toRevoke)
      .eq("instance_id", log.instance_id);
  }
}
