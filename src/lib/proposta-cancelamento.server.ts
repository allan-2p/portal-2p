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
  COPIA_REGISTRO,
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
 * "enviado" quando o provedor recusou ou não confirmou.
 */
export function avisoEnvioCancelamento(r: EfeitosCancelamentoResult): string | null {
  const e = r.emails;
  if (!e || !e.total) return null;
  if (e.falharam > 0 && e.enviados > 0) {
    const suprimido = e.erro && /descadastrado|suppressed|unsubscribed|bounce/i.test(e.erro);
    if (suprimido) {
      return `E-mail de cancelamento enviado. Um destinatário está bloqueado pelo provedor (${e.erro}) e não recebeu.`;
    }
  }
  if (e.falharam > 0) {
    const motivo = e.erro ? ` Motivo informado pelo provedor: ${e.erro}.` : "";
    return `FALHA no envio dos e-mails de cancelamento (${e.falharam} de ${e.total}).${motivo} Avise os setores manualmente.`;
  }
  if (e.pendentes > 0) {
    return "E-mail de cancelamento enfileirado, mas ainda sem confirmação de envio pelo provedor — acompanhe em Integrações.";
  }
  return "E-mail de cancelamento enviado.";
}

const DESTINOS_PADRAO =
  "logistica@2pgroup.com.br,nfe@2pgroup.com.br,pedidos@2pgroup.com.br,financeiro@2pgroup.com.br";

/** Endereços que sempre recebem cópia de registro do cancelamento. */
const COPIAS_FIXAS = ["alexandre@2pgroup.com.br"];

function destinatarios(): string[] {
  return String(process.env["CANCELAMENTO_NOTIFICACAO_EMAIL"] ?? DESTINOS_PADRAO)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

const SELECT =
  "id,numero,nome,organizacao,cliente_nome,cliente_doc,sap_ov_numero,nf_numero,nf_serie,fretefy_oferta_id,totais,consultor_id,consultor_nome";

async function emailDoConsultor(
  consultorId: string | null | undefined,
  consultorNome?: string | null,
): Promise<string | null> {
  const limpar = (v: unknown) => String(v ?? "").trim().toLowerCase();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (consultorId) {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", consultorId)
        .maybeSingle();
      const email = limpar((data as any)?.email);
      if (email.includes("@")) return email;
    }
    // Pedidos vindos da plataforma antiga só têm o nome do consultor.
    const nome = String(consultorNome ?? "").trim();
    if (nome) {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("email,full_name")
        .ilike("full_name", nome)
        .limit(2);
      const linhas = ((data as any[]) ?? []).filter((r) => limpar(r?.email).includes("@"));
      if (linhas.length === 1) return limpar(linhas[0]?.email);
    }
    return null;
  } catch {
    return null;
  }
}


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
  ctx: { actorNome?: string | null; motivo?: string | null; observacao?: string | null; forcarReenvio?: boolean } = {},
): Promise<EfeitosCancelamentoResult> {
  const resultado: EfeitosCancelamentoResult = { sapCancelado: false, emails: null };
  let row: Record<string, any> | null = null;
  let erroLeitura: string | null = null;
  try {
    row = (await db.getProposta(propostaId, SELECT)) as Record<string, any> | null;
  } catch (e) {
    // Nunca deixar a leitura derrubar o aviso em silêncio: tenta de novo com
    // todas as colunas e, se ainda falhar, registra e devolve falha explícita.
    erroLeitura = (e as Error).message;
    try {
      row = (await db.getProposta(propostaId)) as Record<string, any> | null;
      erroLeitura = null;
    } catch (e2) {
      erroLeitura = (e2 as Error).message;
      row = null;
    }
  }
  if (!row) {
    await logIntegrationEvent({
      slug: "proposta",
      event: "cancelamento-email",
      level: "error",
      message: `Não foi possível ler o pedido para avisar os setores do cancelamento: ${erroLeitura ?? "pedido não encontrado"}`.slice(0, 500),
      detail: { proposta_id: propostaId },
    });
    resultado.emails = {
      total: 1,
      enviados: 0,
      falharam: 1,
      pendentes: 0,
      erro: erroLeitura ?? "pedido não encontrado",
    };
    return resultado;
  }


  const vbeln = String(row["sap_ov_numero"] ?? "").trim();

  // 1) Cancelamento no SAP — só se a RFC estiver configurada (hoje: não está).
  let canceladoNoSap = false;
  if (vbeln) {
    try {
      canceladoNoSap = await cancelarOvNoSap(
        row,
        [ctx.motivo, ctx.observacao].filter(Boolean).join(" — ") || null,
      );
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
      ctx.observacao ? `<strong>Descrição do cancelamento:</strong> ${esc(ctx.observacao)}` : "",
    ].filter(Boolean);

    // O consultor responsável pela proposta também recebe o aviso de cancelamento.
    const emailConsultor = await emailDoConsultor(row["consultor_id"], row["consultor_nome"]);
    const setores = new Set(destinatarios());
    if (emailConsultor) setores.add(emailConsultor);
    const copias = new Set<string>([...COPIAS_FIXAS, COPIA_REGISTRO()].map((e) => e.toLowerCase()));
    for (const c of copias) setores.delete(c);

    const listaVisivel = [
      `<strong>Para:</strong> ${esc(Array.from(setores).join(", "))}`,
      `<strong>Em cópia:</strong> ${esc(Array.from(copias).join(", "))}`,
    ].join("<br />");

    const html = layoutEmail(
      `Solicitação de cancelamento — pedido ${esc(numero)}`,
      `<p>${linhas.join("<br />")}</p>` +
        `<p style="font-size:12px;color:#6b7280">${listaVisivel}</p>`,
    );

    const messageIds: string[] = [];
    let total = 0;
    let falhaEnfileirar = 0;

    // Um e-mail por destinatário (a API não aceita múltiplos endereços no To).
    for (const to of [...setores, ...copias]) {
      total++;
      try {
        const r = await enviarEmailRastreado(
          {
            to,
            subject: `Cancelamento do pedido ${numero}`,
            html,
            label: "cancelamento-pedido",
            idempotencyKey: `cancelamento:${propostaId}:${to}${ctx.forcarReenvio ? `:${crypto.randomUUID()}` : ""}`,
          },
          { ehCopiaRegistro: true }, // evita a cópia de registro automática
        );
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
