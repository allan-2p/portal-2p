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
import { transicaoPermitida, propostaStatusDataCol, type PropostaMotor } from "./proposta-status";
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

  // Toda entrada em status carimba a data correspondente (Aguardando Pagamento
  // → aguardando_pagamento_em, Processando → processando_em, etc.) e também
  // `status_alterado_em`. Se as colunas ainda não existirem no banco, o update
  // é refeito sem os carimbos para não travar o fluxo.
  const agora = new Date().toISOString();
  const col = propostaStatusDataCol(para);
  const patchBase = { ...(opts.patch ?? {}), status: para };
  const patchComData = {
    ...patchBase,
    status_alterado_em: agora,
    ...(col && !(col in patchBase) ? { [col]: agora } : {}),
  };

  let row: Record<string, unknown> | null = null;
  try {
    row = (await db.atualizarProposta(propostaId, patchComData, { status: `eq.${de}` })) as Record<
      string,
      unknown
    > | null;
  } catch (e) {
    if (!/42703|PGRST204/i.test((e as Error).message)) throw e;
    row = (await db.atualizarProposta(propostaId, patchBase, { status: `eq.${de}` })) as Record<
      string,
      unknown
    > | null;
  }
  if (!row) {
    const motivo = `O status mudou durante a operação (esperado "${de}").`;
    await registrarRecusa(motor, propostaId, de, para, motivo);
    return { ok: false, de, para, motivo, row: null };
  }

  return { ok: true, de, para, motivo: null, row: row as Record<string, unknown> };
}
