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
    const records: AdminSalesperson[] = people.map((p: { id: string; name: string; email: string | null; title: string | null }) => ({
      ...p,
      hidden: hidden.has(p.id),
    }));
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

// ---------------- Metas de faturamento ---------------- //

export type SalespersonGoal = {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  monthlyGoal: number;
  updatedAt: string | null;
};

export const listSalespersonGoals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [people, goalsRes] = await Promise.all([
      fetchAllSFSalespeople(),
      context.supabase.from("salesperson_goals").select("sf_user_id, monthly_goal, updated_at"),
    ]);
    const goals = new Map<string, { monthly_goal: number; updated_at: string | null }>();
    for (const g of goalsRes.data ?? []) {
      goals.set(g.sf_user_id, {
        monthly_goal: Number(g.monthly_goal) || 0,
        updated_at: g.updated_at ?? null,
      });
    }
    const records: SalespersonGoal[] = people.map(
      (p: { id: string; name: string; email: string | null; title: string | null }) => {
        const g = goals.get(p.id);
        return {
          ...p,
          monthlyGoal: g?.monthly_goal ?? 0,
          updatedAt: g?.updated_at ?? null,
        };
      },
    );
    return { records };
  });

const SetGoalInput = z.object({
  sf_user_id: z.string().min(3),
  monthly_goal: z.number().min(0).max(999_999_999),
});

export const setSalespersonGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetGoalInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("salesperson_goals")
      .upsert({
        sf_user_id: data.sf_user_id,
        monthly_goal: data.monthly_goal,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

