import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron: verificação de pagamento (boleto Itaú).
 * Chamado pelo pg_cron com o header `apikey` (chave pública do projeto).
 */
export const Route = createFileRoute("/api/public/hooks/pagamento-link")({
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
          { job: "cron.pagamento-link", trigger: "cron", payload },
          () => executorFor("cron.pagamento-link")(payload),
        );

        return new Response(JSON.stringify(run), {
          status: run.ok ? 200 : 500,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
