/**
 * Handler padrão dos hooks de cron: valida o segredo, executa o job do
 * registry e devolve a execução gravada em job_runs.
 */
import type { JobSlug } from "@/lib/job-runs.server";
import { cronSecretValido } from "@/lib/cron-auth.server";

export async function executarHookCron(request: Request, job: JobSlug): Promise<Response> {
  if (!cronSecretValido(request)) return new Response("Unauthorized", { status: 401 });

  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const { runJob } = await import("@/lib/job-runs.server");
  const { executorFor } = await import("@/lib/jobs-registry.server");
  const run = await runJob({ job, trigger: "cron", payload }, () => executorFor(job)(payload));

  return new Response(JSON.stringify(run), {
    status: run.ok ? 200 : 500,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
