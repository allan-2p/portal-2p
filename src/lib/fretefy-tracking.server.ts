/**
 * Motor do webhook de rastreio da Fretefy.
 *
 * Entrega concluída move o pedido de `Coletado` para `Entregue` (via máquina de
 * status), grava `entregue_em`, re-sincroniza o Salesforce e notifica o dono do
 * pedido. Qualquer outro evento é apenas auditado.
 *
 * Idempotente: reexecutar o mesmo payload não duplica efeito — a guarda
 * otimista da transição já recusa o segundo processamento.
 */

import * as db from "./propostas-db.server";
import { interpretarEventoFretefy, type FretefyEvento } from "./fretefy-tracking";
import { aplicarTransicao } from "./proposta-transicao.server";
import { criarNotificacao } from "./notificacoes.server";
import { logIntegrationEvent } from "./integration-logs.server";

export type FretefyTrackingResultado = Record<string, unknown> & { skipped?: boolean };

async function acharProposta(ev: FretefyEvento): Promise<Record<string, any> | null> {
  if (!ev.pedido) return null;
  const porNumero = await db.getPropostaPorNumero(ev.pedido);
  if (porNumero) return porNumero as Record<string, any>;
  // Alguns retornos trazem o número com zeros à esquerda ou com sufixo.
  const limpo = ev.pedido.replace(/\D/g, "").replace(/^0+/, "");
  if (limpo && limpo !== ev.pedido) {
    const alt = await db.getPropostaPorNumero(limpo);
    if (alt) return alt as Record<string, any>;
  }
  return null;
}

export async function processarWebhookFretefy(
  payload: Record<string, unknown>,
): Promise<FretefyTrackingResultado> {
  const ev = interpretarEventoFretefy(payload ?? {});
  const base = { pedido: ev.pedido, tipo: ev.tipo, evento_id: ev.eventoId };

  if (!ev.pedido) return { ...base, skipped: true, motivo: "Payload sem número do pedido." };

  const proposta = await acharProposta(ev);
  if (!proposta) return { ...base, skipped: true, motivo: `Nenhum pedido encontrado para "${ev.pedido}".` };

  const id = String(proposta["id"]);
  const de = String(proposta["status"] ?? "");

  if (ev.tipo !== "entregue") {
    await logIntegrationEvent({
      slug: "fretefy",
      level: ev.tipo === "ocorrencia" ? "warn" : "info",
      event: "rastreio",
      message: `${ev.descricao ?? ev.tipo} • pedido ${ev.pedido}`,
      detail: { proposta_id: id, status: de, evento: ev.tipo, payload },
    });
    return { ...base, proposta_id: id, de, skipped: true, motivo: `Evento de rastreio "${ev.tipo}" — apenas auditado.` };
  }

  if (proposta["entregue_em"]) {
    return { ...base, proposta_id: id, de, skipped: true, motivo: "Entrega já registrada." };
  }

  const r = await aplicarTransicao(id, "Entregue", "webhook-fretefy", {
    de,
    patch: { entregue_em: ev.ocorridoEm ?? new Date().toISOString() },
  });

  if (!r.ok) {
    await logIntegrationEvent({
      slug: "fretefy",
      level: "warn",
      event: "rastreio",
      message: `Entrega recusada para o pedido ${ev.pedido}: ${r.motivo}`,
      detail: { proposta_id: id, status: de, payload },
    });
    return { ...base, proposta_id: id, de, skipped: true, motivo: r.motivo };
  }

  // Efeitos colaterais nunca derrubam a baixa da entrega.
  try {
    const { sincronizarPedidoSalesforce } = await import("./salesforce-pedidos.server");
    await sincronizarPedidoSalesforce(id, { forcar: true });
  } catch {
    /* best effort */
  }

  const dono = proposta["created_by"] ? String(proposta["created_by"]) : null;
  if (dono) {
    await criarNotificacao({
      user_id: dono,
      tipo: "info",
      titulo: `Pedido entregue · ${proposta["numero"] ?? ev.pedido}`,
      descricao: ev.descricao ?? "Entrega confirmada pela transportadora.",
      ref_tipo: "proposta",
      ref_id: id,
      chave: `fretefy:entregue:${id}`,
    });
  }

  await logIntegrationEvent({
    slug: "fretefy",
    level: "info",
    event: "rastreio",
    message: `Pedido ${ev.pedido} entregue.`,
    detail: { proposta_id: id, de, para: "Entregue", payload },
  });

  return { ...base, proposta_id: id, de, para: "Entregue", entregue_em: r.row?.["entregue_em"] ?? null };
}
