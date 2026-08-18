import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InstanceEnum = z.enum(["solar", "carregadores", "marketing"]);

export type PermissionProfile = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_full_access: boolean;
  /** Unidade inicial do perfil (página que abre ao entrar no portal). */
  default_instance: string | null;
  /** Rota inicial do perfil dentro dessa unidade. */
  default_route: string | null;
  features: { instance_id: string; feature_key: string }[];
  instances: string[];
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
    const [{ data: profs }, { data: feats }, { data: links }, { data: insts }] = await Promise.all([
      context.supabase.from("permission_profiles").select("*").order("name"),
      context.supabase.from("permission_profile_features").select("profile_id, instance_id, feature_key"),
      context.supabase.from("user_permission_profiles").select("profile_id, user_id"),
      context.supabase.from("permission_profile_instances").select("profile_id, instance_id"),
    ]);
    const instBy = new Map<string, string[]>();
    for (const r of insts ?? []) {
      const arr = instBy.get((r as any).profile_id) ?? [];
      arr.push((r as any).instance_id);
      instBy.set((r as any).profile_id, arr);
    }
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
        is_full_access: !!p.is_full_access,
        default_instance: p.default_instance ?? null,
        default_route: p.default_route ?? null,
        features: featBy.get(p.id) ?? [],
        instances: instBy.get(p.id) ?? [],
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
    const { data: prof } = await context.supabase
      .from("permission_profiles")
      .select("is_full_access")
      .eq("id", data.id)
      .maybeSingle();
    if ((prof as any)?.is_full_access) throw new Error("O perfil Administrador do Sistema não pode ser excluído");
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

// ---- Definir instâncias do perfil ---- //
export const adminSetProfileInstances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        profile_id: z.string().uuid(),
        instance_ids: z.array(InstanceEnum).max(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error: delErr } = await context.supabase
      .from("permission_profile_instances")
      .delete()
      .eq("profile_id", data.profile_id);
    if (delErr) throw new Error(delErr.message);
    if (data.instance_ids.length) {
      const { error } = await context.supabase
        .from("permission_profile_instances")
        .insert(data.instance_ids.map((i) => ({ profile_id: data.profile_id, instance_id: i })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---- Página inicial do perfil ---- //
export const adminSetProfileHome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        profile_id: z.string().uuid(),
        default_instance: InstanceEnum.nullable(),
        default_route: z.string().max(200).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("permission_profiles")
      .update({
        default_instance: data.default_instance,
        default_route: data.default_route,
      })
      .eq("id", data.profile_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Vincular perfis a um usuário ---- //
export const adminSetUserProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        profile_ids: z.array(z.string().uuid()).max(1),
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
