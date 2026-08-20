import { createFileRoute } from "@tanstack/react-router";
import { executarHookCron } from "@/lib/cron-hook.server";

/**
 * Cron: verificação de pagamento (boleto Itaú).
 * Autenticação: header `x-cron-secret` (segredo CRON_HOOK_SECRET).
 */
export const Route = createFileRoute("/api/public/hooks/pagamento-link")({
  server: {
    handlers: {
      POST: ({ request }) => executarHookCron(request, "cron.pagamento-link"),
    },
  },
});
