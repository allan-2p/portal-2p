import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordModeration } from "@/lib/moderation-audit.server";

// ---- Tipos das regras de comissão ---- //

export type Equipe = "pre_vendas" | "carteira";

export type VendidoTier = { min: number; max: number | null };

export type VendidoTiersConfig = {
  tiers: VendidoTier[];
  pre_vendas: number[]; // pct por faixa, ex: 0.30 = 0,30%
  carteira: number[];
};

export type NovosValuesConfig = {
  pre_vendas: { A: number; B: number };
  carteira: { A: number; B: number };
};

export type RetencaoTiersConfig = {
  tiers: VendidoTier[];
  values: number[]; // R$ fixo por faixa
};

export type SalespersonEquipeConfig = Record<string, Equipe>;

export type CommissionSettings = {
  vendido: VendidoTiersConfig;
  novos: NovosValuesConfig;
  retencao: RetencaoTiersConfig;
  equipe: SalespersonEquipeConfig;
};


const DEFAULT_VENDIDO: VendidoTiersConfig = {
  tiers: [
    { min: 70, max: 80 },
    { min: 80, max: 90 },
    { min: 90, max: 100 },
    { min: 100, max: 110 },
    { min: 110, max: null },
  ],
  pre_vendas: [0.3, 0.4, 0.5, 0.6, 0.7],
  carteira: [0.155, 0.165, 0.185, 0.23, 0.26],
};

const DEFAULT_NOVOS: NovosValuesConfig = {
  pre_vendas: { A: 100, B: 50 },
  carteira: { A: 200, B: 100 },
};

const DEFAULT_RETENCAO: RetencaoTiersConfig = {
  tiers: [
    { min: 70, max: 80 },
    { min: 80, max: 90 },
    { min: 90, max: null },
  ],
  values: [500, 1000, 1500],
};

// ---- Server functions ---- //

export const getCommissionSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CommissionSettings> => {
    const { data, error } = await context.supabase
      .from("commission_settings")
      .select("id, config");
    if (error) throw new Error(error.message);
    const map = new Map<string, any>();
    for (const r of data ?? []) map.set((r as any).id, (r as any).config);
    return {
      vendido: (map.get("vendido_tiers") as VendidoTiersConfig) ?? DEFAULT_VENDIDO,
      novos: (map.get("novos_values") as NovosValuesConfig) ?? DEFAULT_NOVOS,
      retencao: (map.get("retencao_tiers") as RetencaoTiersConfig) ?? DEFAULT_RETENCAO,
      equipe: (map.get("salesperson_equipe") as SalespersonEquipeConfig) ?? {},
    };
  });


const VendidoInput = z.object({
  tiers: z
    .array(
      z.object({
        min: z.number().min(0).max(500),
        max: z.number().min(0).max(1000).nullable(),
      }),
    )
    .min(1)
    .max(20),
  pre_vendas: z.array(z.number().min(0).max(100)).min(1).max(20),
  carteira: z.array(z.number().min(0).max(100)).min(1).max(20),
});

export const setVendidoTiers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VendidoInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.pre_vendas.length !== data.tiers.length || data.carteira.length !== data.tiers.length) {
      throw new Error("Quantidade de % não bate com as faixas.");
    }
    const { error } = await context.supabase
      .from("commission_settings")
      .upsert({ id: "vendido_tiers", config: data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    await recordModeration(context, {
      area: "cpo_comissoes",
      instanceId: "solar",
      action: "atualizou",
      target: "vendido_tiers",
      summary: `Faixas de comissão por Vendido atualizadas (${data.tiers.length} faixas)`,
    });
    return { ok: true };
  });

const NovosInput = z.object({
  pre_vendas: z.object({ A: z.number().min(0).max(1_000_000), B: z.number().min(0).max(1_000_000) }),
  carteira: z.object({ A: z.number().min(0).max(1_000_000), B: z.number().min(0).max(1_000_000) }),
});

