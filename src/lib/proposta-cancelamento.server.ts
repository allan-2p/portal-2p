/**
 * Efeitos colaterais do cancelamento de um pedido (após a transição de status):
 * e-mail de solicitação aos setores, cancelamento da carga Fretefy e — quando a
 * RFC existir e estiver configurada — cancelamento da OV no SAP.
 *
 * Igual à plataforma antiga (Controller.php:438-477), que nunca cancelava no
 * SAP automaticamente: o time faz via VA02 a partir do e-mail.
 *
 * Tudo best effort: nenhum efeito desfaz o cancelamento já aplicado.
 */

import * as db from "./propostas-db.server";
import { logIntegrationEvent } from "./integration-logs.server";
import {
  aguardarDesfechoEmails,
  enviarEmailRastreado,
  layoutEmail,
  type ResultadoEnvioRastreado,
} from "./email.server";

export type EfeitosCancelamentoResult = {
  /** true quando a RFC de cancelamento existia e o SAP confirmou. */
  sapCancelado: boolean;
  /** Desfecho real dos e-mails aos setores; null quando não havia e-mail a enviar. */
  emails: ResultadoEnvioRastreado | null;
};

/**
 * Texto honesto sobre o envio dos e-mails de cancelamento: nunca diz
 * "avisados por e-mail" quando o provedor recusou ou não confirmou.
 */
export function avisoEnvioCancelamento(r: EfeitosCancelamentoResult): string | null {
  const e = r.emails;
  if (!e || !e.total) return null;
  if (e.falharam > 0) {
    const motivo = e.erro ? ` Motivo informado pelo provedor: ${e.erro}.` : "";
    return `FALHA no envio dos e-mails de cancelamento (${e.falharam} de ${e.total}).${motivo} Avise os setores manualmente.`;
  }
  if (e.pendentes > 0) {
    return "E-mails de cancelamento enfileirados, mas ainda sem confirmação de envio pelo provedor — acompanhe em Integrações.";
  }
  return "Os setores foram avisados por e-mail.";
}

const DESTINOS_PADRAO =
  "logistica@2pgroup.com.br,camila@2pgroup.com.br,nfe@2pgroup.com.br,pedidos@2pgroup.com.br,financeiro@2pgroup.com.br";

