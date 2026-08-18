import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron: consulta de notas fiscais no SAP.
 * Chamado pelo pg_cron com o header `apikey` (chave pública do projeto).
 * Toda execução fica registrada em job_runs para auditoria/reprocessamento.
 */
export const Route = createFileRoute("/api/public/hooks/sap-nfs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = request.headers.get("apikey") ?? "";
        const esperado = process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
        if (!esperado || key !== esperado) return new Response("Unauthorized", { status: 401 });

        let payload: Record<string, unknown> = {};
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch {
          payload = {};
        }

        const { runJob } = await import("@/lib/job-runs.server");
        const { executorFor } = await import("@/lib/jobs-registry.server");
        const run = await runJob(
          { job: "cron.sap-nfs", trigger: "cron", payload },
          () => executorFor("cron.sap-nfs")(payload),
        );

        return new Response(JSON.stringify(run), {
          status: run.ok ? 200 : 500,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
