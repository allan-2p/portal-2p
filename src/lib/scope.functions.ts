import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getScopeForUser } from "./scope.server";
export type { FilterScope, MyScope, SFTeam } from "./scope.types";
import type { FilterScope, MyScope, SFTeam } from "./scope.types";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admin role required");
}

export const getMyScope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyScope> => {
    return getScopeForUser(context.supabase, context.userId);
  });

// ------------- Admin ------------- //

const SetScopeInput = z.object({
  user_id: z.string().uuid(),
  scope: z.enum(["geral", "pre_vendas", "carteira", "individual"]),
});

export const adminSetUserScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetScopeInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ filter_scope: data.scope })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SetSfIdInput = z.object({
  user_id: z.string().uuid(),
  sf_user_id: z.string().trim().min(0).max(32).nullable(),
});

export const adminSetUserSfId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetSfIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const value = data.sf_user_id && data.sf_user_id.length > 0 ? data.sf_user_id : null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ sf_user_id: value })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type TeamRow = { sf_user_id: string; team: SFTeam };

export const listSfTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: TeamRow[] }> => {
    const { data } = await context.supabase
      .from("salesforce_team_members")
      .select("sf_user_id, team");
    return { rows: (data ?? []) as TeamRow[] };
  });

const SetTeamInput = z.object({
  sf_user_id: z.string().min(3),
  team: z.enum(["pre_vendas", "carteira"]).nullable(),
});

export const adminSetSfTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetTeamInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.team) {
      const { error } = await supabaseAdmin
        .from("salesforce_team_members")
        .delete()
        .eq("sf_user_id", data.sf_user_id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("salesforce_team_members").upsert(
        { sf_user_id: data.sf_user_id, team: data.team, updated_at: new Date().toISOString() },
        { onConflict: "sf_user_id" },
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
