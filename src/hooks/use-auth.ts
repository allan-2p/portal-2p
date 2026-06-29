import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "gestor" | "vendedor" | "diretoria";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  cargo: string | null;
  equipe: string | null;
  avatar_url: string | null;
  meta_mensal: number | null;
  ativo: boolean;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null);
      setRoles([]);
      return;
    }
    const [{ data: prof }, { data: roleRows }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", u.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.id),
    ]);
    setProfile(prof as Profile | null);
    const priority: Record<AppRole, number> = { admin: 0, diretoria: 1, gestor: 2, vendedor: 3 };
    const sorted = (roleRows ?? [])
      .map((r: { role: AppRole }) => r.role)
      .sort((a, b) => priority[a] - priority[b]);
    setRoles(sorted);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user);
      load(data.user).finally(() => mounted && setLoading(false));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      const u = session?.user ?? null;
      setUser(u);
      load(u);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [load]);

  const hasRole = useCallback((r: AppRole) => roles.includes(r), [roles]);
  const hasAnyRole = useCallback(
    (rs: AppRole[]) => rs.some((r) => roles.includes(r)),
    [roles],
  );

  return { user, profile, roles, loading, hasRole, hasAnyRole };
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  vendedor: "Vendedor",
  diretoria: "Diretoria",
};
