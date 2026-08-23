import { createFileRoute } from "@tanstack/react-router";
import { executarHookCron } from "@/lib/cron-hook.server";

/**
 * Cron horário: procura no SharePoint os boletos a prazo pela NF, guarda no
 * portal e avisa o cliente. Autenticação: header `x-cron-secret`.
 */
export const Route = createFileRoute("/api/public/hooks/boletos-sharepoint")({
  server: {
    handlers: {
      POST: ({ request }) => executarHookCron(request, "cron.boletos-sharepoint"),
    },
  },
});
