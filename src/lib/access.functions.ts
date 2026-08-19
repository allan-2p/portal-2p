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
  if (!ids.length)
    return {
      features: [],
      instances: [],
      full_access: false,
      default_instance: null,
      default_route: null,
    } as ProfileGrants;
  const [{ data: feats }, { data: insts }, { data: profs }] = await Promise.all([
    client.from("permission_profile_features").select("instance_id, feature_key").in("profile_id", ids),
    client.from("permission_profile_instances").select("instance_id").in("profile_id", ids),
    client
      .from("permission_profiles")
      .select("id, is_full_access, default_instance, default_route")
      .in("id", ids),
  ]);
  return {
    features: (feats ?? []).map((r: any) => ({
      instance_id: r.instance_id as string,
      feature_key: r.feature_key as string,
    })),
    instances: (insts ?? []).map((r: any) => r.instance_id as string),
    full_access: (profs ?? []).some((p: any) => p.is_full_access === true),
    default_instance: (profs ?? []).find((p: any) => p.default_instance)?.default_instance ?? null,
    default_route: (profs ?? []).find((p: any) => p.default_route)?.default_route ?? null,
  };
}

/** Permissões extras concedidas direto no cadastro do usuário (fora do perfil). */
async function extraGrantsFor(client: any, userId: string) {
  const { data } = await client
    .from("user_extra_features")
    .select("instance_id, feature_key")
    .eq("user_id", userId);
  return (data ?? []).map((r: any) => ({
    instance_id: r.instance_id as string,
    feature_key: r.feature_key as string,
  }));
}

/** Soma perfis + permissões extras (extras também liberam a unidade). */
function withExtras(
  fromProfiles: ProfileGrants,
  extras: { instance_id: string; feature_key: string }[],
): ProfileGrants {
  if (!extras.length) return fromProfiles;
  return {
    ...fromProfiles,
    features: [...fromProfiles.features, ...extras],
    instances: [...new Set([...fromProfiles.instances, ...extras.map((e) => e.instance_id)])],
  };
}

type ProfileGrants = {
  features: { instance_id: string; feature_key: string }[];
  instances: string[];
  full_access?: boolean;
  default_instance?: string | null;
  default_route?: string | null;
};

function mergeAccess(instances: string[], fromProfiles: ProfileGrants) {
  // Instâncias liberadas vêm SOMENTE do acesso direto (user_instance_access) e
  // das instâncias do perfil. Linhas de tela antigas de outra unidade não podem
  // reabrir uma instância que o perfil não libera (ex.: Closer Carregadores
  // continuar enxergando a Solar).
  const inst = new Set(instances);
  for (const i of fromProfiles.instances) inst.add(i);

  const seen = new Set<string>();
  const all: { instance_id: string; feature_key: string }[] = [];
  for (const g of fromProfiles.features) {
    if (!inst.has(g.instance_id)) continue;
    const k = `${g.instance_id}::${g.feature_key}`;
    if (seen.has(k)) continue;
    seen.add(k);
    all.push(g);
  }
  return { instances: [...inst], granted: all };
}


// ---- User self reads ---- //

export type UserAccess = {
  instances: string[];
  /** Features explicitamente liberadas. Sem linha = sem acesso (default deny). */
  granted: { instance_id: string; feature_key: string }[];
  is_admin: boolean;
  /** Unidade inicial definida no perfil do usuário (null = padrão do portal). */
  default_instance: string | null;
  /** Página inicial definida no perfil do usuário. */
  default_route: string | null;
};

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserAccess> => {
    const [{ data: inst }, { data: isAdmin }] = await Promise.all([
      context.supabase
        .from("user_instance_access")
        .select("instance_id")
        .eq("user_id", context.userId),
      context.supabase.rpc("is_admin"),
    ]);
    const fromProfiles = withExtras(
      await profileGrantsFor(context.supabase, context.userId),
      await extraGrantsFor(context.supabase, context.userId),
    );
    const merged = mergeAccess(
      (inst ?? []).map((r: any) => r.instance_id as string),
      fromProfiles,
    );
    return {
      ...merged,
      is_admin: !!isAdmin || !!fromProfiles.full_access,
      default_instance: fromProfiles.default_instance ?? null,
      default_route: fromProfiles.default_route ?? null,
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
    const [{ data: profiles }, { data: instRows }, { data: linkRows }, { data: profFeatRows }, { data: roleRows }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id, email, full_name").order("full_name"),
        supabaseAdmin.from("user_instance_access").select("user_id, instance_id"),
        supabaseAdmin.from("user_permission_profiles").select("user_id, profile_id"),
        supabaseAdmin.from("permission_profile_features").select("profile_id, instance_id, feature_key"),
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
    // Acessos agora vêm exclusivamente dos Perfis.
    const featsByProfile = new Map<string, { instance_id: string; feature_key: string }[]>();
    for (const r of profFeatRows ?? []) {
      const arr = featsByProfile.get((r as any).profile_id) ?? [];
      arr.push({ instance_id: (r as any).instance_id, feature_key: (r as any).feature_key });
      featsByProfile.set((r as any).profile_id, arr);
    }
    const grantByUser = new Map<string, { instance_id: string; feature_key: string }[]>();
    for (const l of linkRows ?? []) {
      const uid = (l as any).user_id as string;
      const arr = grantByUser.get(uid) ?? [];
      const seen = new Set(arr.map((g) => `${g.instance_id}::${g.feature_key}`));
      for (const f of featsByProfile.get((l as any).profile_id) ?? []) {
        const k = `${f.instance_id}::${f.feature_key}`;
        if (seen.has(k)) continue;
        seen.add(k);
        arr.push(f);
      }
      grantByUser.set(uid, arr);
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

// ---- Admin: ler acesso de outro usuário (modo simulador) ---- //

export const adminGetUserAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<UserAccess> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: inst }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("user_instance_access").select("instance_id").eq("user_id", data.user_id),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user_id),
    ]);
    const fromProfiles = withExtras(
      await profileGrantsFor(supabaseAdmin, data.user_id),
      await extraGrantsFor(supabaseAdmin, data.user_id),
    );
    const merged = mergeAccess(
      (inst ?? []).map((r: any) => r.instance_id as string),
      fromProfiles,
    );
    return {
      ...merged,
      is_admin: (roles ?? []).some((r: any) => r.role === "admin") || !!fromProfiles.full_access,
      default_instance: fromProfiles.default_instance ?? null,
      default_route: fromProfiles.default_route ?? null,
    };
  });

// ---- Admin: logar de verdade como outro usuário ---- //

export const adminImpersonateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ email: string; token_hash: string }> => {
    await assertAdmin(context);
    if (data.user_id === context.userId) throw new Error("Você já está logado com este usuário.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target, error: tErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", data.user_id)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!target?.email) throw new Error("Usuário sem e-mail cadastrado.");

    const { data: link, error: lErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: target.email,
    });
    if (lErr) throw new Error(lErr.message);
    const token_hash = (link as any)?.properties?.hashed_token as string | undefined;
    if (!token_hash) throw new Error("Não foi possível gerar o acesso.");

    const { data: actor } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", context.userId)
      .maybeSingle();

    await supabaseAdmin.from("user_activity_log").insert({
      user_id: context.userId,
      email: actor?.email ?? null,
      event: "impersonate",
      detail: `Login como ${target.full_name ?? target.email} (${target.email})`,
    });

    return { email: target.email, token_hash };
  });
