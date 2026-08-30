import { createFileRoute } from "@tanstack/react-router";
import { executarHookCron } from "@/lib/cron-hook.server";

/**
 * Cron semanal: radar do Atlas (clientes piorando).
 * Autenticação: header `x-cron-secret`.
 */
export const Route = createFileRoute("/api/public/hooks/atlas-radar")({
  server: {
    handlers: {
      POST: ({ request }) => executarHookCron(request, "cron.atlas-radar"),
    },
  },
});
