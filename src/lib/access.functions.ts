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
  denied: { instance_id: string; feature_key: string }[];
};

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserAccess> => {
    const [{ data: inst }, { data: perms }] = await Promise.all([
      context.supabase
        .from("user_instance_access")
        .select("instance_id")
        .eq("user_id", context.userId),
      context.supabase
        .from("user_feature_permissions")
        .select("instance_id, feature_key, allowed")
        .eq("user_id", context.userId),
    ]);
    return {
      instances: (inst ?? []).map((r: any) => r.instance_id as string),
      denied: (perms ?? [])
        .filter((r: any) => r.allowed === false)
        .map((r: any) => ({ instance_id: r.instance_id, feature_key: r.feature_key })),
    };
  });

// ---- Admin: listar todos usuários + acessos ---- //

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  instances: string[]; // ids das instâncias liberadas
  denied: { instance_id: string; feature_key: string }[];
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
    const denyByUser = new Map<string, { instance_id: string; feature_key: string }[]>();
    for (const r of permRows ?? []) {
      if ((r as any).allowed !== false) continue;
      const arr = denyByUser.get((r as any).user_id) ?? [];
      arr.push({ instance_id: (r as any).instance_id, feature_key: (r as any).feature_key });
      denyByUser.set((r as any).user_id, arr);
    }
    const users: AdminUserRow[] = (profiles ?? []).map((p: any) => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      is_admin: adminSet.has(p.id),
      instances: instByUser.get(p.id) ?? [],
      denied: denyByUser.get(p.id) ?? [],
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

// ---- Admin: set feature permission (deny only; default é permitido) ---- //

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
      // remove deny row → volta ao padrão (permitido)
      const { error } = await context.supabase
        .from("user_feature_permissions")
        .delete()
        .eq("user_id", data.user_id)
        .eq("instance_id", data.instance_id)
        .eq("feature_key", data.feature_key);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("user_feature_permissions").upsert(
        {
          user_id: data.user_id,
          instance_id: data.instance_id,
          feature_key: data.feature_key,
          allowed: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,instance_id,feature_key" },
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
