/**
 * Envio de e-mails transacionais do portal.
 *
 * Usa a fila de e-mail já existente do projeto (`enqueue_email` →
 * `/lovable/email/queue/process`), então o envio é assíncrono, com retry e
 * registro em `email_send_log`. Nunca lança: e-mail não pode quebrar o fluxo.
 */

const SITE_NAME = "portal-2p";
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

export async function enviarEmail(msg: EmailTransacional): Promise<boolean> {
  try {
    const destino = (msg.to ?? "").trim();
    if (!destino || !destino.includes("@")) return false;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const messageId = crypto.randomUUID();

    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: msg.label,
      recipient_email: destino,
      status: "pending",
    } as any);

    const { error } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: destino,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: msg.subject,
        html: msg.html,
        text: msg.text ?? msg.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        purpose: "transactional",
        label: msg.label,
        ...(msg.idempotencyKey ? { idempotency_key: msg.idempotencyKey } : {}),
        queued_at: new Date().toISOString(),
      } as any,
    });

    if (error) {
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: msg.label,
        recipient_email: destino,
        status: "failed",
        error_message: error.message.slice(0, 300),
      } as any);
      return false;
    }
    return true;
  } catch {
    return false;
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
