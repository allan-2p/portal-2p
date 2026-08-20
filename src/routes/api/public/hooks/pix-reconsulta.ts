import { createFileRoute } from "@tanstack/react-router";
import { executarHookCron } from "@/lib/cron-hook.server";

/**
 * Cron: reconsulta das cobranças Pix pendentes (fallback do webhook).
 * Autenticação: header `x-cron-secret` (segredo CRON_HOOK_SECRET).
 */
export const Route = createFileRoute("/api/public/hooks/pix-reconsulta")({
  server: {
    handlers: {
      POST: ({ request }) => executarHookCron(request, "cron.pix-reconsulta"),
    },
  },
});
