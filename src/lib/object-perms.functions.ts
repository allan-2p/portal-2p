/**
 * Server fns do modelo de permissões por objeto:
 * - `meusObjectPermsFn`: o que o usuário atual pode fazer na instância (usado
 *   pelo front só para esconder botões — a checagem real é no servidor).
 * - `listarObjectPermsPerfilFn` / `salvarObjectPermsPerfilFn`: administração
 *   da matriz Basic/Manager por perfil.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getObjectPerms } from "./object-perms.server";
import { normalizePerm, OBJECT_KEYS, type ObjectKey, type ObjectPerm } from "./object-perms";

const instanciaSchema = z.string().min(1).max(30);

export const meusObjectPermsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ instancia: instanciaSchema }).parse(input))
  .handler(async ({ data, context }) => getObjectPerms(context as any, data.instancia));

async function assertAdmin(ctx: { supabase: any }) {
  const { data, error } = await ctx.supabase.rpc("is_admin");
  if (error || !data) throw new Error("Apenas administradores podem alterar permissões.");
}

export const listarObjectPermsPerfilFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ profileId: z.string().uuid(), instancia: instanciaSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("permission_profile_object_perms")
      .select(
        "object_key, can_read, can_create, can_edit, can_delete, view_all, modify_all, view_all_fields",
      )
      .eq("profile_id", data.profileId)
      .eq("instance_id", data.instancia);
    return (rows ?? []) as Array<{ object_key: ObjectKey } & ObjectPerm>;
  });

const permSchema = z.object({
  object_key: z.enum(OBJECT_KEYS),
  can_read: z.boolean(),
  can_create: z.boolean(),
  can_edit: z.boolean(),
  can_delete: z.boolean(),
  view_all: z.boolean(),
  modify_all: z.boolean(),
  view_all_fields: z.boolean(),
});

export const salvarObjectPermsPerfilFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        profileId: z.string().uuid(),
        instancia: instanciaSchema,
        perms: z.array(permSchema),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const linhas = data.perms.map((p) => {
      const { object_key, ...flags } = p;
      return {
        profile_id: data.profileId,
        instance_id: data.instancia,
        object_key,
        ...normalizePerm(flags as ObjectPerm),
      };
    });
    const { error } = await context.supabase
      .from("permission_profile_object_perms")
      .upsert(linhas, { onConflict: "profile_id,instance_id,object_key" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
