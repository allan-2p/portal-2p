/**
 * Executores dos gatilhos monitorados.
 *
 * Cada job tem um executor único, usado tanto pelo disparo original
 * (cron/webhook) quanto pelo reprocessamento manual na tela de monitoramento.
 * Assim, reprocessar é sempre idêntico à execução original.
 */
import type { JobSlug } from "@/lib/job-runs.server";

export type JobResult = Record<string, unknown> & { skipped?: boolean };
export type JobExecutor = (payload: Record<string, unknown>) => Promise<JobResult>;

/** Motores ainda não ativados: registram a execução como "ignorada", com motivo. */
function pendente(motivo: string): JobExecutor {
  return async (payload) => ({ skipped: true, motivo, payload_recebido: payload });
}

export const JOB_EXECUTORS: Record<JobSlug, JobExecutor> = {
  // A finalização acontece dentro do fluxo do vendedor; não é reexecutável.
  "checkout.finalizar": async () => ({
    skipped: true,
    motivo: "A finalização do pedido só pode ser refeita pelo vendedor no portal.",
  }),

  "cron.sap-nfs": pendente(
    "Motor de consulta ZNFE_OV_CONSULTAR ainda não ativado — a execução foi registrada para auditoria.",
  ),

  "cron.pagamento-link": pendente(
    "Motor do boleto Itaú aguardando credenciais — a execução foi registrada para auditoria.",
  ),

  // O webhook apenas registra o retorno recebido enquanto o motor de rastreio
  // não estiver ligado; o payload fica auditável e pode ser reprocessado.
  "webhook.fretefy": async (payload) => ({
    skipped: true,
    motivo: "Motor de rastreio Fretefy ainda não ativado — retorno registrado para auditoria.",
    payload_recebido: payload,
  }),
};

export function executorFor(job: JobSlug): JobExecutor {
  return JOB_EXECUTORS[job];
}
