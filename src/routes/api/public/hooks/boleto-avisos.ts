import { createFileRoute } from "@tanstack/react-router";
import { executarHookCron } from "@/lib/cron-hook.server";

/**
 * Cron diário: avisos de boleto vencendo (2 dias) ou vencido.
 * Autenticação: header `x-cron-secret` (segredo CRON_HOOK_SECRET).
 */
export const Route = createFileRoute("/api/public/hooks/boleto-avisos")({
  server: {
    handlers: {
      POST: ({ request }) => executarHookCron(request, "cron.boleto-avisos"),
    },
  },
});
