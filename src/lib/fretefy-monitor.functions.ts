/**
 * Monitoramento dos webhooks da Fretefy.
 *
 * Reúne, numa tela só: as execuções dos gatilhos `webhook.fretefy` e
 * `fretefy.oferta-carga` (com taxa de falha), as cargas pendentes de entrega
 * e o reprocessamento manual por CargaId — o único identificador que a
 * Fretefy envia no callback real.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { JobRunRow } from "@/lib/job-runs.functions";

export const JOBS_FRETEFY = ["webhook.fretefy", "fretefy.oferta-carga"] as const;

export type FretefyResumoJob = {
  job: string;
  total24h: number;
  erros24h: number;
  total7d: number;
  erros7d: number;
  falha24h: number;
  falha7d: number;
  ultimo: string | null;
  ultimoErro: string | null;
};

export type FretefyPendencia = {
  id: string;
  numero: string | null;
  cliente: string | null;
  status: string | null;
  cargaId: string | null;
  nf: string | null;
  desde: string | null;
};

async function assertJobs(
  ctx: { supabase: any; userId: string },
  action: "visualizar" | "editar" = "visualizar",
) {
  const { requireAdminFeature } = await import("@/lib/guards.server");
  await requireAdminFeature(ctx, "admin.logs.jobs", action);
}

function taxa(erros: number, total: number): number {
  return total > 0 ? Math.round((erros / total) * 1000) / 10 : 0;
}

/** Saúde dos gatilhos da Fretefy nas últimas 24h e 7 dias. */
export const fretefyResumo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertJobs(context);

    const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await context.supabase
      .from("job_runs")
      .select("job, status, started_at, error_message")
      .in("job", JOBS_FRETEFY as unknown as string[])
      .gte("started_at", desde)
      .order("started_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const corte24 = Date.now() - 24 * 3600 * 1000;
    const mapa = new Map<string, FretefyResumoJob>();
    for (const job of JOBS_FRETEFY) {
      mapa.set(job, {
        job,
        total24h: 0,
        erros24h: 0,
        total7d: 0,
        erros7d: 0,
        falha24h: 0,
        falha7d: 0,
        ultimo: null,
        ultimoErro: null,
      });
    }

    for (const r of (data ?? []) as Array<{
      job: string;
      status: string;
      started_at: string;
      error_message: string | null;
    }>) {
      const cur = mapa.get(r.job);
      if (!cur) continue;
      cur.total7d += 1;
      if (r.status === "error") cur.erros7d += 1;
      if (new Date(r.started_at).getTime() >= corte24) {
        cur.total24h += 1;
        if (r.status === "error") cur.erros24h += 1;
      }
      if (!cur.ultimo) cur.ultimo = r.started_at;
      if (!cur.ultimoErro && r.status === "error") cur.ultimoErro = r.error_message;
    }

    const stats = [...mapa.values()].map((s) => ({
      ...s,
      falha24h: taxa(s.erros24h, s.total24h),
      falha7d: taxa(s.erros7d, s.total7d),
    }));

    return { stats };
  });

/** Execuções dos gatilhos da Fretefy (filtra por status e por CargaId/pedido). */
export const listarEventosFretefy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    job?: string;
    status?: "all" | "running" | "ok" | "error" | "skipped";
    search?: string;
    limit?: number;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertJobs(context);

    const limit = Math.min(Math.max(data.limit ?? 20, 1), 100);
    const jobs =
      data.job && data.job !== "all" && (JOBS_FRETEFY as readonly string[]).includes(data.job)
        ? [data.job]
        : (JOBS_FRETEFY as unknown as string[]);

    let q = context.supabase
      .from("job_runs")
      .select(
        "id, job, trigger_source, ref_type, ref_id, status, attempt, payload, result, error_message, duration_ms, actor_email, parent_run_id, started_at, finished_at",
        { count: "exact" },
      )
      .in("job", jobs)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (data.status && data.status !== "all") q = q.eq("status", data.status);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    const termo = (data.search ?? "").trim().toLowerCase();
    let lista = (rows ?? []) as JobRunRow[];
    if (termo) {
      lista = lista.filter((r) =>
        [r.ref_id ?? "", r.error_message ?? "", JSON.stringify(r.payload ?? {}), JSON.stringify(r.result ?? {})]
          .join(" ")
          .toLowerCase()
          .includes(termo),
      );
    }

    return { rows: lista, total: count ?? lista.length };
  });

/** Cargas já ofertadas na Fretefy que continuam sem baixa de entrega. */
export const pendenciasFretefy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertJobs(context);

    const { grupo2pRest } = await import("@/lib/grupo2p-db.server");
    const params = new URLSearchParams({
      select: "id,numero,cliente_nome,status,fretefy_oferta_id,nf_numero,faturado_em,created_at",
      fretefy_oferta_id: "not.is.null",
      entregue_em: "is.null",
      order: "created_at.desc",
      limit: "100",
    });
    const res = await grupo2pRest(`propostas?${params.toString()}`);
    if (!res.ok) throw new Error(`Falha ao ler pedidos com carga na Fretefy (${res.status}).`);
    const linhas = JSON.parse(res.text || "[]") as Array<Record<string, unknown>>;

    const pendencias: FretefyPendencia[] = linhas.map((r) => ({
      id: String(r["id"]),
      numero: r["numero"] == null ? null : String(r["numero"]),
      cliente: r["cliente_nome"] == null ? null : String(r["cliente_nome"]),
      status: r["status"] == null ? null : String(r["status"]),
      cargaId: r["fretefy_oferta_id"] == null ? null : String(r["fretefy_oferta_id"]),
      nf: r["nf_numero"] == null ? null : String(r["nf_numero"]),
      desde: (r["faturado_em"] ?? r["created_at"]) == null ? null : String(r["faturado_em"] ?? r["created_at"]),
    }));

    return { pendencias };
  });

/**
 * Reprocessa o rastreio de uma carga: dispara o mesmo motor do webhook com o
 * CargaId informado, registrando a execução em job_runs (trigger `manual`).
 */
export const reprocessarCargaFretefy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cargaId: string }) => {
    const cargaId = String(input?.cargaId ?? "").trim();
    if (!cargaId) throw new Error("Informe o CargaId da Fretefy.");
    if (cargaId.length > 120) throw new Error("CargaId inválido.");
    return { cargaId };
  })
  .handler(async ({ data, context }) => {
    await assertJobs(context, "editar");

    const { runJob } = await import("@/lib/job-runs.server");
    const { executorFor } = await import("@/lib/jobs-registry.server");

    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("email")
      .eq("id", context.userId)
      .maybeSingle();

    const payload = { CargaId: data.cargaId, reprocesso_manual: true } as Record<string, unknown>;

    const run = await runJob(
      {
        job: "webhook.fretefy",
        trigger: "manual",
        refType: "carga",
        refId: data.cargaId,
        payload,
        actorId: context.userId,
        actorEmail: (perfil as any)?.email ?? null,
      },
      () => executorFor("webhook.fretefy")(payload),
    );

    return {
      ok: run.ok,
      runId: run.runId,
      error: run.ok ? null : run.error,
      resultado: JSON.parse(JSON.stringify(run.ok ? run.result : {})) as Record<string, unknown>,
    };
  });
