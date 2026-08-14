/**
 * Guards de permissão no backend.
 *
 * O front esconde telas, mas quem realmente protege é isto: todo server fn
 * sensível chama `requireFeature` informando a instância, a tela (categoria)
 * e o tipo de ação (visualizar / editar / concluir / moderar).
 *
 * Modelo: default deny. Só passa quem é admin, quem tem perfil de acesso total
 * ou quem tem a tela liberada em um perfil vinculado — e desde que a ação
 * pedida exista nas capacidades daquela tela.
 */
import type { FeatureKey, InstanceId } from "@/lib/instances";
import { INSTANCES } from "@/lib/instances";
import { featuresForAreaAccessKey } from "@/lib/feature-groups";
import { capabilitiesForFeature, type CapabilityId } from "@/lib/feature-capabilities";

export type GuardContext = { supabase: any; userId: string };

export type GuardOptions = {
  instance: InstanceId;
  feature: FeatureKey;
  action: CapabilityId;
};

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

async function isAdmin(ctx: GuardContext): Promise<boolean> {
  const { data, error } = await ctx.supabase.rpc("is_admin");
  return !error && !!data;
}

type Resolved = {
  admin: boolean;
  fullAccess: boolean;
  instances: Set<string>;
  features: Set<string>; // "instance::feature"
};

/** Resolve tudo que o usuário pode, a partir dos perfis vinculados. */
export async function resolveAccess(ctx: GuardContext): Promise<Resolved> {
  const [admin, { data: links }, { data: userInst }] = await Promise.all([
    isAdmin(ctx),
    ctx.supabase.from("user_permission_profiles").select("profile_id").eq("user_id", ctx.userId),
    ctx.supabase.from("user_instance_access").select("instance_id").eq("user_id", ctx.userId),
  ]);

  const instances = new Set<string>((userInst ?? []).map((r: any) => r.instance_id as string));
  const features = new Set<string>();
  const ids = (links ?? []).map((r: any) => r.profile_id as string);
  if (!ids.length) return { admin, fullAccess: false, instances, features };

  const [{ data: feats }, { data: insts }, { data: profs }] = await Promise.all([
    ctx.supabase
      .from("permission_profile_features")
      .select("instance_id, feature_key")
      .in("profile_id", ids),
    ctx.supabase.from("permission_profile_instances").select("instance_id").in("profile_id", ids),
    ctx.supabase.from("permission_profiles").select("id, is_full_access").in("id", ids),
  ]);

  for (const r of insts ?? []) instances.add((r as any).instance_id);
  for (const r of feats ?? []) {
    const inst = (r as any).instance_id as string;
    const key = (r as any).feature_key as FeatureKey;
    instances.add(inst);
    features.add(`${inst}::${key}`);
    // Toggle de área libera as telas daquela área.
    for (const sub of featuresForAreaAccessKey(key)) features.add(`${inst}::${sub}`);
  }

  const fullAccess = (profs ?? []).some((p: any) => p.is_full_access === true);
  return { admin, fullAccess, instances, features };
}

/** Retorna true/false sem lançar erro. */
export async function canFeature(ctx: GuardContext, opts: GuardOptions): Promise<boolean> {
  if (!capabilitiesForFeature(opts.feature).includes(opts.action)) return false;
  const acc = await resolveAccess(ctx);
  if (acc.admin || acc.fullAccess) return true;
  if (!acc.instances.has(opts.instance)) return false;
  if (!INSTANCES[opts.instance].routes.includes(opts.feature)) return false;
  return acc.features.has(`${opts.instance}::${opts.feature}`);
}

/** Lança ForbiddenError quando o perfil não permite a ação. */
export async function requireFeature(ctx: GuardContext, opts: GuardOptions): Promise<void> {
  const ok = await canFeature(ctx, opts);
  if (!ok) {
    throw new ForbiddenError(
      `Forbidden: seu perfil não permite "${opts.action}" em "${opts.feature}" (${opts.instance}).`,
    );
  }
}

/** Aceita a ação em qualquer uma das telas informadas (ex.: Solar ou Carregadores). */
export async function requireAnyFeature(
  ctx: GuardContext,
  options: GuardOptions[],
): Promise<void> {
  for (const o of options) {
    if (await canFeature(ctx, o)) return;
  }
  const first = options[0];
  throw new ForbiddenError(
    `Forbidden: seu perfil não permite "${first?.action}" nesta área.`,
  );
}

/** Guard de área administrativa (Configurações / Moderação / Integrações). */
export async function requireAdminArea(
  ctx: GuardContext,
  area: "configuracoes" | "moderacao" | "integracoes",
  action: CapabilityId = "moderar",
): Promise<void> {
  const key = `admin.area.${area}` as FeatureKey;
  const acc = await resolveAccess(ctx);
  if (acc.admin || acc.fullAccess) return;
  for (const inst of acc.instances) {
    if (acc.features.has(`${inst}::${key}`)) return;
  }
  throw new ForbiddenError(`Forbidden: acesso à área de ${area} não liberado (${action}).`);
}
