import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("is_admin");
  if (error || !data) throw new Error("Forbidden: admin role required");
}


/** Telas herdadas dos perfis de permissão vinculados ao usuário. */
async function profileGrantsFor(client: any, userId: string) {
  const { data: links } = await client
    .from("user_permission_profiles")
    .select("profile_id")
    .eq("user_id", userId);
  const ids = (links ?? []).map((r: any) => r.profile_id as string);
  if (!ids.length) return { features: [], instances: [], full_access: false } as ProfileGrants;
  const [{ data: feats }, { data: insts }, { data: profs }] = await Promise.all([
    client.from("permission_profile_features").select("instance_id, feature_key").in("profile_id", ids),
    client.from("permission_profile_instances").select("instance_id").in("profile_id", ids),
    client.from("permission_profiles").select("id, is_full_access").in("id", ids),
  ]);
  return {
    features: (feats ?? []).map((r: any) => ({
      instance_id: r.instance_id as string,
      feature_key: r.feature_key as string,
    })),
    instances: (insts ?? []).map((r: any) => r.instance_id as string),
    full_access: (profs ?? []).some((p: any) => p.is_full_access === true),
  };
}

type ProfileGrants = {
  features: { instance_id: string; feature_key: string }[];
  instances: string[];
  full_access?: boolean;
};

function mergeAccess(
  instances: string[],
  granted: { instance_id: string; feature_key: string }[],
  fromProfiles: ProfileGrants,
) {
  const seen = new Set(granted.map((g) => `${g.instance_id}::${g.feature_key}`));
  const all = [...granted];
  for (const g of fromProfiles.features) {
    const k = `${g.instance_id}::${g.feature_key}`;
    if (seen.has(k)) continue;
    seen.add(k);
    all.push(g);
  }
  const inst = new Set(instances);
  for (const g of fromProfiles.features) inst.add(g.instance_id);
  for (const i of fromProfiles.instances) inst.add(i);
  return { instances: [...inst], granted: all };
}

// ---- User self reads ---- //

export type UserAccess = {
  instances: string[];
  /** Features explicitamente liberadas. Sem linha = sem acesso (default deny). */
  granted: { instance_id: string; feature_key: string }[];
  is_admin: boolean;
};

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserAccess> => {
    const [{ data: inst }, { data: perms }, { data: isAdmin }] = await Promise.all([
      context.supabase
        .from("user_instance_access")
        .select("instance_id")
        .eq("user_id", context.userId),
      context.supabase
        .from("user_feature_permissions")
        .select("instance_id, feature_key, allowed")
        .eq("user_id", context.userId),
      context.supabase.rpc("is_admin"),
    ]);
    const fromProfiles = await profileGrantsFor(context.supabase, context.userId);
    const merged = mergeAccess(
      (inst ?? []).map((r: any) => r.instance_id as string),
      (perms ?? [])
        .filter((r: any) => r.allowed === true)
        .map((r: any) => ({ instance_id: r.instance_id, feature_key: r.feature_key })),
      fromProfiles,
    );
    return { ...merged, is_admin: !!isAdmin };
  });

// ---- Admin: listar todos usuários + acessos ---- //

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  instances: string[]; // ids das instâncias liberadas
  granted: { instance_id: string; feature_key: string }[];
};

export const adminListAccessMatrix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ users: AdminUserRow[] }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles }, { data: instRows }, { data: permRows }, { data: roleRows }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id, email, full_name").order("full_name"),
        supabaseAdmin.from("user_instance_access").select("user_id, instance_id"),
        supabaseAdmin
          .from("user_feature_permissions")
          .select("user_id, instance_id, feature_key, allowed"),
        supabaseAdmin.from("user_roles").select("user_id, role"),
      ]);
    const adminSet = new Set(
      (roleRows ?? []).filter((r: any) => r.role === "admin").map((r: any) => r.user_id),
    );
    const instByUser = new Map<string, string[]>();
    for (const r of instRows ?? []) {
      const arr = instByUser.get((r as any).user_id) ?? [];
      arr.push((r as any).instance_id);
      instByUser.set((r as any).user_id, arr);
    }
    const grantByUser = new Map<string, { instance_id: string; feature_key: string }[]>();
    for (const r of permRows ?? []) {
      if ((r as any).allowed !== true) continue;
      const arr = grantByUser.get((r as any).user_id) ?? [];
      arr.push({ instance_id: (r as any).instance_id, feature_key: (r as any).feature_key });
      grantByUser.set((r as any).user_id, arr);
    }
    const users: AdminUserRow[] = (profiles ?? []).map((p: any) => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      is_admin: adminSet.has(p.id),
      instances: instByUser.get(p.id) ?? [],
      granted: grantByUser.get(p.id) ?? [],
    }));
    return { users };
  });

