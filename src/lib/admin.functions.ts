import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admin role required");
}

async function fetchAllSFSalespeople() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const sfKey = process.env.SALESFORCE_API_KEY;
  if (!lovableKey || !sfKey) throw new Error("Salesforce connector não está configurado.");
  const soql =
    `SELECT Id, Name, Email, Title, IsActive FROM User ` +
    `WHERE IsActive = true AND Email LIKE '%@2pgroup.com.br' ` +
    `ORDER BY Name ASC LIMIT 500`;
  const res = await fetch(`${GATEWAY_URL}/query?q=${encodeURIComponent(soql)}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": sfKey,
      "Content-Type": "application/json",
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Salesforce ${res.status}: ${JSON.stringify(body)}`);
  return (body?.records ?? []).map((r: any) => ({
    id: r.Id as string,
    name: r.Name as string,
    email: (r.Email ?? null) as string | null,
    title: (r.Title ?? null) as string | null,
  }));
}

export type AdminSalesperson = {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  hidden: boolean;
};

export const listSalespeopleForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [people, hiddenRes] = await Promise.all([
      fetchAllSFSalespeople(),
      context.supabase.from("hidden_salespeople").select("sf_user_id"),
    ]);
    const hidden = new Set<string>((hiddenRes.data ?? []).map((r: any) => r.sf_user_id));
    const records: AdminSalesperson[] = people.map(
      (p: { id: string; name: string; email: string | null; title: string | null }) => ({
        ...p,
        hidden: hidden.has(p.id),
      }),
    );
    return { records };
  });

const SetVisibilityInput = z.object({
  sf_user_id: z.string().min(3),
  hidden: z.boolean(),
});

export const setSalespersonVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetVisibilityInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.hidden) {
      const { error } = await context.supabase
        .from("hidden_salespeople")
        .upsert({ sf_user_id: data.sf_user_id, hidden_by: context.userId });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("hidden_salespeople")
        .delete()
        .eq("sf_user_id", data.sf_user_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------------- Metas mensais (com histórico) ---------------- //

export type SalespersonMonthlyGoals = {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  /** key = `${year}-${month}` (month 1-12) */
  goals: Record<string, number>;
  /** key = `${year}-${month}` -> active flag. Missing = inactive. */
  active: Record<string, boolean>;
};

const ListGoalsInput = z.object({
  year: z.number().int().min(2020).max(2100),
  months: z.array(z.number().int().min(1).max(12)).min(1).max(12),
});

export const listSalespersonGoals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListGoalsInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const [people, goalsRes] = await Promise.all([
      fetchAllSFSalespeople(),
      context.supabase
        .from("salesperson_goals")
        .select("sf_user_id, year, month, monthly_goal, active")
        .eq("year", data.year)
        .in("month", data.months),
    ]);
    const goalsByUser = new Map<string, Record<string, number>>();
    const activeByUser = new Map<string, Record<string, boolean>>();
    for (const g of (goalsRes.data ?? []) as Array<{
      sf_user_id: string;
      year: number;
      month: number;
      monthly_goal: number | string;
      active: boolean;
    }>) {
      const key = `${g.year}-${g.month}`;
      const gm = goalsByUser.get(g.sf_user_id) ?? {};
      gm[key] = Number(g.monthly_goal) || 0;
      goalsByUser.set(g.sf_user_id, gm);
      const am = activeByUser.get(g.sf_user_id) ?? {};
      am[key] = !!g.active;
      activeByUser.set(g.sf_user_id, am);
    }
    const records: SalespersonMonthlyGoals[] = people.map(
      (p: { id: string; name: string; email: string | null; title: string | null }) => ({
        ...p,
        goals: goalsByUser.get(p.id) ?? {},
        active: activeByUser.get(p.id) ?? {},
      }),
    );
    return { records };
  });

const SetGoalInput = z.object({
  sf_user_id: z.string().min(3),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  monthly_goal: z.number().min(0).max(999_999_999),
});

export const setSalespersonGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetGoalInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("salesperson_goals").upsert(
      {
        sf_user_id: data.sf_user_id,
        year: data.year,
        month: data.month,
        monthly_goal: data.monthly_goal,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "sf_user_id,year,month" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Ativar/desativar meta por trimestre ---------- //

const SetQuarterActiveInput = z.object({
  sf_user_id: z.string().min(3),
  year: z.number().int().min(2020).max(2100),
  months: z.array(z.number().int().min(1).max(12)).min(1).max(12),
  active: z.boolean(),
});

export const setQuarterGoalActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetQuarterActiveInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const rows = data.months.map((m) => ({
      sf_user_id: data.sf_user_id,
      year: data.year,
      month: m,
      active: data.active,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await context.supabase
      .from("salesperson_goals")
      .upsert(rows, { onConflict: "sf_user_id,year,month" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Meta do período atual (usada na home) ---------- //

const CurrentGoalInput = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  ownerId: z.string().nullable().optional(),
});

export const getMonthGoalTotal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CurrentGoalInput.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("salesperson_goals")
      .select("sf_user_id, monthly_goal")
      .eq("year", data.year)
      .eq("month", data.month)
      .eq("active", true);
    if (data.ownerId) q = q.eq("sf_user_id", data.ownerId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const total = (rows ?? []).reduce(
      (acc: number, r: { monthly_goal: number | string }) => acc + (Number(r.monthly_goal) || 0),
      0,
    );
    return { total, count: rows?.length ?? 0 };
  });

