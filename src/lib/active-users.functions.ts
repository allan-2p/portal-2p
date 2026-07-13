import { createServerFn } from "@tanstack/react-start";

// Public (no-auth) endpoint used on the sign-in splash. To avoid leaking
// the employee roster (names + photos) to unauthenticated visitors, this
// intentionally returns ONLY an aggregate count of users active today.
// Named avatars require an authenticated session.
export type ActiveUser = { id: string; name: string; avatarUrl: string | null };

export const getActiveUsersToday = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ records: ActiveUser[]; total: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let total = 0;
    let page = 1;
    const perPage = 200;
    // Safety cap: max 5 pages (1000 users)
    for (let i = 0; i < 5; i++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) break;
      const users = data?.users ?? [];
      for (const u of users) {
        const raw = (u as { last_sign_in_at?: string | null }).last_sign_in_at;
        if (!raw) continue;
        if (new Date(raw) >= startOfDay) total += 1;
      }
      if (users.length < perPage) break;
      page++;
    }

    // Never return names/avatars from the unauthenticated endpoint.
    return { records: [], total };
  },
);
