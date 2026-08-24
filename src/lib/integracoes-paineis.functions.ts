import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Painel, PainelDados } from "./integracoes-paineis.server";

export type { Painel, PainelDados, FluxoSaude, PendenciaGrupo, PendenciaItem } from "./integracoes-paineis.server";

/** Saúde dos fluxos + pendências acionáveis do painel de integração. */
export const carregarPainelIntegracaoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { painel: Painel }) => input)
  .handler(async ({ data, context }): Promise<PainelDados> => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context, "admin.integracoes", "visualizar");
    const { carregarPainel } = await import("./integracoes-paineis.server");
    return carregarPainel(context, data.painel);
  });

/** Dispara manualmente uma automação do painel (mesmo motor do cron). */
export const executarJobIntegracaoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const job = String((input as { job?: unknown })?.job ?? "");
    const permitidos = [
      "cron.sap-nfs",
      "cron.estoque",
      "cron.pix-reconsulta",
      "cron.boleto-avisos",
      "sap.sync-produtos",
    ];
    if (!permitidos.includes(job)) throw new Error("Automação inválida.");
    return {
      job: job as
        | "cron.sap-nfs"
        | "cron.estoque"
        | "cron.pix-reconsulta"
        | "cron.boleto-avisos"
        | "sap.sync-produtos",
    };
  })
  .handler(async ({ data, context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context, "admin.integracoes", "editar");
    const { runJob } = await import("@/lib/job-runs.server");
    const { executorFor } = await import("@/lib/jobs-registry.server");
    const run = await runJob(
      { job: data.job, trigger: "manual", payload: {}, actorId: (context as any).userId ?? null },
      () => executorFor(data.job)({}),
    );
    if (!run.ok) throw new Error(run.error);
    return { ok: true, resultado: JSON.stringify(run.result ?? {}) };
  });