function destinatarios(): string[] {
  return String(process.env["CANCELAMENTO_NOTIFICACAO_EMAIL"] ?? DESTINOS_PADRAO)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

const SELECT =
  "id,numero,nome,organizacao,cliente_nome,cliente_doc,sap_ov_numero,nf_numero,nf_serie,fretefy_oferta_id,valor_total,totais";

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Cancelamento automático no SAP — só quando a RFC estiver configurada. */
async function cancelarOvNoSap(
  row: Record<string, any>,
  motivo: string | null,
): Promise<boolean> {
  const url = process.env["SAP_OV_CANCELAR_URL"];
  if (!url) return false; // RFC ainda não existe no gateway: cancelamento é manual (VA02)

  const bruto = process.env["SAP_OV_AUTH"] ?? process.env["SAP_BRIDGE_AUTH"];
  const user = process.env["SAP_BRIDGE_USER"];
  const pass = process.env["SAP_BRIDGE_PASSWORD"];
  const auth = bruto
    ? bruto.startsWith("Basic ") || bruto.startsWith("Bearer ")
      ? bruto
      : `Basic ${bruto}`
    : user && pass
      ? `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`
      : undefined;
  if (!auth) return false;

  const vbeln = String(row["sap_ov_numero"] ?? "").trim();
  const numero = String(row["numero"] ?? "").trim();
  const base = { slug: "sap", event: "ov-cancelar" } as const;
  const inicio = Date.now();

  try {
    const { comIdiomaPT, SAP_ACCEPT_LANGUAGE } = await import("./sap-lang.server");
    const corpo = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:urn="urn:sap-com:document:sap:rfc:functions">
  <soap:Body>
    <urn:ZNFE_OV_CANCELAR>
      <NROPED>${esc(numero)}</NROPED>
      <VBELN>${esc(vbeln)}</VBELN>
      <MOTIVO>${esc(motivo ?? "Cancelamento solicitado no Portal 2P")}</MOTIVO>
    </urn:ZNFE_OV_CANCELAR>
  </soap:Body>
</soap:Envelope>`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    let xml = "";
    let status = 0;
    try {
      const res = await fetch(comIdiomaPT(url), {
        method: "POST",
        headers: {
          "content-type": "application/soap+xml; charset=utf-8",
          "accept-language": SAP_ACCEPT_LANGUAGE,
          authorization: auth,
        },
        body: corpo,
        signal: controller.signal,
      });
      status = res.status;
      xml = await res.text();
    } finally {
      clearTimeout(timer);
    }

    const erro =
      status >= 400 ||
      /<TYPE>\s*E\s*<\/TYPE>/i.test(xml) ||
      /<TYPE>\s*A\s*<\/TYPE>/i.test(xml);
    await logIntegrationEvent({
      ...base,
      level: erro ? "error" : "info",
      message: erro
        ? `SAP recusou o cancelamento da OV ${vbeln} (HTTP ${status}).`
        : `OV ${vbeln} cancelada automaticamente no SAP.`,
      detail: {
        proposta_id: row["id"],
        numero,
        sap_ov: vbeln,
        http: status,
        resposta: xml.replace(/\s+/g, " ").slice(0, 500),
      },
      durationMs: Date.now() - inicio,
    });
    return !erro;
  } catch (e) {
    await logIntegrationEvent({
      ...base,
      level: "error",
      message: `Falha ao cancelar a OV ${vbeln} no SAP: ${(e as Error).message}`.slice(0, 500),
      detail: { proposta_id: row["id"], numero, sap_ov: vbeln },
    });
    return false;
  }
}

export async function efeitosCancelamento(
  propostaId: string,
  ctx: { actorNome?: string | null; motivo?: string | null } = {},
): Promise<EfeitosCancelamentoResult> {
  const resultado: EfeitosCancelamentoResult = { sapCancelado: false, emails: null };
  let row: Record<string, any> | null = null;
  try {
    row = (await db.getProposta(propostaId, SELECT)) as Record<string, any> | null;
  } catch {
    row = null;
  }
  if (!row) return resultado;

  const vbeln = String(row["sap_ov_numero"] ?? "").trim();

  // 1) Cancelamento no SAP — só se a RFC estiver configurada (hoje: não está).
  let canceladoNoSap = false;
  if (vbeln) {
    try {
      canceladoNoSap = await cancelarOvNoSap(row, ctx.motivo ?? null);
    } catch {
      /* best effort */
    }
  }
  resultado.sapCancelado = canceladoNoSap;

  // 2) E-mail aos setores — só para pedido que chegou ao SAP (igual à antiga).
  //    Rastreado: aguarda o desfecho real no provedor para a tela não dizer
  //    "enviado" quando o envio foi recusado (ex.: domínio não verificado).
  if (vbeln) {
    const numero = String(row["numero"] ?? "").trim();
    const org = String(row["organizacao"] ?? "") === "carregadores" ? "2P Carregadores" : "2P Solar";
    const nf = String(row["nf_numero"] ?? "").trim();
    const instrucaoSap = canceladoNoSap
      ? "OV cancelada automaticamente no SAP."
      : "Favor cancelar a ordem de venda no SAP (VA02).";
    const linhas = [
      `<strong>Pedido (portal):</strong> ${esc(numero)}`,
      `<strong>Ordem de venda (SAP):</strong> ${esc(vbeln)} — ${esc(instrucaoSap)}`,
      nf ? `<strong>Nota fiscal:</strong> ${esc(nf)}${row["nf_serie"] ? ` / série ${esc(row["nf_serie"])}` : ""}` : "",
      `<strong>Cliente:</strong> ${esc(row["cliente_nome"])}${row["cliente_doc"] ? ` (${esc(row["cliente_doc"])})` : ""}`,
      row["nome"] ? `<strong>Projeto:</strong> ${esc(row["nome"])}` : "",
      `<strong>Unidade:</strong> ${esc(org)}`,
      `<strong>Cancelado por:</strong> ${esc(ctx.actorNome ?? "Portal 2P")}`,
      ctx.motivo ? `<strong>Motivo:</strong> ${esc(ctx.motivo)}` : "",
    ].filter(Boolean);

    const html = layoutEmail(
      `Solicitação de cancelamento — pedido ${esc(numero)}`,
      `<p>${linhas.join("<br />")}</p>`,
    );

    const messageIds: string[] = [];
    let total = 0;
    let falhaEnfileirar = 0;
    for (const to of destinatarios()) {
      total++;
      try {
        const r = await enviarEmailRastreado({
          to,
          subject: `Cancelamento de pedido ${numero} PORTAL 2P`,
          html,
          label: "cancelamento-pedido",
          idempotencyKey: `cancelamento:${propostaId}:${to}`,
        });
        if (r.ok && r.messageId) messageIds.push(r.messageId);
        else falhaEnfileirar++;
      } catch {
        falhaEnfileirar++;
      }
    }

    const desfecho = await aguardarDesfechoEmails(messageIds);
    resultado.emails = {
      total,
      enviados: desfecho.enviados,
      falharam: desfecho.falharam + falhaEnfileirar,
      pendentes: desfecho.pendentes,
      erro: desfecho.erro,
    };
  }

  // 3) Cancelar a carga na Fretefy.
  if (String(row["fretefy_oferta_id"] ?? "").trim()) {
    try {
      const { deletarOfertaCarga } = await import("./fretefy-oferta.server");
      await deletarOfertaCarga(propostaId, String(row["fretefy_oferta_id"]));
    } catch {
      /* best effort */
    }
  }

  return resultado;
}
