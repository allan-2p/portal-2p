import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type JobRunRow = {
  id: string;
  job: string;
  trigger_source: string;
  ref_type: string | null;
  ref_id: string | null;
  status: "running" | "ok" | "error" | "skipped";
  attempt: number;
  payload: Record<string, JsonValue> | null;
  result: Record<string, JsonValue> | null;
  error_message: string | null;
  duration_ms: number | null;
  actor_email: string | null;
  parent_run_id: string | null;
  started_at: string;
  finished_at: string | null;
};

async function assertJobs(
  ctx: { supabase: any; userId: string },
  action: "visualizar" | "editar" = "visualizar",
) {
  const { requireAdminFeature } = await import("@/lib/guards.server");
  await requireAdminFeature(ctx, "admin.logs.jobs", action);
}

/** Execuções dos gatilhos, com filtros por job, status e referência. */
export const listJobRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    job?: string;
    status?: "all" | "running" | "ok" | "error" | "skipped";
    search?: string;
    limit?: number;
    offset?: number;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertJobs(context);

    const limit = Math.min(Math.max(data.limit ?? 10, 1), 100);
    const offset = Math.max(data.offset ?? 0, 0);

    let q = context.supabase
      .from("job_runs")
      .select(
        "id, job, trigger_source, ref_type, ref_id, status, attempt, payload, result, error_message, duration_ms, actor_email, parent_run_id, started_at, finished_at",
        { count: "exact" },
      )
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (data.job && data.job !== "all") q = q.eq("job", data.job);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const termo = (data.search ?? "").trim();
    if (termo) q = q.or(`ref_id.ilike.%${termo}%,error_message.ilike.%${termo}%`);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as JobRunRow[], total: count ?? 0 };
  });

/** Resumo por gatilho nas últimas 24h e 7 dias (saúde do motor). */
export const jobRunsStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertJobs(context);

    const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await context.supabase
      .from("job_runs")
      .select("job, status, started_at, error_message")
      .gte("started_at", desde)
      .order("started_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const corte24 = Date.now() - 24 * 3600 * 1000;
    const mapa = new Map<
      string,
      { job: string; total7d: number; erros7d: number; total24h: number; erros24h: number; ultimo: string | null; ultimoErro: string | null }
    >();

    for (const r of (data ?? []) as Array<{ job: string; status: string; started_at: string; error_message: string | null }>) {
      const cur =
        mapa.get(r.job) ??
        { job: r.job, total7d: 0, erros7d: 0, total24h: 0, erros24h: 0, ultimo: null, ultimoErro: null };
      cur.total7d += 1;
      if (r.status === "error") cur.erros7d += 1;
      if (new Date(r.started_at).getTime() >= corte24) {
        cur.total24h += 1;
        if (r.status === "error") cur.erros24h += 1;
      }
      if (!cur.ultimo) cur.ultimo = r.started_at;
      if (!cur.ultimoErro && r.status === "error") cur.ultimoErro = r.error_message;
      mapa.set(r.job, cur);
    }

    return { stats: [...mapa.values()].sort((a, b) => b.erros7d - a.erros7d || b.total7d - a.total7d) };
  });

/** Reexecuta um gatilho com o mesmo payload, encadeando a nova execução à original. */
export const reprocessJobRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id || typeof input.id !== "string") throw new Error("Execução inválida.");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertJobs(context, "editar");

    const { data: row, error } = await context.supabase
      .from("job_runs")
      .select("id, job, ref_type, ref_id, payload, attempt")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Execução não encontrada.");

    const { JOBS, isJobSlug, runJob } = await import("@/lib/job-runs.server");
    const { executorFor } = await import("@/lib/jobs-registry.server");
    const job = (row as any).job as string;
    if (!isJobSlug(job)) throw new Error("Gatilho desconhecido.");
    if (!JOBS[job].reprocessavel) throw new Error(`${JOBS[job].label} não pode ser reprocessado automaticamente.`);

    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("email")
      .eq("id", context.userId)
      .maybeSingle();

    const payload = ((row as any).payload ?? {}) as Record<string, unknown>;

    const run = await runJob(
      {
        job,
        trigger: "reprocesso",
        refType: (row as any).ref_type ?? null,
        refId: (row as any).ref_id ?? null,
        payload,
        attempt: Number((row as any).attempt ?? 1) + 1,
        actorId: context.userId,
        actorEmail: (perfil as any)?.email ?? null,
        parentRunId: (row as any).id,
      },
      () => executorFor(job)(payload),
    );

    return {
      ok: run.ok,
      runId: run.runId,
      error: run.ok ? null : run.error,
      resultado: JSON.parse(JSON.stringify(run.ok ? run.result : {})) as Record<string, JsonValue>,
    };
  });
