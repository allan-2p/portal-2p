import { createFileRoute } from "@tanstack/react-router";
import { executarHookCron } from "@/lib/cron-hook.server";

/**
 * Cron: processa a fila do Salesforce (propostas com `sf_status`
 * pendente/erro). Autenticação: header `x-cron-secret`.
 */
export const Route = createFileRoute("/api/public/hooks/salesforce-fila")({
  server: {
    handlers: {
      POST: ({ request }) => executarHookCron(request, "salesforce.pedido"),
    },
  },
});
