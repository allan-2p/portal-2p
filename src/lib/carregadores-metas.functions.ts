/**
 * Regras de Metas da unidade 2P Carregadores.
 *
 * Totalmente separado das metas da 2P Solar (que vivem no Salesforce, por
 * `sf_user_id`): aqui a meta é por usuário do portal com organização
 * "carregadores", gravada na tabela `carregadores_metas`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/guards.server";

export type CarregadoresMetaPessoa = {
  user_id: string;
  nome: string;
  email: string;
  cargo: string | null;
  ativoUsuario: boolean;
  /** chave `${ano}-${mes}` → meta de faturamento */
  metas: Record<string, number>;
  /** chave `${ano}-${mes}` → meta bônus */
  bonus: Record<string, number>;
  /** chave `${ano}-${mes}` → meta considerada ativa */
  ativo: Record<string, boolean>;
};

const guard = (action: "visualizar" | "moderar") =>
  ({ instance: "carregadores", feature: "carregadores.metas", action }) as const;

const ListInput = z.object({
  year: z.number().int().min(2020).max(2100),
  months: z.array(z.number().int().min(1).max(12)).min(1).max(12),
});

export const listCarregadoresMetas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ context, data }): Promise<{ records: CarregadoresMetaPessoa[] }> => {
    await requireFeature(context, guard("visualizar"));

    const [{ data: profiles, error: pErr }, { data: metas, error: mErr }] = await Promise.all([
      context.supabase
        .from("profiles")
        .select("id, full_name, email, cargo, ativo, organizacao, is_consultor, numero_sap")
        .eq("is_consultor", true)
        .in("organizacao", ["carregadores", "grupo"])
        .order("full_name", { ascending: true }),
      context.supabase
        .from("carregadores_metas")
        .select("user_id, ano, mes, meta, meta_bonus, ativo")
        .eq("ano", data.year)
        .in("mes", data.months),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (mErr) throw new Error(mErr.message);

    const byUser = new Map<string, CarregadoresMetaPessoa>();
    for (const p of (profiles ?? []) as any[]) {
      byUser.set(p.id, {
        user_id: p.id,
        nome: p.full_name || p.email,
        email: p.email,
        cargo: p.cargo ?? null,
        ativoUsuario: p.ativo !== false,
        metas: {},
        bonus: {},
        ativo: {},
      });
    }
    for (const r of (metas ?? []) as any[]) {
      const row = byUser.get(r.user_id);
      if (!row) continue;
      const key = `${r.ano}-${r.mes}`;
      row.metas[key] = Number(r.meta ?? 0);
      row.bonus[key] = Number(r.meta_bonus ?? 0);
      row.ativo[key] = r.ativo !== false;
    }

    return { records: [...byUser.values()] };
  });

const SetInput = z.object({
  user_id: z.string().uuid(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  meta: z.number().min(0).max(1_000_000_000).optional(),
  meta_bonus: z.number().min(0).max(1_000_000_000).optional(),
});

export const setCarregadoresMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetInput.parse(d))
  .handler(async ({ context, data }) => {
    await requireFeature(context, guard("moderar"));

    const { data: atual } = await context.supabase
      .from("carregadores_metas")
      .select("meta, meta_bonus, ativo")
      .eq("user_id", data.user_id)
      .eq("ano", data.year)
      .eq("mes", data.month)
      .maybeSingle();

    const payload = {
      user_id: data.user_id,
      ano: data.year,
      mes: data.month,
      meta: data.meta ?? Number(atual?.meta ?? 0),
      meta_bonus: data.meta_bonus ?? Number(atual?.meta_bonus ?? 0),
      ativo: atual?.ativo ?? true,
    };

    const { error } = await context.supabase
      .from("carregadores_metas")
      .upsert(payload, { onConflict: "user_id,ano,mes" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const ActiveInput = z.object({
  user_id: z.string().uuid(),
  year: z.number().int().min(2020).max(2100),
  months: z.array(z.number().int().min(1).max(12)).min(1).max(12),
  active: z.boolean(),
});

export const setCarregadoresMetaAtiva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ActiveInput.parse(d))
  .handler(async ({ context, data }) => {
    await requireFeature(context, guard("moderar"));

    // Preserva os valores já gravados: o upsert reescreve a linha inteira.
    const { data: atuais } = await context.supabase
      .from("carregadores_metas")
      .select("mes, meta, meta_bonus")
      .eq("user_id", data.user_id)
      .eq("ano", data.year)
      .in("mes", data.months);
    const porMes = new Map<number, { meta: number; meta_bonus: number }>(
      ((atuais ?? []) as any[]).map((r) => [
        Number(r.mes),
        { meta: Number(r.meta ?? 0), meta_bonus: Number(r.meta_bonus ?? 0) },
      ]),
    );

    const rows = data.months.map((mes) => ({
      user_id: data.user_id,
      ano: data.year,
      mes,
      meta: porMes.get(mes)?.meta ?? 0,
      meta_bonus: porMes.get(mes)?.meta_bonus ?? 0,
      ativo: data.active,
    }));
    const { error } = await context.supabase
      .from("carregadores_metas")
      .upsert(rows, { onConflict: "user_id,ano,mes" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
