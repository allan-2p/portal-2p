import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RoleEnum = z.enum(["admin", "gestor", "vendedor", "diretoria"]);

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admin role required");
}

const CreateInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  cargo: z.string().optional().nullable(),
  equipe: z.string().optional().nullable(),
  role: RoleEnum,
});

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pre-insert invite so trigger applies role/equipe/cargo/full_name on profile creation
    await supabaseAdmin.from("user_invites").upsert(
      {
        email: data.email,
        role: data.role,
        full_name: data.full_name,
        cargo: data.cargo ?? null,
        equipe: data.equipe ?? null,
        invited_by: context.userId,
      },
      { onConflict: "email" },
    );

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    return { id: created.user?.id };
  });

const InviteInput = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  cargo: z.string().optional().nullable(),
  equipe: z.string().optional().nullable(),
  role: RoleEnum,
  is_external: z.boolean().optional().default(false),
  sf_user_id: z.string().optional().nullable(),
  avatar_url: z.string().optional().nullable(),
});

export const adminInviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InviteInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("user_invites").upsert(
      {
        email: data.email,
        role: data.role,
        full_name: data.full_name,
        cargo: data.cargo ?? null,
        equipe: data.equipe ?? null,
        invited_by: context.userId,
        is_external: data.is_external ?? false,
        sf_user_id: data.sf_user_id ?? null,
        avatar_url: data.avatar_url ?? null,
      },
      { onConflict: "email" },
    );

    const origin = process.env.SITE_URL ?? "";
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.full_name },
      redirectTo: origin ? `${origin}/reset-password` : undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


const RoleInput = z.object({
  user_id: z.string().uuid(),
  role: RoleEnum,
});

export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RoleInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ToggleInput = z.object({ user_id: z.string().uuid(), ativo: z.boolean() });

export const adminToggleActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ToggleInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles").update({ ativo: data.ativo }).eq("id", data.user_id);
    if (!data.ativo) {
      await supabaseAdmin.auth.admin.updateUserById(data.user_id, { ban_duration: "876000h" });
    } else {
      await supabaseAdmin.auth.admin.updateUserById(data.user_id, { ban_duration: "none" });
    }
    return { ok: true };
  });

const DeleteInput = z.object({ user_id: z.string().uuid() });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.user_id === context.userId) throw new Error("Não é possível remover a si mesmo");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bootstrapFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) return { promoted: false };
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(error.message);
    return { promoted: true };
  });
