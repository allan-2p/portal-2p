/**
 * Monitoramento dos gatilhos automáticos do portal.
 *
 * Toda execução (finalização de pedido, crons do SAP, verificação de pagamento
 * e webhook da Fretefy) grava uma linha em public.job_runs com status, payload,
 * resposta, erro e duração — é o que permite auditar falhas e reprocessar.
 *
 * Nunca grave credenciais, tokens ou certificados em payload/result.
 */

export const JOBS = {
  "checkout.finalizar": {
    label: "Checkout • Finalizar pedido",
    descricao: "Conclusão do pedido pelo vendedor (etapa 4).",
    reprocessavel: false,
  },
  "cron.sap-nfs": {
    label: "Cron • Notas fiscais (SAP)",
    descricao: "Consulta o SAP e move Processando → Separação → Faturado.",
    reprocessavel: true,
  },
  "cron.pagamento-link": {
    label: "Cron • Pagamento (boleto Itaú)",
    descricao: "Verifica a liquidação do boleto e libera o pedido.",
    reprocessavel: true,
  },
  "webhook.pix-itau": {
    label: "Webhook • Pix (Itaú)",
    descricao: "Notificação do PSP: cobrança paga, expirada, removida ou devolvida.",
    reprocessavel: true,
  },
  "webhook.fretefy": {
    label: "Webhook • Fretefy (rastreio)",
    descricao: "Retorno de coleta/entrega enviado pela Fretefy.",
    reprocessavel: true,
  },
} as const;

export type JobSlug = keyof typeof JOBS;
export type JobStatus = "running" | "ok" | "error" | "skipped";
export type JobTrigger = "cron" | "webhook" | "portal" | "manual" | "reprocesso";

export function isJobSlug(v: string): v is JobSlug {
  return Object.prototype.hasOwnProperty.call(JOBS, v);
}

type StartInput = {
  job: JobSlug;
  trigger: JobTrigger;
  refType?: string | null;
  refId?: string | null;
  payload?: Record<string, unknown>;
  attempt?: number;
  actorId?: string | null;
  actorEmail?: string | null;
  parentRunId?: string | null;
};

/** Corta payloads gigantes para não inflar o log. */
function safeJson(value: unknown): Record<string, unknown> {
  try {
    const txt = JSON.stringify(value ?? {});
    if (txt.length > 20000) return { truncado: true, tamanho: txt.length, amostra: txt.slice(0, 20000) };
    return (JSON.parse(txt) ?? {}) as Record<string, unknown>;
  } catch {
    return { naoSerializavel: true };
  }
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Abre a execução e devolve o id (null se o log falhar — nunca derruba o job). */
export async function startJobRun(input: StartInput): Promise<string | null> {
  try {
    const db = await admin();
    const { data } = await db
      .from("job_runs")
      .insert({
        job: input.job,
        trigger_source: input.trigger,
        ref_type: input.refType ?? null,
        ref_id: input.refId ?? null,
        status: "running",
        attempt: input.attempt ?? 1,
        payload: safeJson(input.payload) as never,
        actor_id: input.actorId ?? null,
        actor_email: input.actorEmail ?? null,
        parent_run_id: input.parentRunId ?? null,
      })
      .select("id")
      .maybeSingle();
    return (data as { id?: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}

/** Fecha a execução com o resultado final. */
export async function finishJobRun(
  runId: string | null,
  patch: { status: JobStatus; result?: unknown; errorMessage?: string | null; startedAt?: number },
): Promise<void> {
  if (!runId) return;
  try {
    const db = await admin();
    await db
      .from("job_runs")
      .update({
        status: patch.status,
        result: safeJson(patch.result) as never,
        error_message: patch.errorMessage ?? null,
        duration_ms: patch.startedAt ? Math.round(performance.now() - patch.startedAt) : null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
  } catch {
    // O monitoramento nunca deve derrubar a operação principal.
  }
}

/**
 * Envolve a execução de um gatilho: grava início, fim, duração e erro,
 * e espelha falhas no Log de Integrações.
 */
export async function runJob<T>(
  input: StartInput,
  fn: (ctx: { runId: string | null }) => Promise<T>,
): Promise<{ ok: true; runId: string | null; result: T } | { ok: false; runId: string | null; error: string }> {
  const t0 = performance.now();
  const runId = await startJobRun(input);
  const { logIntegrationEvent } = await import("@/lib/integration-logs.server");
  try {
    const result = await fn({ runId });
    const pulado = !!(result && typeof result === "object" && (result as { skipped?: boolean }).skipped);
    await finishJobRun(runId, { status: pulado ? "skipped" : "ok", result, startedAt: t0 });
    await logIntegrationEvent({
      slug: input.job,
      level: "info",
      event: `${input.trigger}:sucesso`,
      message: JOBS[input.job].label,
      detail: { run_id: runId, ref_id: input.refId ?? null, resposta: safeJson(result) },
      durationMs: Math.round(performance.now() - t0),
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? null,
    });
    return { ok: true, runId, result };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await finishJobRun(runId, { status: "error", errorMessage: error, startedAt: t0 });
    await logIntegrationEvent({
      slug: input.job,
      level: "error",
      event: `${input.trigger}:falha`,
      message: error,
      detail: { run_id: runId, ref_id: input.refId ?? null, payload: safeJson(input.payload) },
      durationMs: Math.round(performance.now() - t0),
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? null,
    });
    return { ok: false, runId, error };
  }
}
