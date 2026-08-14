import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordModeration } from "@/lib/moderation-audit.server";

/** Guard por tela/ação (default deny) — admin, acesso total ou perfil com a tela. */
async function assertFeature(
  ctx: { supabase: any; userId: string },
  feature: any,
  action: any = "visualizar",
) {
  const { requireAdminFeature } = await import("@/lib/guards.server");
  await requireAdminFeature(ctx, feature, action);
}


export type IntegrationAlertSetting = {
  slug: string;
  alert_enabled: boolean;
  stale_minutes: number;
};

/** Limite padrão de atraso (24h) quando a integração ainda não tem configuração própria. */
export const DEFAULT_STALE_MINUTES = 1440;

export const listIntegrationAlertSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("integration_alert_settings")
      .select("slug, alert_enabled, stale_minutes");
    if (error) throw new Error(error.message);
    return { items: (data ?? []) as IntegrationAlertSetting[] };
  });

const SaveInput = z.object({
  slug: z.string().min(1),
  alert_enabled: z.boolean(),
  stale_minutes: z.number().int().min(5).max(60 * 24 * 30),
});

export const saveIntegrationAlertSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertFeature(context, "admin.integracoes", "editar");

    const { error } = await context.supabase
      .from("integration_alert_settings")
      .upsert(
        {
          slug: data.slug,
          alert_enabled: data.alert_enabled,
          stale_minutes: data.stale_minutes,
          updated_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" },
      );
    if (error) throw new Error(error.message);

    await recordModeration(context, {
      area: "integracoes",
      action: "atualizou",
      target: data.slug,
      summary: data.alert_enabled
        ? `Alertas da integração "${data.slug}" ativados com limite de ${data.stale_minutes} min`
        : `Alertas da integração "${data.slug}" desativados`,
      details: { alert_enabled: data.alert_enabled, stale_minutes: data.stale_minutes },
    });

    return { ok: true };
  });
