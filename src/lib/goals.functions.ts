import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordModeration } from "@/lib/moderation-audit.server";
import { requireFeature } from "@/lib/guards.server";

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
    await requireFeature(context, { instance: "solar", feature: "admin.metas", action: "moderar" });
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
    await recordModeration(context, {
      area: "metas",
      instanceId: "solar",
      action: "atualizou",
      target: data.sf_user_id,
      summary: `Meta de Novos A+B do ${data.quarter}T/${data.year} definida em ${data.goal}`,
      details: { meta: data.goal, ano: data.year, trimestre: data.quarter },
    });
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
    await requireFeature(context, { instance: "solar", feature: "admin.metas", action: "moderar" });
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
    await recordModeration(context, {
      area: "metas",
      instanceId: "solar",
      action: "atualizou",
      target: data.sf_user_id,
      summary: `Meta de Retenção do ${data.quarter}T/${data.year} definida em ${data.goal}`,
      details: { meta: data.goal, ano: data.year, trimestre: data.quarter },
    });
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
    await requireFeature(context, { instance: "solar", feature: "admin.metas", action: "moderar" });
    const { error } = await context.supabase
      .from("group_kpi_goals")
      .update({ goal: data.goal, updated_at: new Date().toISOString() })
      .eq("kpi_key", data.kpi_key);
    if (error) throw new Error(error.message);
    await recordModeration(context, {
      area: "metas",
      instanceId: "solar",
      action: "atualizou",
      target: data.kpi_key,
      summary: `Meta do grupo "${data.kpi_key}" definida em ${data.goal}`,
      details: { meta: data.goal },
    });
    return { ok: true };
  });

// ---- Meta Bônus (texto livre por vendedor) ---- //

export type BonusGoalRow = { sf_user_id: string; bonus_text: string };

const BonusListInput = z.object({
  sfUserIds: z.array(z.string().min(3)).min(1).max(50),
});

export const listBonusGoals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BonusListInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("salesperson_bonus_goals")
      .select("sf_user_id, bonus_text")
      .in("sf_user_id", data.sfUserIds);
    if (error) throw new Error(error.message);
    const records: BonusGoalRow[] = (rows ?? []).map((r: any) => ({
      sf_user_id: r.sf_user_id,
      bonus_text: r.bonus_text ?? "",
    }));
    return { records };
  });

const BonusSetInput = z.object({
  sf_user_id: z.string().min(3),
  bonus_text: z.string().max(2000),
});

export const setBonusGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BonusSetInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireFeature(context, { instance: "solar", feature: "admin.metas", action: "moderar" });
    const trimmed = data.bonus_text.trim();
    if (!trimmed) {
      const { error } = await context.supabase
        .from("salesperson_bonus_goals")
        .delete()
        .eq("sf_user_id", data.sf_user_id);
      if (error) throw new Error(error.message);
      await recordModeration(context, {
        area: "metas",
        instanceId: "solar",
        action: "removeu",
        target: data.sf_user_id,
        summary: "Meta bônus removida",
      });
      return { ok: true };
    }
    const { error } = await context.supabase.from("salesperson_bonus_goals").upsert(
      {
        sf_user_id: data.sf_user_id,
        bonus_text: trimmed,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "sf_user_id" },
    );
    if (error) throw new Error(error.message);
    await recordModeration(context, {
      area: "metas",
      instanceId: "solar",
      action: "atualizou",
      target: data.sf_user_id,
      summary: `Meta bônus definida: ${trimmed.slice(0, 120)}`,
    });
    return { ok: true };
  });