// ---- Admin: set instance access ---- //

const SetInstanceInput = z.object({
  user_id: z.string().uuid(),
  instance_id: z.enum(["solar", "carregadores", "marketing"]),
  allowed: z.boolean(),
});

export const adminSetInstanceAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetInstanceInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.allowed) {
      const { error } = await context.supabase
        .from("user_instance_access")
        .upsert(
          { user_id: data.user_id, instance_id: data.instance_id },
          { onConflict: "user_id,instance_id" },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("user_instance_access")
        .delete()
        .eq("user_id", data.user_id)
        .eq("instance_id", data.instance_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---- Admin: set feature permission (grant only; default é negado) ---- //

const SetFeatureInput = z.object({
  user_id: z.string().uuid(),
  instance_id: z.enum(["solar", "carregadores", "marketing"]),
  feature_key: z.string().min(1).max(64),
  allowed: z.boolean(),
});

export const adminSetFeaturePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetFeatureInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.allowed) {
      const { error } = await context.supabase.from("user_feature_permissions").upsert(
        {
          user_id: data.user_id,
          instance_id: data.instance_id,
          feature_key: data.feature_key,
          allowed: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,instance_id,feature_key" },
      );
      if (error) throw new Error(error.message);
    } else {
      // sem linha = sem acesso (default deny)
      const { error } = await context.supabase
        .from("user_feature_permissions")
        .delete()
        .eq("user_id", data.user_id)
        .eq("instance_id", data.instance_id)
        .eq("feature_key", data.feature_key);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---- Admin: ler acesso de outro usuário (modo simulador) ---- //

export const adminGetUserAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<UserAccess> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: inst }, { data: perms }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("user_instance_access").select("instance_id").eq("user_id", data.user_id),
      supabaseAdmin
        .from("user_feature_permissions")
        .select("instance_id, feature_key, allowed")
        .eq("user_id", data.user_id),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user_id),
    ]);
    const fromProfiles = await profileGrantsFor(supabaseAdmin, data.user_id);
    const merged = mergeAccess(
      (inst ?? []).map((r: any) => r.instance_id as string),
      (perms ?? [])
        .filter((r: any) => r.allowed === true)
        .map((r: any) => ({ instance_id: r.instance_id, feature_key: r.feature_key })),
      fromProfiles,
    );
    return { ...merged, is_admin: (roles ?? []).some((r: any) => r.role === "admin") };
  });

// ---- Admin: aplicar perfil de permissão (substitui grants da instância) ---- //

const ApplyProfileInput = z.object({
  user_id: z.string().uuid(),
  instance_id: z.enum(["solar", "carregadores", "marketing"]),
  feature_keys: z.array(z.string().min(1).max(64)).max(200),
  /** Libera também o acesso à instância. */
  grant_instance: z.boolean().default(true),
});

export const adminApplyPermissionProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ApplyProfileInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { snapshotPermissions, recordAudit } = await import("@/lib/permission-audit.server");
    const before = await snapshotPermissions(context, [data.user_id], data.instance_id);
    if (data.grant_instance && data.feature_keys.length > 0) {
      await context.supabase
        .from("user_instance_access")
        .upsert(
          { user_id: data.user_id, instance_id: data.instance_id },
          { onConflict: "user_id,instance_id" },
        );
    }
    // Substitui todas as permissões dessa instância pelo conjunto do perfil.
    const { error: delErr } = await context.supabase
      .from("user_feature_permissions")
      .delete()
      .eq("user_id", data.user_id)
      .eq("instance_id", data.instance_id);
    if (delErr) throw new Error(delErr.message);

    if (data.feature_keys.length) {
      const now = new Date().toISOString();
      const { error } = await context.supabase.from("user_feature_permissions").upsert(
        data.feature_keys.map((k) => ({
          user_id: data.user_id,
          instance_id: data.instance_id,
          feature_key: k,
          allowed: true,
          updated_at: now,
        })),
        { onConflict: "user_id,instance_id,feature_key" },
      );
      if (error) throw new Error(error.message);
    }
    await recordAudit(context, {
      action: "profile",
      instance_id: data.instance_id,
      user_ids: [data.user_id],
      feature_keys: data.feature_keys,
      details: { label: "Perfil de permissão aplicado" },
      before,
    });
    return { ok: true, applied: data.feature_keys.length };
  });

