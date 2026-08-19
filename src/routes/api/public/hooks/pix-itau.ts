import { createFileRoute } from "@tanstack/react-router";
import { handleWebhookPixGet, handleWebhookPixPost } from "@/lib/pix-itau-webhook.server";

/**
 * Webhook de Pix (Itaú) — URL base.
 *   https://<dominio>/api/public/hooks/pix-itau?token=<ITAU_PIX_WEBHOOK_SECRET>
 */
export const Route = createFileRoute("/api/public/hooks/pix-itau")({
  server: {
    handlers: {
      GET: handleWebhookPixGet,
      POST: handleWebhookPixPost,
    },
  },
});
