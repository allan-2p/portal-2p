import { createFileRoute } from "@tanstack/react-router";
import { executarHookCron } from "@/lib/cron-hook.server";

/**
 * Cron: sincronização de estoque/produtos com o SAP (mesmo motor do botão manual).
 * Autenticação: header `x-cron-secret` (segredo CRON_HOOK_SECRET).
 */
export const Route = createFileRoute("/api/public/hooks/estoque-sync")({
  server: {
    handlers: {
      POST: ({ request }) => executarHookCron(request, "cron.estoque"),
    },
  },
});
