/**
 * Resolução das permissões por objeto (Basic / Manager Access).
 *
 * Modelo: default deny. As permissões vêm dos perfis vinculados ao usuário
 * (`user_permission_profiles` -> `permission_profile_object_perms`), somadas
 * por OU quando há mais de um perfil. Admin e perfil de acesso total recebem
 * tudo. As checagens ficam no servidor — o front apenas esconde botões.
 */
import {
  EMPTY_PERM,
  FULL_PERM,
  normalizePerm,
  OBJECT_KEYS,
  type ObjectKey,
  type ObjectPerm,
  type ObjectPermMap,
} from "./object-perms";

export type PermContext = { supabase: any; userId: string };

export class ForbiddenObjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenObjectError";
  }
}

function or(a: ObjectPerm, b: Partial<ObjectPerm>): ObjectPerm {
  return {
    can_read: a.can_read || !!b.can_read,
    can_create: a.can_create || !!b.can_create,
    can_edit: a.can_edit || !!b.can_edit,
    can_delete: a.can_delete || !!b.can_delete,
    view_all: a.view_all || !!b.view_all,
    modify_all: a.modify_all || !!b.modify_all,
    view_all_fields: a.view_all_fields || !!b.view_all_fields,
  };
}

/** Permissões efetivas do usuário atual naquela instância. */
export async function getObjectPerms(
  ctx: PermContext,
  instancia: string,
): Promise<ObjectPermMap> {
  const map = OBJECT_KEYS.reduce((acc, k) => {
    acc[k] = { ...EMPTY_PERM };
    return acc;
  }, {} as ObjectPermMap);

  const { data: isAdmin } = await ctx.supabase.rpc("is_admin");
  if (isAdmin) {
    for (const k of OBJECT_KEYS) map[k] = { ...FULL_PERM };
    return map;
  }

  const { data: links } = await ctx.supabase
    .from("user_permission_profiles")
    .select("profile_id")
    .eq("user_id", ctx.userId);
  const ids = (links ?? []).map((r: any) => r.profile_id as string);
  if (!ids.length) return map;

  const { data: profs } = await ctx.supabase
    .from("permission_profiles")
    .select("id, is_full_access")
    .in("id", ids);
  if ((profs ?? []).some((p: any) => p.is_full_access === true)) {
    for (const k of OBJECT_KEYS) map[k] = { ...FULL_PERM };
    return map;
  }

  const { data: rows } = await ctx.supabase
    .from("permission_profile_object_perms")
    .select(
      "object_key, can_read, can_create, can_edit, can_delete, view_all, modify_all, view_all_fields",
    )
    .in("profile_id", ids)
    .eq("instance_id", instancia);

  for (const r of rows ?? []) {
    const key = (r as any).object_key as ObjectKey;
    if (!OBJECT_KEYS.includes(key)) continue;
    map[key] = or(map[key], r as any);
  }
  for (const k of OBJECT_KEYS) map[k] = normalizePerm(map[k]);
  return map;
}

export async function getPerm(
  ctx: PermContext,
  instancia: string,
  object: ObjectKey,
): Promise<ObjectPerm> {
  return (await getObjectPerms(ctx, instancia))[object];
}

const NOMES: Record<ObjectKey, string> = {
  contas: "clientes",
  contatos: "contatos",
  propostas: "propostas",
  pedidos: "pedidos",
  tarefas: "tarefas",
};

export function assertPodeLer(perm: ObjectPerm, object: ObjectKey) {
  if (!perm.can_read) {
    throw new ForbiddenObjectError(`Você não tem permissão para ver ${NOMES[object]}.`);
  }
}

export function assertPodeCriar(perm: ObjectPerm, object: ObjectKey) {
  if (!perm.can_create) {
    throw new ForbiddenObjectError(`Você não tem permissão para criar ${NOMES[object]}.`);
  }
}

/** Editar: precisa de can_edit e, se o registro é de outro dono, de modify_all. */
export function assertPodeEditar(
  perm: ObjectPerm,
  object: ObjectKey,
  dono: string | null,
  userId: string,
) {
  if (!perm.can_edit) {
    throw new ForbiddenObjectError(`Você não tem permissão para editar ${NOMES[object]}.`);
  }
  if (dono && dono !== userId && !perm.modify_all) {
    throw new ForbiddenObjectError(
      `Este registro pertence a outro consultor. É necessário "Modify All Records".`,
    );
  }
}

export function assertPodeExcluir(
  perm: ObjectPerm,
  object: ObjectKey,
  dono: string | null,
  userId: string,
) {
  if (!perm.can_delete) {
    throw new ForbiddenObjectError(`Você não tem permissão para excluir ${NOMES[object]}.`);
  }
  if (dono && dono !== userId && !perm.modify_all) {
    throw new ForbiddenObjectError(
      `Este registro pertence a outro consultor. É necessário "Modify All Records".`,
    );
  }
}

/** Filtra uma lista de registros pelo dono quando não há View All Records. */
export function filtrarPorDono<T extends Record<string, any>>(
  rows: T[],
  perm: ObjectPerm,
  userId: string,
  campoDono = "created_by",
): T[] {
  if (perm.view_all) return rows;
  return rows.filter((r) => (r[campoDono] ?? null) === userId);
}
