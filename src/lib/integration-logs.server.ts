/**
 * Histórico de sincronizações e erros por integração.
 *
 * Grava eventos em public.integration_logs (leitura restrita a administradores).
 * Nunca registre credenciais ou tokens no campo detail.
 */

export type IntegrationLogLevel = "info" | "warn" | "error";

export async function logIntegrationEvent(entry: {
  slug: string;
  level: IntegrationLogLevel;
  event: string;
  message?: string | null;
  detail?: Record<string, unknown>;
  durationMs?: number | null;
  actorId?: string | null;
  actorEmail?: string | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("integration_logs").insert({
      slug: entry.slug,
      level: entry.level,
      event: entry.event,
      message: entry.message ?? null,
      detail: (entry.detail ?? {}) as never,
      duration_ms: entry.durationMs ?? null,
      actor_id: entry.actorId ?? null,
      actor_email: entry.actorEmail ?? null,
    });
  } catch {
    // O histórico nunca deve derrubar a operação principal.
  }
}
