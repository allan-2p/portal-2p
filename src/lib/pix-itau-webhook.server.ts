/**
 * Handlers compartilhados do webhook Pix (Itaú).
 *
 * O Itaú acrescenta o sufixo "/pix" à URL cadastrada, por isso o mesmo
 * handler atende `/api/public/hooks/pix-itau` e as variações com token no
 * caminho (`/api/public/hooks/pix-itau/<token>` e `.../<token>/pix`).
 */

function comparar(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Token aceito em query (`?token=`), header (`x-webhook-token`) ou no caminho. */
export function tokenValido(request: Request): boolean {
  const esperado = process.env["ITAU_PIX_WEBHOOK_SECRET"] ?? "";
  if (!esperado) return false;
  const url = new URL(request.url);
  const candidatos = [
    request.headers.get("x-webhook-token") ?? "",
    url.searchParams.get("token") ?? "",
    ...url.pathname
      .split("/api/public/hooks/pix-itau")
      .slice(1)
      .join("")
      .split("/")
      .filter(Boolean)
      .filter((s) => s !== "pix"),
  ];
  return candidatos.some((c) => comparar(c, esperado));
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Validação de disponibilidade da URL feita pelo PSP. */
export async function handleWebhookPixGet({ request }: { request: Request }) {
  if (!process.env["ITAU_PIX_WEBHOOK_SECRET"]) return json({ ok: false, erro: "webhook não configurado" }, 503);
  if (!tokenValido(request)) return new Response("Unauthorized", { status: 401 });
  return json({ ok: true });
}

/** Recebe as notificações de liquidação, expiração, remoção e devolução. */
export async function handleWebhookPixPost({ request }: { request: Request }) {
  if (!process.env["ITAU_PIX_WEBHOOK_SECRET"]) return json({ ok: false, erro: "webhook não configurado" }, 503);
  if (!tokenValido(request)) return new Response("Unauthorized", { status: 401 });

  const rawBody = await request.text();

  const { validarAssinaturaWebhook } = await import("@/lib/webhook-assinatura.server");
  const check = await validarAssinaturaWebhook({
    rawBody,
    headers: request.headers,
    segredo: process.env["ITAU_PIX_WEBHOOK_HMAC_SECRET"],
    toleranciaSegundos: 300,
  });
  if (!check.ok) {
    // Duplicado é resposta 200 de propósito: o PSP não deve reenviar.
    if (check.status === 409) return json({ ok: true, duplicado: true, motivo: check.erro });
    return json({ ok: false, erro: check.erro }, check.status);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
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
}
