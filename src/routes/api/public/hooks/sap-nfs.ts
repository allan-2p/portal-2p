import { createFileRoute } from "@tanstack/react-router";
import { executarHookCron } from "@/lib/cron-hook.server";

/**
 * Cron: consulta de notas fiscais no SAP.
 * Autenticação: header `x-cron-secret` (segredo CRON_HOOK_SECRET).
 * Toda execução fica registrada em job_runs para auditoria/reprocessamento.
 */
export const Route = createFileRoute("/api/public/hooks/sap-nfs")({
  server: {
    handlers: {
      POST: ({ request }) => executarHookCron(request, "cron.sap-nfs"),
    },
  },
});
