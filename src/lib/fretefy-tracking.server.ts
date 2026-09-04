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
  // Contrato real: a Fretefy manda só o GUID da carga.
  if (ev.cargaId) {
    const porCarga = await db.getPropostaPorOfertaFretefy(ev.cargaId);
    if (porCarga) return porCarga as Record<string, any>;
  }
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
  const base = { pedido: ev.pedido, carga_id: ev.cargaId, tipo: ev.tipo, evento_id: ev.eventoId };

  if (!ev.pedido && !ev.cargaId)
    return { ...base, skipped: true, motivo: "Payload sem número do pedido nem CargaId." };

  const proposta = await acharProposta(ev);
  if (!proposta)
    return {
      ...base,
      skipped: true,
      motivo: `Nenhum pedido encontrado para "${ev.cargaId ?? ev.pedido}".`,
    };

  const id = String(proposta["id"]);
  const de = String(proposta["status"] ?? "");

  // O callback real não traz texto de status: a baixa vem da reconsulta da
  // carga (`GET carga/{id}` → entrega.eventoRota.dhEvento).
  if (ev.tipo !== "entregue" && ev.cargaId) {
    try {
      const { getStatusCarga, lerEntregaCarga, fretefyConfigurado } = await import("./fretefy-client.server");
      if (fretefyConfigurado()) {
        const res = await getStatusCarga(ev.cargaId);
        const dh = res.ok ? lerEntregaCarga(res.json) : null;
        if (dh) {
          ev.tipo = "entregue";
          ev.ocorridoEm = dh;
          ev.descricao = ev.descricao ?? "Entrega confirmada pela Fretefy.";
        }
      }
    } catch {
      /* best effort — sem reconsulta o evento é só auditado */
    }
  }


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
      event: de === "Coletado" ? "rastreio" : "entrega-pendente",
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

/** Reaplica uma entrega que chegou antes de o SAP levar o pedido a Coletado. */
export async function reconciliarEntregaPendente(propostaId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("integration_logs")
    .select("detail")
    .eq("slug", "fretefy")
    .eq("event", "entrega-pendente")
    .contains("detail", { proposta_id: propostaId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const payload = data?.detail && typeof data.detail === "object"
    ? (data.detail as Record<string, unknown>)["payload"]
    : null;
  if (!payload || typeof payload !== "object") return false;
  const resultado = await processarWebhookFretefy(payload as Record<string, unknown>);
  return resultado["para"] === "Entregue";
}
