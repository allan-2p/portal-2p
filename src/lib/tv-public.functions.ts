import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public (no-auth) endpoints for the shared TV dashboard.
// The TV runs on a public URL, so it cannot rely on a Supabase session.
// These wrappers use the server-side admin client to read shared goal data.

const MonthInput = z.object({
  year: z.number().int().min(2000).max(3000),
  month: z.number().int().min(1).max(12),
});

export const getPublicMonthGoalTotal = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => MonthInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("salesperson_goals")
      .select("monthly_goal")
      .eq("year", data.year)
      .eq("month", data.month)
      .eq("active", true);
    if (error) throw new Error(error.message);
    const total = (rows ?? []).reduce(
      (acc: number, r: { monthly_goal: number | string }) => acc + (Number(r.monthly_goal) || 0),
      0,
    );
    return { total, count: rows?.length ?? 0 };
  });

export const getPublicGroupKpiGoals = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("group_kpi_goals")
      .select("kpi_key, label, period_type, goal");
    if (error) throw new Error(error.message);
    const records = (rows ?? []).map((r: any) => ({
      kpi_key: r.kpi_key as string,
      label: r.label as string,
      period_type: r.period_type as "mensal" | "trimestral",
      goal: Number(r.goal) || 0,
    }));
    return { records };
  },
);
