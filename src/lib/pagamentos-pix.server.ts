/**
 * Recebimento e validação dos webhooks de Pix (Itaú).
 *
 * O Itaú/Bacen envia notificações quando uma cobrança Pix é liquidada,
 * expira, é removida ou devolvida. Aqui o payload é normalizado, validado
 * e aplicado na proposta/pedido correspondente:
 *
 *   pago      → Aguardando Pagamento → Processando
 *   expirado  → pedido segue em Aguardando Pagamento (cobrança pode ser reemitida)
 *   cancelado → pedido é cancelado (cobrança removida/devolvida)
 *
 * Nunca grave credenciais ou certificados nos logs.
 */

import * as db from "./propostas-db.server";

export type PixEventoTipo = "pago" | "expirado" | "cancelado" | "desconhecido";

export type PixEvento = {
  tipo: PixEventoTipo;
  txid: string;
  endToEndId: string | null;
  valor: number | null;
  horario: string | null;
  statusOriginal: string | null;
};

/** Status de cobrança (cob) do Bacen → evento interno. */
function statusParaTipo(status: string): PixEventoTipo {
  const s = status.trim().toUpperCase();
  if (["CONCLUIDA", "LIQUIDADA", "PAGA", "COBRANCA_LIQUIDADA"].includes(s)) return "pago";
  if (["EXPIRADA", "EXPIRADO", "ATIVA_EXPIRADA", "COBRANCA_EXPIRADA"].includes(s)) return "expirado";
  if (
    [
      "REMOVIDA_PELO_USUARIO_RECEBEDOR",
      "REMOVIDA_PELO_PSP",
      "CANCELADA",
      "CANCELADO",
      "DEVOLVIDA",
      "COBRANCA_CANCELADA",
    ].includes(s)
  ) {
    return "cancelado";
  }
  return "desconhecido";
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Normaliza os formatos aceitos:
 *  - { pix: [{ txid, endToEndId, valor, horario, devolucoes? }] }
 *  - { cob: { txid, status, valor: { original } } } | { cobranca: {...} }
 *  - { txid, status, valor }
 */
export function normalizarEventosPix(payload: Record<string, unknown>): PixEvento[] {
  const eventos: PixEvento[] = [];

  const lista = Array.isArray(payload["pix"]) ? (payload["pix"] as Record<string, unknown>[]) : [];
  for (const p of lista) {
    const devolvido =
      Array.isArray(p["devolucoes"]) &&
      (p["devolucoes"] as Record<string, unknown>[]).some(
        (d) => String((d as Record<string, unknown>)["status"] ?? "").toUpperCase() === "DEVOLVIDO",
      );
    const txid = str(p["txid"]);
    if (!txid) continue;
    eventos.push({
      tipo: devolvido ? "cancelado" : "pago",
      txid,
      endToEndId: str(p["endToEndId"]) ?? str(p["e2eid"]),
      valor: num(p["valor"]),
      horario: str(p["horario"]),
      statusOriginal: devolvido ? "DEVOLVIDO" : "PIX_RECEBIDO",
    });
  }

  const cobs: Record<string, unknown>[] = [];
  for (const chave of ["cob", "cobranca", "cobv", "cobrancas", "cobs"]) {
    const v = payload[chave];
    if (Array.isArray(v)) cobs.push(...(v as Record<string, unknown>[]));
    else if (v && typeof v === "object") cobs.push(v as Record<string, unknown>);
  }
  if (!cobs.length && str(payload["txid"]) && str(payload["status"])) {
    cobs.push(payload);
  }
  for (const c of cobs) {
    const txid = str(c["txid"]);
    const status = str(c["status"]);
    if (!txid || !status) continue;
    const valorObj = c["valor"];
    const valor =
      valorObj && typeof valorObj === "object"
        ? num((valorObj as Record<string, unknown>)["original"])
        : num(valorObj);
    eventos.push({
      tipo: statusParaTipo(status),
      txid,
      endToEndId: str(c["endToEndId"]),
      valor,
      horario: str(c["horario"]) ?? str(c["calendario"]),
      statusOriginal: status,
    });
  }

  return eventos;
}

/** Localiza a proposta pelo txid gravado nela ou pelo nº embutido no txid. */
async function localizarProposta(txid: string): Promise<Record<string, any> | null> {
  const porTxid = await db.listarPropostasPorPagamentoTxid(txid);
  if (porTxid) return porTxid;
  const numero = (txid.match(/\d{6}/) ?? [])[0];
  if (numero) return await db.getPropostaPorNumero(numero);
  return null;
}

export type PixAplicacao = {
  txid: string;
  tipo: PixEventoTipo;
  proposta_id?: string;
  numero?: string | null;
  de?: string;
  para?: string;
  skipped?: boolean;
  motivo?: string;
};

/** Aplica um evento na proposta, de forma idempotente. */
export async function aplicarEventoPix(ev: PixEvento): Promise<PixAplicacao> {
  const base = { txid: ev.txid, tipo: ev.tipo };

  if (ev.tipo === "desconhecido") {
    return { ...base, skipped: true, motivo: `Status Pix não tratado: ${ev.statusOriginal ?? "-"}` };
  }

  const proposta = await localizarProposta(ev.txid);
  if (!proposta) {
    return { ...base, skipped: true, motivo: "Nenhum pedido encontrado para este txid." };
  }

  const de = String(proposta["status"] ?? "Salvo");
  const pagamentoAtual = String(proposta["pagamento_status"] ?? "");

  // Idempotência: mesmo evento reenviado pelo PSP não reprocessa.
  if (pagamentoAtual === ev.tipo && (ev.tipo !== "pago" || proposta["pagamento_e2eid"] === ev.endToEndId)) {
    return { ...base, proposta_id: proposta.id, numero: proposta["numero"], de, skipped: true, motivo: "Evento já aplicado." };
  }
  if (pagamentoAtual === "pago" && ev.tipo !== "cancelado") {
    return { ...base, proposta_id: proposta.id, numero: proposta["numero"], de, skipped: true, motivo: "Pedido já está pago." };
  }

  const patch: Record<string, unknown> = {
    pagamento_meio: "pix",
    pagamento_status: ev.tipo,
    pagamento_txid: ev.txid,
    pagamento_e2eid: ev.endToEndId,
    pagamento_valor: ev.valor,
    pagamento_atualizado_em: new Date().toISOString(),
  };

  let para = de;
  if (ev.tipo === "pago") {
    patch["pago_em"] = ev.horario ?? new Date().toISOString();
    if (de === "Aguardando Pagamento") para = "Processando";
  } else if (ev.tipo === "cancelado") {
    if (de !== "Entregue" && de !== "Cancelado") para = "Cancelado";
  }
  // expirado: pedido permanece em Aguardando Pagamento para reemissão da cobrança.

  if (para !== de) patch["status"] = para;

  await db.atualizarProposta(proposta.id, patch);
  await db.registrarConclusaoLog({
    proposta_id: proposta.id,
    numero: proposta["numero"] ?? null,
    status: para,
    resultado: `pix:${ev.tipo}`,
    origem: "webhook-pix",
    detalhe: `txid ${ev.txid}${ev.endToEndId ? ` • e2e ${ev.endToEndId}` : ""} • ${de} → ${para}`,
  });

  return { ...base, proposta_id: proposta.id, numero: proposta["numero"] ?? null, de, para };
}

/** Processa o payload completo do webhook. */
export async function processarWebhookPix(payload: Record<string, unknown>) {
  const eventos = normalizarEventosPix(payload);
  if (!eventos.length) {
    return { skipped: true, motivo: "Payload sem eventos Pix reconhecíveis.", recebidos: 0 };
  }
  const aplicados: PixAplicacao[] = [];
  for (const ev of eventos) aplicados.push(await aplicarEventoPix(ev));
  const atualizados = aplicados.filter((a) => !a.skipped);
  return {
    recebidos: eventos.length,
    atualizados: atualizados.length,
    detalhes: aplicados,
    skipped: atualizados.length === 0,
    ...(atualizados.length === 0 ? { motivo: aplicados[0]?.motivo ?? "Nenhum pedido atualizado." } : {}),
  };
}
