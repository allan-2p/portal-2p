import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---- Metas de Faturamento (leitura para dashboards, respeita RLS) ---- //

const GoalsRangeInput = z.object({
  year: z.number().int().min(2020).max(2100),
  months: z.array(z.number().int().min(1).max(12)).min(1).max(12),
  sfUserIds: z.array(z.string().min(3)).min(1).max(50),
});

export type FaturamentoGoalRow = {
  sf_user_id: string;
  year: number;
  month: number;
  monthly_goal: number;
  active: boolean;
};

export const listFaturamentoGoalsForOwners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GoalsRangeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("salesperson_goals")
      .select("sf_user_id, year, month, monthly_goal, active")
      .eq("year", data.year)
      .in("month", data.months)
      .in("sf_user_id", data.sfUserIds);
    if (error) throw new Error(error.message);
    const records: FaturamentoGoalRow[] = (rows ?? []).map((r: any) => ({
      sf_user_id: r.sf_user_id,
      year: r.year,
      month: r.month,
      monthly_goal: Number(r.monthly_goal) || 0,
      active: !!r.active,
    }));
    return { records };
  });

// ---- Metas de "Novos A+B" (trimestrais) ---- //

const NewAbListInput = z.object({
  year: z.number().int().min(2020).max(2100),
  quarter: z.number().int().min(1).max(4),
  sfUserIds: z.array(z.string().min(3)).min(1).max(50),
});

export type NewAbGoalRow = { sf_user_id: string; year: number; quarter: number; goal: number };

export const listNewAbGoals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => NewAbListInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("salesperson_new_ab_goals")
      .select("sf_user_id, year, quarter, goal")
      .eq("year", data.year)
      .eq("quarter", data.quarter)
      .in("sf_user_id", data.sfUserIds);
    if (error) throw new Error(error.message);
    const records: NewAbGoalRow[] = (rows ?? []).map((r: any) => ({
      sf_user_id: r.sf_user_id,
      year: r.year,
      quarter: r.quarter,
      goal: Number(r.goal) || 0,
    }));
    return { records };
  });

const NewAbSetInput = z.object({
  sf_user_id: z.string().min(3),
  year: z.number().int().min(2020).max(2100),
  quarter: z.number().int().min(1).max(4),
  goal: z.number().int().min(0).max(999_999),
});

export const setNewAbGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => NewAbSetInput.parse(d))
  .handler(async ({ data, context }) => {
    // RLS já garante que só admin pode escrever; ainda assim, checamos por clareza.
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    void ({
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin role required");
    const { error } = await context.supabase.from("salesperson_new_ab_goals").upsert(
      {
        sf_user_id: data.sf_user_id,
        year: data.year,
        quarter: data.quarter,
        goal: data.goal,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "sf_user_id,year,quarter" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Metas trimestrais de Retenção ---- //

export type RetentionGoalRow = { sf_user_id: string; year: number; quarter: number; goal: number };

export const listRetentionGoals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => NewAbListInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("salesperson_retention_goals")
      .select("sf_user_id, year, quarter, goal")
      .eq("year", data.year)
      .eq("quarter", data.quarter)
      .in("sf_user_id", data.sfUserIds);
    if (error) throw new Error(error.message);
    const records: RetentionGoalRow[] = (rows ?? []).map((r: any) => ({
      sf_user_id: r.sf_user_id,
      year: r.year,
      quarter: r.quarter,
      goal: Number(r.goal) || 0,
    }));
    return { records };
  });

export const setRetentionGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => NewAbSetInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    void ({
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin role required");
    const { error } = await context.supabase.from("salesperson_retention_goals").upsert(
      {
        sf_user_id: data.sf_user_id,
        year: data.year,
        quarter: data.quarter,
        goal: data.goal,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "sf_user_id,year,quarter" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Metas do grupo (KPIs da TV — novos / novos+reativações / recorrência / retenção) ---- //

export type GroupKpiKey = "novos" | "novos_reativacoes" | "recorrencia" | "retencao";
export type GroupKpiGoalRow = {
  kpi_key: GroupKpiKey;
  label: string;
  period_type: "mensal" | "trimestral";
  goal: number;
};

export const listGroupKpiGoals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("group_kpi_goals")
      .select("kpi_key, label, period_type, goal");
    if (error) throw new Error(error.message);
    const records: GroupKpiGoalRow[] = (rows ?? []).map((r: any) => ({
      kpi_key: r.kpi_key,
      label: r.label,
      period_type: r.period_type,
      goal: Number(r.goal) || 0,
    }));
    return { records };
  });

const SetGroupKpiInput = z.object({
  kpi_key: z.enum(["novos", "novos_reativacoes", "recorrencia", "retencao"]),
  goal: z.number().min(0).max(9_999_999),
});

export const setGroupKpiGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetGroupKpiInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    void ({
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin role required");
    const { error } = await context.supabase
      .from("group_kpi_goals")
      .update({ goal: data.goal, updated_at: new Date().toISOString() })
      .eq("kpi_key", data.kpi_key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
