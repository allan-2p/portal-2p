import { createFileRoute } from "@tanstack/react-router";
import { executarHookCron } from "@/lib/cron-hook.server";

/**
 * Cron: varredura de preço no SAP para ativar/desativar o catálogo.
 * Autenticação: header `x-cron-secret` (segredo CRON_HOOK_SECRET).
 */
export const Route = createFileRoute("/api/public/hooks/sap-catalogo-vendaveis")({
  server: {
    handlers: {
      POST: ({ request }) => executarHookCron(request, "sap.sync-produtos"),
    },
  },
});
