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

  // Boleto não tem baixa automática: a confirmação vem do SAP/financeiro e o
  // cron de NFs é quem avança o pedido. Aqui só auditamos a verificação.
  "cron.pagamento-link": pendente(
    "Boleto não possui baixa automática pela plataforma — confirmação vem do SAP/financeiro.",
  ),

  // Motor real: aplica o evento Pix no pedido (pago / expirado / cancelado).
  "webhook.pix-itau": async (payload) => {
    const { processarWebhookPix } = await import("@/lib/pagamentos-pix.server");
    return await processarWebhookPix(payload);
  },

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