export const setNovosValues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => NovosInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("commission_settings")
      .upsert({ id: "novos_values", config: data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    await recordModeration(context, {
      area: "cpo_comissoes",
      instanceId: "solar",
      action: "atualizou",
      target: "novos_values",
      summary: "Valores de comissão por Novos atualizados",
      details: {
        pre_vendas_A: data.pre_vendas.A,
        pre_vendas_B: data.pre_vendas.B,
        carteira_A: data.carteira.A,
        carteira_B: data.carteira.B,
      },
    });
    return { ok: true };
  });

const RetencaoInput = z.object({
  tiers: z
    .array(
      z.object({
        min: z.number().min(0).max(500),
        max: z.number().min(0).max(1000).nullable(),
      }),
    )
    .min(1)
    .max(20),
  values: z.array(z.number().min(0).max(1_000_000)).min(1).max(20),
});

export const setRetencaoTiers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RetencaoInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.values.length !== data.tiers.length) {
      throw new Error("Quantidade de valores não bate com as faixas.");
    }
    const { error } = await context.supabase
      .from("commission_settings")
      .upsert({ id: "retencao_tiers", config: data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    await recordModeration(context, {
      area: "cpo_comissoes",
      instanceId: "solar",
      action: "atualizou",
      target: "retencao_tiers",
      summary: `Faixas de comissão por Retenção atualizadas (${data.tiers.length} faixas)`,
    });
    return { ok: true };
  });

const EquipeInput = z.object({
  sf_user_id: z.string().min(3),
  equipe: z.enum(["pre_vendas", "carteira"]),
});

export const setSalespersonEquipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EquipeInput.parse(d))
  .handler(async ({ data, context }) => {
    // Ler config existente e atualizar apenas a chave do vendedor.
    const { data: rows, error: readErr } = await context.supabase
      .from("commission_settings")
      .select("config")
      .eq("id", "salesperson_equipe")
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    const current = ((rows as any)?.config ?? {}) as SalespersonEquipeConfig;
    const next = { ...current, [data.sf_user_id]: data.equipe };
    const { error } = await context.supabase
      .from("commission_settings")
      .upsert({ id: "salesperson_equipe", config: next, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    await recordModeration(context, {
      area: "cpo_comissoes",
      instanceId: "solar",
      action: "atualizou",
      target: data.sf_user_id,
      summary: `Equipe do vendedor definida como ${data.equipe}`,
    });
    return { ok: true };
  });

// ---- Helpers de cálculo (usados no cliente e no servidor) ---- //

/** Comissão do Vendido usando método marginal por faixa da % de atingimento. */
export function calcVendidoCommission(
  vendido: number,
  meta: number,
  equipe: Equipe,
  cfg: VendidoTiersConfig,
): number {
  if (meta <= 0 || vendido <= 0) return 0;
  const achievementPct = (vendido / meta) * 100;
  const pcts = equipe === "pre_vendas" ? cfg.pre_vendas : cfg.carteira;
  let commission = 0;
  cfg.tiers.forEach((t, i) => {
    const lo = t.min;
    const hi = t.max ?? Infinity;
    if (achievementPct <= lo) return;
    const portionPct = Math.min(achievementPct, hi) - lo;
    if (portionPct <= 0) return;
    const portionValue = (portionPct / 100) * meta;
    commission += portionValue * ((pcts[i] ?? 0) / 100);
  });
  return commission;
}

export function calcNovosCommission(
  countA: number,
  countB: number,
  equipe: Equipe,
  cfg: NovosValuesConfig,
): number {
  const v = equipe === "pre_vendas" ? cfg.pre_vendas : cfg.carteira;
  return countA * (v.A ?? 0) + countB * (v.B ?? 0);
}

/** Comissão de Retenção: valor fixo em R$ da faixa que contém o % de atingimento. */
export function calcRetencaoCommission(
  ativos: number,
  meta: number,
  cfg: RetencaoTiersConfig,
): number {
  if (meta <= 0) return 0;
  const pct = (ativos / meta) * 100;
  for (let i = cfg.tiers.length - 1; i >= 0; i--) {
    const t = cfg.tiers[i];
    const lo = t.min;
    const hi = t.max ?? Infinity;
    if (pct >= lo && pct < hi) return cfg.values[i] ?? 0;
    if (t.max === null && pct >= lo) return cfg.values[i] ?? 0;
  }
  return 0;
}
