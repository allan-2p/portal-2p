import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getIntegrationsHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { collectIntegrationsHealth } = await import("./integrations-health.server");
    return { items: await collectIntegrationsHealth(), checkedAt: new Date().toISOString() };
  });
