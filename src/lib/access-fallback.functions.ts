import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AccessSuggestion = { path: string; label: string };

/** Telas que o usuário pode abrir — sugeridas quando ele é bloqueado. */
export const getAccessSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccessSuggestion[]> => {
    const { accessibleRoutesFor } = await import("@/lib/guards.server");
    return accessibleRoutesFor({ supabase: context.supabase, userId: context.userId });
  });
