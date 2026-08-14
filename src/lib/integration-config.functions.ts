import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Guard por tela/ação (default deny) — admin, acesso total ou perfil com a tela. */
async function assertFeature(
  ctx: { supabase: any; userId: string },
  feature: any,
  action: any = "visualizar",
) {
  const { requireAdminFeature } = await import("@/lib/guards.server");
  await requireAdminFeature(ctx, feature, action);
}


export type CredentialState = {
  env: string;
  configured: boolean;
  /** Prévia mascarada — apenas para valores não secretos (ex.: URLs). */
  preview: string | null;
  length: number;
};

/** Estado das credenciais de uma integração (nunca devolve valores secretos). */
export const getIntegrationConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { slug: string }) => input)
  .handler(async ({ data, context }) => {
    await assertFeature(context, "admin.integracoes", "editar");

    const { integrationBySlug } = await import("./integrations-catalog");
    const def = integrationBySlug(data.slug);
    if (!def) throw new Error("Integração não encontrada");

    const credentials: CredentialState[] = def.credentials.map((c) => {
      const value = process.env[c.env] ?? "";
      return {
        env: c.env,
        configured: value.length > 0,
        preview: !c.secret && value ? value : null,
        length: value.length,
      };
    });
    return { slug: def.slug, credentials };
  });

/** Executa o teste de conexão de uma integração específica. */
export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { slug: string }) => input)
  .handler(async ({ data, context }) => {
    await assertFeature(context, "admin.integracoes", "editar");

    const started = Date.now();
    const { collectIntegrationsHealth } = await import("./integrations-health.server");
    const all = await collectIntegrationsHealth();
    const found = all.find((i) => i.slug === data.slug);

    const { logIntegrationEvent } = await import("./integration-logs.server");
    await logIntegrationEvent({
      slug: data.slug,
      level: found?.status === "error" ? "error" : found?.status === "off" ? "warn" : "info",
      event: "test",
      message: found?.detail ?? "Integração sem verificação automática.",
      durationMs: Date.now() - started,
      actorId: context.userId,
      actorEmail: (context.claims as { email?: string } | null)?.email ?? null,
    });

    return {
      slug: data.slug,
      status: found?.status ?? "off",
      detail: found?.detail ?? "Integração sem verificação automática.",
      lastSync: found?.lastSync ?? null,
      checkedAt: new Date().toISOString(),
    };
  });