// ---- Admin: edição em massa (vários usuários, mesmas features) ---- //

const BulkFeaturesInput = z.object({
  user_ids: z.array(z.string().uuid()).min(1).max(200),
  instance_id: z.enum(["solar", "carregadores", "marketing"]),
  feature_keys: z.array(z.string().min(1).max(64)).min(1).max(200),
  allowed: z.boolean(),
  /** Ao liberar, também garante acesso à instância. */
  grant_instance: z.boolean().default(true),
});

export const adminBulkSetFeaturePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BulkFeaturesInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { snapshotPermissions, recordAudit } = await import("@/lib/permission-audit.server");
    const before = await snapshotPermissions(context, data.user_ids, data.instance_id);
    if (data.allowed) {
      if (data.grant_instance) {
        const { error: instErr } = await context.supabase
          .from("user_instance_access")
          .upsert(
            data.user_ids.map((uid) => ({ user_id: uid, instance_id: data.instance_id })),
            { onConflict: "user_id,instance_id" },
          );
        if (instErr) throw new Error(instErr.message);
      }
      const now = new Date().toISOString();
      const rows = data.user_ids.flatMap((uid) =>
        data.feature_keys.map((k) => ({
          user_id: uid,
          instance_id: data.instance_id,
          feature_key: k,
          allowed: true,
          updated_at: now,
        })),
      );
      const { error } = await context.supabase
        .from("user_feature_permissions")
        .upsert(rows, { onConflict: "user_id,instance_id,feature_key" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("user_feature_permissions")
        .delete()
        .in("user_id", data.user_ids)
        .eq("instance_id", data.instance_id)
        .in("feature_key", data.feature_keys);
      if (error) throw new Error(error.message);
    }
    await recordAudit(context, {
      action: data.allowed ? "bulk_grant" : "bulk_revoke",
      instance_id: data.instance_id,
      user_ids: data.user_ids,
      feature_keys: data.feature_keys,
      details: { grant_instance: data.grant_instance },
      before,
    });
    return { ok: true, users: data.user_ids.length, features: data.feature_keys.length };
  });

// ---- Admin: log de auditoria de permissões + desfazer ---- //

export type PermissionAuditRow = {
  id: string;
  actor_email: string | null;
  action: string;
  instance_id: string;
  user_ids: string[];
  feature_keys: string[];
  details: Record<string, any>;
  undone_at: string | null;
  created_at: string;
};

export const adminListPermissionAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ logs: PermissionAuditRow[] }> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("permission_audit_log")
      .select("id, actor_email, action, instance_id, user_ids, feature_keys, details, undone_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { logs: (data ?? []) as PermissionAuditRow[] };
  });

export const adminUndoPermissionChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ log_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { restoreSnapshot } = await import("@/lib/permission-audit.server");
    const { data: log, error } = await context.supabase
      .from("permission_audit_log")
      .select("id, instance_id, user_ids, before_state, undone_at")
      .eq("id", data.log_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!log) throw new Error("Registro não encontrado");
    if (log.undone_at) throw new Error("Esta alteração já foi desfeita");

    await restoreSnapshot(context, {
      instance_id: log.instance_id,
      user_ids: log.user_ids ?? [],
      before_state: (log.before_state ?? { perms: [], instances: [] }) as any,
    });

    const { error: updErr } = await context.supabase
      .from("permission_audit_log")
      .update({ undone_at: new Date().toISOString(), undone_by: context.userId })
      .eq("id", log.id);
    if (updErr) throw new Error(updErr.message);
    return { ok: true };
  });
