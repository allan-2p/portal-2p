import { createFileRoute } from "@tanstack/react-router";
import { executarHookCron } from "@/lib/cron-hook.server";

/**
 * Cron/manual: força o número do portal no nome das oportunidades do
 * Salesforce. Autenticação: header `x-cron-secret`.
 */
export const Route = createFileRoute("/api/public/hooks/salesforce-numeros")({
  server: {
    handlers: {
      POST: ({ request }) => executarHookCron(request, "salesforce.numeros"),
    },
  },
});
