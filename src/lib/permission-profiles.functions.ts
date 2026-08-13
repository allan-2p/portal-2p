import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InstanceEnum = z.enum(["solar", "carregadores", "marketing"]);

export type PermissionProfile = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  features: { instance_id: string; feature_key: string }[];
  user_ids: string[];
};

async function assertAdmin(ctx: { supabase: any }) {
  const { data, error } = await ctx.supabase.rpc("is_admin");
  if (error || !data) throw new Error("Forbidden: admin role required");
}

// ---- Listar perfis (admin) ---- //
export const adminListPermissionProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ profiles: PermissionProfile[] }> => {
    await assertAdmin(context);
    const [{ data: profs }, { data: feats }, { data: links }] = await Promise.all([
      context.supabase.from("permission_profiles").select("*").order("name"),
      context.supabase.from("permission_profile_features").select("profile_id, instance_id, feature_key"),
      context.supabase.from("user_permission_profiles").select("profile_id, user_id"),
    ]);
    const featBy = new Map<string, { instance_id: string; feature_key: string }[]>();
    for (const f of feats ?? []) {
      const arr = featBy.get((f as any).profile_id) ?? [];
      arr.push({ instance_id: (f as any).instance_id, feature_key: (f as any).feature_key });
      featBy.set((f as any).profile_id, arr);
    }
    const usersBy = new Map<string, string[]>();
    for (const l of links ?? []) {
      const arr = usersBy.get((l as any).profile_id) ?? [];
      arr.push((l as any).user_id);
      usersBy.set((l as any).profile_id, arr);
    }
    return {
      profiles: (profs ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        is_system: p.is_system,
        features: featBy.get(p.id) ?? [],
        user_ids: usersBy.get(p.id) ?? [],
      })),
    };
  });

// ---- Criar / renomear ---- //
export const adminSavePermissionProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(2).max(60),
        description: z.string().max(300).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.id) {
      const { error } = await context.supabase
        .from("permission_profiles")
        .update({ name: data.name, description: data.description ?? null })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("permission_profiles")
      .insert({ name: data.name, description: data.description ?? null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as any).id as string };
  });

export const adminDeletePermissionProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("permission_profiles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Definir telas do perfil em uma instância ---- //
export const adminSetProfileFeatures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        profile_id: z.string().uuid(),
        instance_id: InstanceEnum,
        feature_keys: z.array(z.string().min(1).max(64)).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error: delErr } = await context.supabase
      .from("permission_profile_features")
      .delete()
      .eq("profile_id", data.profile_id)
      .eq("instance_id", data.instance_id);
    if (delErr) throw new Error(delErr.message);
    if (data.feature_keys.length) {
      const { error } = await context.supabase.from("permission_profile_features").insert(
        data.feature_keys.map((k) => ({
          profile_id: data.profile_id,
          instance_id: data.instance_id,
          feature_key: k,
        })),
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: data.feature_keys.length };
  });

// ---- Vincular perfis a um usuário ---- //
export const adminSetUserProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        profile_ids: z.array(z.string().uuid()).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error: delErr } = await context.supabase
      .from("user_permission_profiles")
      .delete()
      .eq("user_id", data.user_id);
    if (delErr) throw new Error(delErr.message);
    if (data.profile_ids.length) {
      const { error } = await context.supabase
        .from("user_permission_profiles")
        .insert(data.profile_ids.map((p) => ({ user_id: data.user_id, profile_id: p })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminGetUserProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ profile_ids: string[] }> => {
    await assertAdmin(context);
    const { data: rows } = await context.supabase
      .from("user_permission_profiles")
      .select("profile_id")
      .eq("user_id", data.user_id);
    return { profile_ids: (rows ?? []).map((r: any) => r.profile_id as string) };
  });
