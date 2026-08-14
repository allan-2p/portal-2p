import { useEffect, useCallback, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "gerente" | "vendedor" | "diretor" | "marketing";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  cargo: string | null;
  cargo_tipo: string | null;
  equipe: string | null;
  avatar_url: string | null;
  meta_mensal: number | null;
  ativo: boolean;
  sf_user_id: string | null;
  filter_scope: "geral" | "pre_vendas" | "carteira" | "individual" | null;
  /** Regime de contratação — define se a comissão é paga como custo cheio (PJ) ou líquido (CLT). */
  regime_contratacao?: "CLT" | "PJ" | string | null;

}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
}

const PRIORITY: Record<AppRole, number> = { admin: 0, diretor: 1, gerente: 2, marketing: 3, vendedor: 4 };

let state: AuthState = { user: null, profile: null, roles: [], loading: true };
const listeners = new Set<() => void>();
let initialized = false;

function setState(next: Partial<AuthState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

async function loadFor(u: User | null) {
  if (!u) {
    setState({ profile: null, roles: [] });
    return;
  }
  const [{ data: prof }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", u.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", u.id),
  ]);
  const sorted = (roleRows ?? [])
    .map((r: { role: AppRole }) => r.role)
    .sort((a, b) => PRIORITY[a] - PRIORITY[b]);
  setState({ profile: prof as Profile | null, roles: sorted });
}

function initialize() {
  if (initialized) return;
  initialized = true;
  // getSession() reads the stored session synchronously from localStorage, avoiding
  // a round-trip on first paint. onAuthStateChange still fires immediately after
  // subscribing, so token validation happens without blocking the initial render.
  supabase.auth.getSession().then(async ({ data }) => {
    const u = data.session?.user ?? null;
    setState({ user: u });
    await loadFor(u);
    setState({ loading: false });
  });
  let inflight: Promise<void> | null = null;
  supabase.auth.onAuthStateChange((event, session) => {
    if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
    const u = session?.user ?? null;
    // Skip redundant reloads: TOKEN_REFRESH-style SIGNED_IN events on the same user
    // don't need a profile+roles refetch.
    if (event === "SIGNED_IN" && state.user?.id === u?.id && state.profile) return;
    setState({ user: u, loading: true });
    const run = loadFor(u).finally(() => {
      if (inflight === run) setState({ loading: false });
    });
    inflight = run;
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const getSnapshot = () => state;

export async function refreshAuthProfile() {
  if (state.user) await loadFor(state.user);
}

export function useAuth() {
  useEffect(() => {
    initialize();
  }, []);
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const hasRole = useCallback((r: AppRole) => snap.roles.includes(r), [snap.roles]);
  const hasAnyRole = useCallback(
    (rs: AppRole[]) => rs.some((r) => snap.roles.includes(r)),
    [snap.roles],
  );

  return { ...snap, hasRole, hasAnyRole, refresh: refreshAuthProfile };
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  vendedor: "Vendedor",
  diretor: "Diretor",
  marketing: "Marketing",
};
