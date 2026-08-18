import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook da Fretefy (rastreio de coleta/entrega).
 *
 * Autenticação: header `x-fretefy-token` (segredo FRETEFY_TOKEN) ou o header
 * `apikey` com a chave pública do projeto. Toda chamada — inclusive as
 * recusadas por assinatura — fica registrada em job_runs.
 */
export const Route = createFileRoute("/api/public/hooks/fretefy-tracking")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-fretefy-token") ?? "";
        const apikey = request.headers.get("apikey") ?? "";
        const fretefy = process.env["FRETEFY_TOKEN"] ?? "";
        const anon = process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
        const autorizado = (!!fretefy && token === fretefy) || (!!anon && apikey === anon);

        let payload: Record<string, unknown> = {};
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch {
          payload = {};
        }

        const { runJob } = await import("@/lib/job-runs.server");
        const { executorFor } = await import("@/lib/jobs-registry.server");

        if (!autorizado) {
          await runJob({ job: "webhook.fretefy", trigger: "webhook", payload: { assinatura: "invalida" } }, async () => {
            throw new Error("Webhook recusado: token de assinatura inválido.");
          });
          return new Response("Unauthorized", { status: 401 });
        }

        const refId =
          typeof payload["pedido"] === "string"
            ? (payload["pedido"] as string)
            : typeof payload["numero"] === "string"
              ? (payload["numero"] as string)
              : null;

        const run = await runJob(
          { job: "webhook.fretefy", trigger: "webhook", refType: "proposta", refId, payload },
          () => executorFor("webhook.fretefy")(payload),
        );

        return new Response(JSON.stringify(run), {
          status: run.ok ? 200 : 500,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
