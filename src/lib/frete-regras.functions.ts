import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  FRETE_REGRAS_PADRAO,
  mesclarFreteRegras,
  type FreteRegrasConfig,
} from "@/lib/fretefy-regras";

/** Regras de frete atualmente aplicadas nas cotações. */
export const freteRegrasGetFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ config: FreteRegrasConfig; atualizadoEm: string | null }> => {
    const { data } = await context.supabase
      .from("frete_regras_config")
      .select("config, updated_at")
      .eq("id", 1)
      .maybeSingle();
    return {
      config: mesclarFreteRegras((data as any)?.config),
      atualizadoEm: (data as any)?.updated_at ?? null,
    };
  });

/** Salva a personalização (somente administradores — garantido pela RLS). */
export const freteRegrasSalvarFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ({ config: mesclarFreteRegras((input as any)?.config) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("frete_regras_config")
      .update({ config: data.config as any, updated_by: context.userId })
      .eq("id", 1);
    if (error) throw new Error("Sem permissão para alterar as regras de frete.");

    const { recordModeration } = await import("@/lib/moderation-audit.server");
    await recordModeration(
      { supabase: context.supabase, userId: context.userId },
      {
        area: "frete",
        instanceId: "solar",
        action: "update",
        target: "frete_regras_config",
        summary: "Regras de frete atualizadas",
        details: data.config as unknown as Record<string, unknown>,
      },
    );
    return { ok: true };
  });

/** Restaura os valores padrão do catálogo. */
export const freteRegrasResetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("frete_regras_config")
      .update({ config: FRETE_REGRAS_PADRAO as any, updated_by: context.userId })
      .eq("id", 1);
    if (error) throw new Error("Sem permissão para alterar as regras de frete.");
    return { ok: true, config: FRETE_REGRAS_PADRAO };
  });
