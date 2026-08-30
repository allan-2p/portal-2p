/**
 * Envio de e-mails transacionais do portal.
 *
 * Os e-mails são enviados diretamente pela API de e-mail gerenciada da
 * plataforma (`sendLovableEmail`): entrega, tentativas, supressão e
 * descadastro são tratados do lado do provedor. O histórico continua
 * registrado em `email_send_log`. Nunca lança: e-mail não pode quebrar o fluxo.
 */

import { EmailAPIError, sendLovableEmail } from "@lovable.dev/email-js";

const SITE_NAME = "Portal 2P";
const FROM_DOMAIN = "notify.portal.2pgroup.app";
const SENDER_DOMAIN = "notify.portal.2pgroup.app";

export type EmailTransacional = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Rótulo do template, usado no log (ex.: "boleto-vencendo"). */
  label: string;
  /** Evita e-mails duplicados no reprocessamento do job. */
  idempotencyKey?: string;
};

/** Endereço fixo de registro: recebe cópia de todo e-mail de negócio do portal. */
const COPIA_REGISTRO = () =>
  String(process.env["EMAIL_COPIA_REGISTRO"] ?? "allan@2pgroup.com.br").trim().toLowerCase();

type StatusLog = "sent" | "suppressed" | "failed";

async function registrarLog(
  messageId: string,
  msg: EmailTransacional,
  destino: string,
  status: StatusLog,
  errorMessage?: string,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: msg.label,
      recipient_email: destino,
      status,
      ...(errorMessage ? { error_message: errorMessage.slice(0, 300) } : {}),
    } as any);
    if (error) {
      console.error("Falha ao registrar histórico de e-mail", {
        code: error.code,
        message: error.message,
      });
    }
  } catch (e) {
    console.error("Falha ao registrar histórico de e-mail", e);
  }
}

async function enviarEmailInterno(
  msg: EmailTransacional,
  opts: { ehCopiaRegistro?: boolean } = {},
): Promise<{ ok: boolean; messageId: string | null }> {
  try {
    const destino = (msg.to ?? "").trim();
    if (!destino || !destino.includes("@")) return { ok: false, messageId: null };

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      console.error("LOVABLE_API_KEY não configurada — e-mail não enviado");
      return { ok: false, messageId: null };
    }

    const messageId = crypto.randomUUID();
    const texto =
      msg.text ?? msg.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    let ok = false;
    try {
      await sendLovableEmail(
        {
          to: destino,
          from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject: msg.subject,
          html: msg.html,
          text: texto,
          purpose: "transactional",
          label: msg.label,
          idempotency_key: msg.idempotencyKey || messageId,
        },
        { apiKey, sendUrl: process.env["LOVABLE_SEND_URL"] },
      );
      ok = true;
      await registrarLog(messageId, msg, destino, "sent");
    } catch (error) {
      if (error instanceof EmailAPIError && error.code === "recipient_suppressed") {
        await registrarLog(messageId, msg, destino, "suppressed", "Destinatário descadastrado");
      } else {
        const detalhe = error instanceof Error ? error.message : String(error);
        console.error("Falha no envio de e-mail", { label: msg.label, detalhe });
        await registrarLog(messageId, msg, destino, "failed", detalhe);
      }
      return { ok: false, messageId };
    }

    // Cópia de registro: todo e-mail de negócio vai também para o endereço de
    // registro — exceto quando o destinatário JÁ é ele, ou quando esta chamada
    // já é a própria cópia (evita recursão). Best effort.
    if (!opts.ehCopiaRegistro && destino.toLowerCase() !== COPIA_REGISTRO()) {
      try {
        await enviarEmailInterno(
          {
            to: COPIA_REGISTRO(),
            subject: `[registro] ${msg.subject}`,
            html:
              `<p style="font-size:12px;color:#6b7280">Cópia de registro — destinatário original: ${destino}</p>` +
              msg.html,
            label: `${msg.label}-registro`,
            ...(msg.idempotencyKey ? { idempotencyKey: `${msg.idempotencyKey}-registro` } : {}),
          },
          { ehCopiaRegistro: true },
        );
      } catch {
        /* cópia é best effort */
      }
    }

    return { ok, messageId };
  } catch (e) {
    console.error("Falha inesperada no envio de e-mail", e);
    return { ok: false, messageId: null };
  }
}

export async function enviarEmail(
  msg: EmailTransacional,
  opts: { ehCopiaRegistro?: boolean } = {},
): Promise<boolean> {
  return (await enviarEmailInterno(msg, opts)).ok;
}

/**
 * Igual a `enviarEmail`, mas devolve o `message_id` do log — permite consultar
 * depois o desfecho real em `email_send_log`.
 */
export async function enviarEmailRastreado(
  msg: EmailTransacional,
  opts: { ehCopiaRegistro?: boolean } = {},
): Promise<{ ok: boolean; messageId: string | null }> {
  return enviarEmailInterno(msg, opts);
}

export type ResultadoEnvioRastreado = {
  total: number;
  enviados: number;
  falharam: number;
  pendentes: number;
  /** Primeiro erro encontrado (ex.: recusa do provedor), para exibir ao usuário. */
  erro: string | null;
};

/**
 * Consulta o desfecho dos e-mails enviados. Com o envio direto o resultado já
 * está gravado em `email_send_log` no momento da chamada.
 */
export async function aguardarDesfechoEmails(
  messageIds: string[],
  _timeoutMs = 15_000,
): Promise<ResultadoEnvioRastreado> {
  const ids = messageIds.filter(Boolean);
  const vazio: ResultadoEnvioRastreado = {
    total: ids.length,
    enviados: 0,
    falharam: 0,
    pendentes: ids.length,
    erro: null,
  };
  if (!ids.length) return { ...vazio, pendentes: 0 };

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("email_send_log")
      .select("message_id,status,error_message,created_at")
      .in("message_id", ids)
      .order("created_at", { ascending: false });

    const ultima = new Map<string, Record<string, any>>();
    for (const r of (data ?? []) as Record<string, any>[]) {
      const mid = String(r["message_id"] ?? "");
      if (mid && !ultima.has(mid)) ultima.set(mid, r);
    }

    let enviados = 0, falharam = 0, pendentes = 0, erro: string | null = null;
    for (const id of ids) {
      const row = ultima.get(id);
      const st = String(row?.["status"] ?? "pending");
      if (st === "sent") enviados++;
      else if (st === "failed" || st === "dlq" || st === "suppressed" || st === "bounced") {
        falharam++;
        if (!erro && row?.["error_message"]) erro = String(row["error_message"]).slice(0, 200);
      } else pendentes++;
    }

    return { total: ids.length, enviados, falharam, pendentes, erro };
  } catch {
    return vazio;
  }
}

/** Layout simples e neutro, no tom do portal. */
export function layoutEmail(titulo: string, corpo: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#1c1f23">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;padding:28px">
    <h1 style="margin:0 0 16px;font-size:18px;line-height:1.4">${titulo}</h1>
    <div style="font-size:14px;line-height:1.6">${corpo}</div>
    <p style="margin:24px 0 0;font-size:12px;color:#6b7280">Portal 2P Group · mensagem automática, não responda este e-mail.</p>
  </div></body></html>`;
}
