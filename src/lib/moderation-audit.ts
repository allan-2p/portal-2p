import { supabase } from "@/integrations/supabase/client";

/** Áreas moderadas — usadas para filtrar o log de auditoria. */
export const MODERATION_AREAS = [
  { key: "produtos", label: "Produtos (Grupo 2P)", instance: "grupo" },
  { key: "metas", label: "Regras de Metas (Solar)", instance: "solar" },
  { key: "tabelas", label: "Tabelas (Solar)", instance: "solar" },
  { key: "solar_regras", label: "Regras de Propostas (Solar)", instance: "solar" },
  { key: "solar_comissoes", label: "Regras de Comissões (Solar)", instance: "solar" },
  { key: "cpo_metas", label: "Regras de Metas (Carregadores)", instance: "carregadores" },
  { key: "cpo_produtos", label: "Produtos e Alíquotas (Carregadores)", instance: "carregadores" },
  { key: "cpo_comissoes", label: "Comissões (Carregadores)", instance: "carregadores" },
  { key: "cpo_regras", label: "Regras (Carregadores)", instance: "carregadores" },
  { key: "marketing", label: "Marketing", instance: "marketing" },
  { key: "integracoes", label: "Integrações", instance: "grupo" },
] as const;

export type ModerationArea = (typeof MODERATION_AREAS)[number]["key"];

export function moderationAreaLabel(area: string): string {
  return MODERATION_AREAS.find((a) => a.key === area)?.label ?? area;
}

/**
 * Registra uma alteração de moderação feita direto do navegador
 * (telas que gravam via cliente Supabase). Best-effort: nunca lança.
 */
export async function logModeration(entry: {
  area: ModerationArea;
  instanceId?: string;
  action: string;
  target?: string | null;
  summary: string;
  details?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    await supabase.from("moderation_audit_log").insert({
      area: entry.area,
      instance_id:
        entry.instanceId ?? MODERATION_AREAS.find((a) => a.key === entry.area)?.instance ?? "grupo",
      action: entry.action,
      target: entry.target ?? null,
      summary: entry.summary,
      details: entry.details ?? {},
      actor_id: user.id,
      actor_email: user.email ?? null,
      actor_name: profile?.full_name ?? null,
    });
  } catch {
    /* auditoria é best-effort */
  }
}
