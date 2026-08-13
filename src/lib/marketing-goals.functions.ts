import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordModeration } from "@/lib/moderation-audit.server";

export type MarketingGoalRow = {
  key: string;
  label: string;
  unit: string;
  period: string;
  goal: number;
  real_value: number;
};

export const listMarketingGoals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("marketing_goals")
      .select("key, label, unit, period, goal, real_value")
      .order("key");
    if (error) throw new Error(error.message);
    return { records: (data ?? []) as MarketingGoalRow[] };
  });

const SetInput = z.object({
  key: z.string().min(1).max(64),
  goal: z.number().min(0).max(9_999_999_999).optional(),
  real_value: z.number().min(0).max(9_999_999_999).optional(),
});

export const setMarketingGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Forbidden: admin role required");
    const patch: { goal?: number; real_value?: number; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };
    if (typeof data.goal === "number") patch.goal = data.goal;
    if (typeof data.real_value === "number") patch.real_value = data.real_value;
    const { error } = await context.supabase
      .from("marketing_goals")
      .update(patch)
      .eq("key", data.key);
    if (error) throw new Error(error.message);
    await recordModeration(context, {
      area: "marketing",
      instanceId: "marketing",
      action: "atualizou",
      target: data.key,
      summary: `Indicador de marketing "${data.key}" atualizado`,
      details: {
        ...(typeof data.goal === "number" ? { meta: data.goal } : {}),
        ...(typeof data.real_value === "number" ? { realizado: data.real_value } : {}),
      },
    });
    return { ok: true };
  });
