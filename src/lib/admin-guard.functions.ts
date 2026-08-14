import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { FeatureKey } from "@/lib/instances";
import type { CapabilityId } from "@/lib/feature-capabilities";

export type AdminAreas = {
  configuracoes: boolean;
  moderacao: boolean;
  integracoes: boolean;
  isAdmin: boolean;
};

/** Áreas administrativas liberadas — usado pela engrenagem e pelos guards de rota. */
export const getAdminAreas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminAreas> => {
    const { adminAreasFor } = await import("@/lib/guards.server");
    return adminAreasFor({ supabase: context.supabase, userId: context.userId });
  });

/**
 * Valida no backend se o usuário pode abrir uma tela administrativa.
 * Chamada por cada rota de Configurações / Moderação / Integrações, de forma
 * que o acesso direto pela URL também seja bloqueado.
 */
export const checkAdminFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { feature: FeatureKey; action?: CapabilityId }) => input)
  .handler(async ({ data, context }): Promise<{ allowed: boolean }> => {
    const { canAdminFeature } = await import("@/lib/guards.server");
    const allowed = await canAdminFeature(
      { supabase: context.supabase, userId: context.userId },
      data.feature,
      data.action ?? "visualizar",
    );
    return { allowed };
  });

/** Igual ao anterior, mas lança erro (para uso em mutações). */
export const assertAdminFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { feature: FeatureKey; action?: CapabilityId }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(
      { supabase: context.supabase, userId: context.userId },
      data.feature,
      data.action ?? "visualizar",
    );
    return { ok: true };
  });
