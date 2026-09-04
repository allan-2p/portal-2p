import { createFileRoute } from "@tanstack/react-router";
import { cronSecretValido } from "@/lib/cron-auth.server";

/** Comparação em tempo constante (mesma regra do `x-cron-secret`). */
function igualSeguro(esperado: string, recebido: string): boolean {
  if (!esperado || esperado.length !== recebido.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return diff === 0;
}

/**
 * A Fretefy chama o callback com HTTP Basic (usuário/senha cadastrados no
 * painel dela). Aceitamos Basic além do header próprio, sem quebrar quem já
 * usa `x-fretefy-token`.
 */
function basicValido(request: Request): boolean {
  const usuario = (process.env["FRETEFY_WEBHOOK_USER"] ?? "").trim();
  const senha = (process.env["FRETEFY_WEBHOOK_PASSWORD"] ?? "").trim();
  if (!usuario || !senha) return false;
  const header = request.headers.get("authorization") ?? "";
  const m = /^Basic\s+(.+)$/i.exec(header.trim());
  if (!m?.[1]) return false;
  let decodificado = "";
  try {
    decodificado = atob(m[1].trim());
  } catch {
    return false;
  }
  const i = decodificado.indexOf(":");
  if (i < 0) return false;
  return igualSeguro(usuario, decodificado.slice(0, i)) && igualSeguro(senha, decodificado.slice(i + 1));
}

/**
 * Webhook da Fretefy (rastreio de coleta/entrega).
 *
 * Autenticação: HTTP Basic (credenciais cadastradas na Fretefy), header
 * `x-fretefy-token` (segredo FRETEFY_TOKEN) ou `x-cron-secret`
 * (CRON_HOOK_SECRET) para chamadas internas/reprocessamento. Toda chamada —
 * inclusive as recusadas por assinatura — fica registrada em job_runs.
 */
export const Route = createFileRoute("/api/public/hooks/fretefy-tracking")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("x-fretefy-token") ?? "").trim();
        const fretefy = (process.env["FRETEFY_TOKEN"] ?? "").trim();
        const autorizado =
          (!!fretefy && igualSeguro(fretefy, token)) || basicValido(request) || cronSecretValido(request);

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

        const { interpretarEventoFretefy } = await import("@/lib/fretefy-tracking");
        const ev = interpretarEventoFretefy(payload);
        const refId = ev.pedido ?? ev.cargaId;


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
