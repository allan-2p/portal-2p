/**
 * Aplicação central das transições de status do pedido.
 *
 * Todo motor (checkout, Pix, cron do SAP, webhook da Fretefy, cancelamento)
 * passa por aqui: a transição é validada contra `PROPOSTA_TRANSICOES` e o
 * update usa guarda otimista (`status = de`), de modo que dois motores
 * concorrentes nunca aplicam a mesma mudança duas vezes.
 *
 * Transição recusada não grava nada — fica registrada em `job_runs` com o
 * motivo, para auditoria.
 */

import * as db from "./propostas-db.server";
import { transicaoPermitida, type PropostaMotor } from "./proposta-status";
import { startJobRun, finishJobRun, type JobSlug } from "./job-runs.server";

export type TransicaoResultado = {
  ok: boolean;
  de: string;
  para: string;
  motivo: string | null;
  row: Record<string, unknown> | null;
};

const MOTOR_JOB: Record<PropostaMotor, JobSlug> = {
  checkout: "checkout.finalizar",
  pagamento: "webhook.pix-itau",
  "cron-sap": "cron.sap-nfs",
  "webhook-fretefy": "webhook.fretefy",
  humano: "checkout.finalizar",
};

async function registrarRecusa(
  motor: PropostaMotor,
  propostaId: string,
  de: string,
  para: string,
  motivo: string,
) {
  const runId = await startJobRun({
    job: MOTOR_JOB[motor],
    trigger: "portal",
    refType: "proposta",
    refId: propostaId,
    payload: { transicao: { de, para, motor } },
  });
  await finishJobRun(runId, { status: "skipped", result: { skipped: true, motivo } });
}

/**
 * Move a proposta para `para` se — e só se — a máquina de status permitir
 * essa transição para o motor informado.
 */
export async function aplicarTransicao(
  propostaId: string,
  para: string,
  motor: PropostaMotor,
  opts: { patch?: Record<string, unknown>; de?: string } = {},
): Promise<TransicaoResultado> {
  const de =
    opts.de ?? String(((await db.getProposta(propostaId, "id,status")) as Record<string, unknown> | null)?.["status"] ?? "");

  if (!de) {
    const motivo = "Proposta não encontrada.";
    await registrarRecusa(motor, propostaId, "-", para, motivo);
    return { ok: false, de: "", para, motivo, row: null };
  }

  if (de === para) {
    return { ok: false, de, para, motivo: "Pedido já está neste status.", row: null };
  }

  if (!transicaoPermitida(de, para, motor)) {
    const motivo = `Transição inválida: ${de} → ${para} (motor ${motor}).`;
    await registrarRecusa(motor, propostaId, de, para, motivo);
    return { ok: false, de, para, motivo, row: null };
  }

  const row = await db.atualizarProposta(propostaId, { ...(opts.patch ?? {}), status: para }, { status: `eq.${de}` });
  if (!row) {
    const motivo = `O status mudou durante a operação (esperado "${de}").`;
    await registrarRecusa(motor, propostaId, de, para, motivo);
    return { ok: false, de, para, motivo, row: null };
  }

  return { ok: true, de, para, motivo: null, row: row as Record<string, unknown> };
}
