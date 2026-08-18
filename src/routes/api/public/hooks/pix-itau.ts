import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook de Pix (Itaú).
 *
 * O PSP notifica liquidação, expiração, remoção e devolução das cobranças.
 * A URL configurada no Itaú deve conter o token secreto:
 *   https://<dominio>/api/public/hooks/pix-itau?token=<ITAU_PIX_WEBHOOK_SECRET>
 * (o token também é aceito no header `x-webhook-token`).
 *
 * Toda chamada fica registrada em Gatilhos e pode ser reprocessada.
 */

function tokenValido(request: Request): boolean {
  const esperado = process.env["ITAU_PIX_WEBHOOK_SECRET"] ?? "";
  if (!esperado) return false;
  const url = new URL(request.url);
  const recebido = request.headers.get("x-webhook-token") ?? url.searchParams.get("token") ?? "";
  if (recebido.length !== esperado.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diff === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/hooks/pix-itau")({
  server: {
    handlers: {
      // Validação de disponibilidade da URL feita pelo PSP.
      GET: async ({ request }) => {
        if (!process.env["ITAU_PIX_WEBHOOK_SECRET"]) return json({ ok: false, erro: "webhook não configurado" }, 503);
        if (!tokenValido(request)) return new Response("Unauthorized", { status: 401 });
        return json({ ok: true });
      },
      POST: async ({ request }) => {
        if (!process.env["ITAU_PIX_WEBHOOK_SECRET"]) return json({ ok: false, erro: "webhook não configurado" }, 503);
        if (!tokenValido(request)) return new Response("Unauthorized", { status: 401 });

        let payload: Record<string, unknown> = {};
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ ok: false, erro: "payload inválido (JSON esperado)" }, 400);
        }

        const { runJob } = await import("@/lib/job-runs.server");
        const { executorFor } = await import("@/lib/jobs-registry.server");
        const run = await runJob(
          { job: "webhook.pix-itau", trigger: "webhook", refType: "pix", payload },
          () => executorFor("webhook.pix-itau")(payload),
        );

        // O PSP reenvia em caso de erro: 200 no sucesso, 500 na falha.
        return json(run, run.ok ? 200 : 500);
      },
    },
  },
});
