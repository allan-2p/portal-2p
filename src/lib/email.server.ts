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

/** Endereço fixo de registro: recebe cópia de todo e-mail de negócio do portal. */
const COPIA_REGISTRO = () =>
  String(process.env["EMAIL_COPIA_REGISTRO"] ?? "allan@2pgroup.com.br").trim().toLowerCase();

/**
 * Token de descadastro do destinatário (obrigatório para e-mails de negócio:
 * sem ele o provedor recusa com 400 missing_unsubscribe). Um token por
 * endereço, reaproveitado entre envios.
 */
async function tokenDescadastro(email: string): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const alvo = email.trim().toLowerCase();

    const { data } = await supabaseAdmin
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", alvo)
      .maybeSingle();
    if (data?.token) return String(data.token);

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { error } = await supabaseAdmin
      .from("email_unsubscribe_tokens")
      .insert({ email: alvo, token } as any);
    if (!error) return token;

    // Corrida: outro envio criou o token no meio do caminho.
    const { data: existente } = await supabaseAdmin
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", alvo)
      .maybeSingle();
    return existente?.token ? String(existente.token) : null;
  } catch {
    return null;
  }
}

async function enviarEmailInterno(
  msg: EmailTransacional,
  opts: { ehCopiaRegistro?: boolean } = {},
): Promise<{ ok: boolean; messageId: string | null }> {
  try {
    const destino = (msg.to ?? "").trim();
    if (!destino || !destino.includes("@")) return { ok: false, messageId: null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const messageId = crypto.randomUUID();

    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: msg.label,
      recipient_email: destino,
      status: "pending",
    } as any);

    const unsubscribeToken = await tokenDescadastro(destino);

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
        ...(unsubscribeToken ? { unsubscribe_token: unsubscribeToken } : {}),
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

    return { ok: true, messageId };

  } catch {
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
 * depois o desfecho real no provedor (sent/dlq) em `email_send_log`.
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
 * Aguarda o desfecho real dos e-mails enfileirados (a fila processa a cada
 * poucos segundos). Consulta o status mais recente de cada `message_id` em
 * `email_send_log` até todos saírem de "pending" ou estourar o tempo limite.
 */
export async function aguardarDesfechoEmails(
  messageIds: string[],
  timeoutMs = 15_000,
): Promise<ResultadoEnvioRastreado> {
  const ids = messageIds.filter(Boolean);
  const vazio: ResultadoEnvioRastreado = { total: ids.length, enviados: 0, falharam: 0, pendentes: ids.length, erro: null };
  if (!ids.length) return vazio;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const limite = Date.now() + timeoutMs;

  for (;;) {
    try {
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

      if (pendentes === 0 || Date.now() >= limite) {
        return { total: ids.length, enviados, falharam, pendentes, erro };
      }
    } catch {
      if (Date.now() >= limite) return vazio;
    }
    await new Promise((r) => setTimeout(r, 2_500));
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
