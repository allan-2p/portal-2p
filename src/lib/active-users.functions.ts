import { createServerFn } from "@tanstack/react-start";

export type ActiveUser = { id: string; name: string; avatarUrl: string | null };

export const getActiveUsersToday = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ records: ActiveUser[]; total: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Page through auth users to find those with last_sign_in_at today.
    const active: { id: string; last: Date }[] = [];
    let page = 1;
    const perPage = 200;
    // Safety cap: max 5 pages (1000 users)
    for (let i = 0; i < 5; i++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) break;
      const users = data?.users ?? [];
      for (const u of users) {
        const raw = (u as any).last_sign_in_at as string | null | undefined;
        if (!raw) continue;
        const d = new Date(raw);
        if (d >= startOfDay) active.push({ id: u.id, last: d });
      }
      if (users.length < perPage) break;
      page++;
    }

    if (active.length === 0) return { records: [], total: 0 };

    active.sort((a, b) => b.last.getTime() - a.last.getTime());
    const ids = active.map((a) => a.id);

    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .in("id", ids);

    const byId = new Map((profs ?? []).map((p) => [p.id, p]));

    const records: ActiveUser[] = await Promise.all(
      active.map(async ({ id }) => {
        const p = byId.get(id);
        const name = p?.full_name?.trim() || p?.email?.split("@")[0] || "Usuário";
        let avatarUrl: string | null = null;
        const path = p?.avatar_url ?? null;
        if (path) {
          if (path.startsWith("http")) {
            avatarUrl = path;
          } else {
            const { data } = await supabaseAdmin.storage
              .from("avatars")
              .createSignedUrl(path, 60 * 60, {
                transform: { width: 128, height: 128, resize: "cover", quality: 80 },
              });
            avatarUrl = data?.signedUrl ?? null;
          }
        }
        return { id, name, avatarUrl };
      }),
    );

    return { records, total: records.length };
  },
);
