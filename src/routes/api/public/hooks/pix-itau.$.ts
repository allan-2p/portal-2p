import { createFileRoute } from "@tanstack/react-router";
import { handleWebhookPixGet, handleWebhookPixPost } from "@/lib/pix-itau-webhook.server";

/**
 * Variação com token no caminho: o Itaú acrescenta "/pix" à URL cadastrada,
 * o que quebraria a query string. Cadastre:
 *   https://<dominio>/api/public/hooks/pix-itau/<ITAU_PIX_WEBHOOK_SECRET>
 * e o Itaú chamará `.../<token>/pix`.
 */
export const Route = createFileRoute("/api/public/hooks/pix-itau/$")({
  server: {
    handlers: {
      GET: handleWebhookPixGet,
      POST: handleWebhookPixPost,
    },
  },
});
