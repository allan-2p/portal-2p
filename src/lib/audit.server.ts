import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";

/**
 * Registro de auditoria (server-only).
 *
 * Grava eventos sensíveis — autenticação e uso das integrações do Atlas
 * (Salesforce, Notion, Metricool) — na tabela `public.user_activity_log`
 * usando a service role, para que o log nunca dependa das políticas de RLS
 * do usuário nem falhe silenciosamente por permissão.
 *
 * Nunca lança: auditoria não pode derrubar a ação principal.
 */

export type AuditEvent =
  | "login"
  | "logout"
  | "login_failed"
  | "page_view"
  | "integration"
  | "sensitive_action";

function reqMeta() {
  let ip: string | null = null;
  let ua: string | null = null;
  try {
    ip = getRequestIP({ xForwardedFor: true }) ?? null;
  } catch {
    ip = null;
  }
  try {
    ua = getRequestHeader("user-agent") ?? null;
  } catch {
    ua = null;
  }
  return { ip, ua: ua ? ua.slice(0, 300) : null };
}

export async function recordAudit(input: {
  userId?: string | null;
  email?: string | null;
  event: AuditEvent;
  detail?: string | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let email = input.email ?? null;
    if (!email && input.userId) {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", input.userId)
        .maybeSingle();
      email = data?.email ?? null;
    }
    const { ip, ua } = reqMeta();
    await supabaseAdmin.from("user_activity_log").insert({
      user_id: input.userId ?? null,
      email,
      event: input.event,
      detail: input.detail ? input.detail.slice(0, 200) : null,
      ip,
      user_agent: ua,
    });
  } catch (err) {
    console.error("[audit] falha ao registrar evento", err);
  }
}

/** Atalho para uso das integrações do Atlas. */
export async function auditIntegration(
  userId: string | null | undefined,
  integration: "salesforce" | "notion" | "metricool" | "sap" | "mcp",
  action: string,
  meta?: string | null,
): Promise<void> {
  await recordAudit({
    userId: userId ?? null,
    event: "integration",
    detail: `${integration} • ${action}${meta ? ` • ${meta}` : ""}`,
  });
}
