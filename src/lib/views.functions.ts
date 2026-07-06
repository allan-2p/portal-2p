import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admin role required");
}

// ---- Preferência pessoal (toggle "Ver como") ----

export const getMyViewPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Record<string, string>> => {
    const { data, error } = await context.supabase
      .from("user_view_preferences")
      .select("screen, variant_key")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const out: Record<string, string> = {};
    for (const r of data ?? []) out[(r as any).screen] = (r as any).variant_key;
    return out;
  });

const SetPrefInput = z.object({
  screen: z.string().min(1).max(64),
  variant_key: z.string().min(1).max(64).nullable(),
});

export const setMyViewPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetPrefInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.variant_key == null) {
      const { error } = await context.supabase
        .from("user_view_preferences")
        .delete()
        .eq("user_id", context.userId)
        .eq("screen", data.screen);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("user_view_preferences").upsert(
        {
          user_id: context.userId,
          screen: data.screen,
          variant_key: data.variant_key,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,screen" },
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---- Roteamento de variantes por (role,cargo,instance) — admin ----

export type VariantRow = {
  id: string;
  screen: string;
  role: string | null;
  cargo: string | null;
  instance_id: string | null;
  variant_key: string;
  label: string | null;
  enabled: boolean;
};

export const listVariantRoutings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VariantRow[]> => {
    const { data, error } = await context.supabase
      .from("view_variants")
      .select("id, screen, role, cargo, instance_id, variant_key, label, enabled")
      .order("screen")
      .order("role");
    if (error) throw new Error(error.message);
    return (data ?? []) as VariantRow[];
  });

const UpsertInput = z.object({
  id: z.string().uuid().optional(),
  screen: z.string().min(1).max(64),
  role: z.enum(["admin", "gerente", "vendedor", "diretor", "marketing"]).nullable(),
  cargo: z.string().max(64).nullable(),
  instance_id: z.enum(["solar", "carregadores", "marketing"]).nullable(),
  variant_key: z.string().min(1).max(64),
  label: z.string().max(120).nullable(),
  enabled: z.boolean().default(true),
});

export const adminUpsertVariantRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const payload = {
      screen: data.screen,
      role: data.role,
      cargo: data.cargo,
      instance_id: data.instance_id,
      variant_key: data.variant_key,
      label: data.label,
      enabled: data.enabled,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("view_variants")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("view_variants")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (ins as any).id as string };
  });

export const adminDeleteVariantRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("view_variants").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
