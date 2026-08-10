import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("is_admin");
  if (error || !data) throw new Error("Forbidden: admin role required");
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
    return {
      instances: (inst ?? []).map((r: any) => r.instance_id as string),
      granted: (perms ?? [])
        .filter((r: any) => r.allowed === true)
        .map((r: any) => ({ instance_id: r.instance_id, feature_key: r.feature_key })),
      is_admin: !!isAdmin,
    };
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
    return {
      instances: (inst ?? []).map((r: any) => r.instance_id as string),
      granted: (perms ?? [])
        .filter((r: any) => r.allowed === true)
        .map((r: any) => ({ instance_id: r.instance_id, feature_key: r.feature_key })),
      is_admin: (roles ?? []).some((r: any) => r.role === "admin"),
    };
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
    return { ok: true, applied: data.feature_keys.length };
  });
