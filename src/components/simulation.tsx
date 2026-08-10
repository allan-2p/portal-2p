import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminGetUserAccess, type UserAccess } from "@/lib/access.functions";
import { Eye, X } from "lucide-react";

const KEY = "portal2p-simulate";

type SimTarget = { id: string; name: string };

type Ctx = {
  target: SimTarget | null;
  access: UserAccess | null;
  loading: boolean;
  start: (t: SimTarget) => void;
  stop: () => void;
};

const SimulationContext = createContext<Ctx | null>(null);

function read(): SimTarget | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v?.id ? { id: String(v.id), name: String(v.name ?? v.id) } : null;
  } catch {
    return null;
  }
}

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<SimTarget | null>(null);
  const queryClient = useQueryClient();
  const fetchAccess = useServerFn(adminGetUserAccess);

  // Só lê no cliente pra não quebrar hidratação.
  useEffect(() => {
    setTarget(read());
  }, []);

  const q = useQuery({
    queryKey: ["simulate-access", target?.id],
    queryFn: () => fetchAccess({ data: { user_id: target!.id } }),
    enabled: !!target,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const start = useCallback(
    (t: SimTarget) => {
      if (typeof window !== "undefined") window.sessionStorage.setItem(KEY, JSON.stringify(t));
      setTarget(t);
      queryClient.invalidateQueries({ queryKey: ["simulate-access"] });
    },
    [queryClient],
  );

  const stop = useCallback(() => {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(KEY);
    setTarget(null);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ target, access: target ? (q.data ?? null) : null, loading: !!target && q.isLoading, start, stop }),
    [target, q.data, q.isLoading, start, stop],
  );

  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
}

export function useSimulation(): Ctx {
  return (
    useContext(SimulationContext) ?? {
      target: null,
      access: null,
      loading: false,
      start: () => {},
      stop: () => {},
    }
  );
}

export function SimulationBanner() {
  const { target, access, loading, stop } = useSimulation();
  if (!target) return null;
  return (
    <div className="sticky top-0 z-[60] flex items-center justify-center gap-3 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm text-amber-200 backdrop-blur">
      <Eye className="h-4 w-4 shrink-0" />
      <span className="truncate">
        Modo simulador — vendo o portal como <strong>{target.name}</strong>
        {loading ? " (carregando permissões…)" : access?.is_admin ? " (administrador)" : ""}
      </span>
      <button
        onClick={stop}
        className="ml-2 inline-flex items-center gap-1 rounded-md border border-amber-400/50 px-2 py-0.5 text-xs hover:bg-amber-500/20"
      >
        <X className="h-3 w-3" /> Sair
      </button>
    </div>
  );
}
