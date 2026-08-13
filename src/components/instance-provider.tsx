import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyAccess } from "@/lib/access.functions";
import { useAuth } from "@/hooks/use-auth";
import { useSimulation } from "@/components/simulation";
import {
  INSTANCES,
  type InstanceId,
  type FeatureKey,
  defaultInstanceForList,
  ROUTE_FEATURE,
} from "@/lib/instances";

const STORAGE_KEY = "portal2p-instance";
const MKT_UNIT_KEY = "portal2p-marketing-unit";

// Home de cada instância — página inicial padrão de qualquer usuário.
const HOME_FEATURE: Record<InstanceId, FeatureKey> = {
  solar: "home",
  carregadores: "cpo.home",
  marketing: "marketing.home",
};
const HOME_ROUTE: Record<InstanceId, string> = {
  solar: "/",
  carregadores: "/carregadores",
  marketing: "/marketing",
};

export type MarketingUnit = "solar" | "carregadores" | "station";

function readMarketingUnit(): MarketingUnit {
  if (typeof window === "undefined") return "solar";
  const v = window.localStorage.getItem(MKT_UNIT_KEY);
  if (v === "carregadores" || v === "station" || v === "solar") return v;
  return "solar";
}


type Ctx = {
  instance: InstanceId;
  setInstance: (id: InstanceId) => void;
  allowed: InstanceId[];
  hasFeature: (key: FeatureKey) => boolean;
  isRouteAllowed: (path: string) => boolean;
  defaultRoute: string;
  loading: boolean;
};

const InstanceContext = createContext<Ctx | null>(null);

function readSavedInstance(): InstanceId | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "solar" || v === "carregadores" || v === "marketing") return v;
  return null;
}

export function InstanceProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const fetchAccess = useServerFn(getMyAccess);
  const q = useQuery({
    queryKey: ["my-access", user?.id],
    queryFn: () => fetchAccess(),
    enabled: !!user && !authLoading,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Modo simulador: quando um admin está simulando outro usuário,
  // todo o portal passa a enxergar as permissões desse usuário.
  const sim = useSimulation();
  const effective = sim.target ? sim.access : q.data;

  const allowed: InstanceId[] = useMemo(() => {
    const list = (effective?.instances ?? []) as string[];
    const filt = list.filter((v): v is InstanceId => v === "solar" || v === "carregadores" || v === "marketing");
    return filt.length ? filt : ["solar"];
  }, [effective]);

  const granted = effective?.granted ?? [];
  const isAdmin = effective?.is_admin ?? false;
  const grantedSet = useMemo(
    () => new Set(granted.map((d: { instance_id: string; feature_key: string }) => `${d.instance_id}::${d.feature_key}`)),
    [granted],
  );

  const [instance, setInstanceState] = useState<InstanceId>(() => readSavedInstance() ?? "solar");

  // Se a instância salva não está mais liberada, cai no default.
  // Só roda depois que o access carregou — senão o allowed inicial ["solar"]
  // sobrescreve a instância salva (ex.: marketing) toda vez que a página monta.
  useEffect(() => {
    if (authLoading) return;
    if (user && (q.isLoading || !q.data)) return;
    if (!allowed.includes(instance)) {
      setInstanceState(defaultInstanceForList(allowed));
    }
  }, [allowed, instance, authLoading, user, q.isLoading, q.data]);

  // Aplica atributo no <html> pra CSS reagir.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-instance", instance);
  }, [instance]);

  const setInstance = useCallback((id: InstanceId) => {
    setInstanceState(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const hasFeature = useCallback(
    (key: FeatureKey) => {
      // Administração é do Grupo 2P: admin enxerga todas as telas de configuração
      // em qualquer instância — a separação acontece dentro de cada tela.
      if (isAdmin && key.startsWith("admin.")) return true;
      const meta = INSTANCES[instance];
      if (!meta.routes.includes(key)) return false;
      if (isAdmin) return true;
      // A home da instância é sempre acessível — é a página inicial de todo usuário.
      if (HOME_FEATURE[instance] === key) return true;
      // Default deny: só libera com permissão explícita.
      return grantedSet.has(`${instance}::${key}`);
    },
    [instance, grantedSet, isAdmin],
  );

  const isRouteAllowed = useCallback(
    (path: string) => {
      // resolve rota atual → feature key
      // tenta match exato, depois prefixo mais longo
      const keys = Object.keys(ROUTE_FEATURE).sort((a, b) => b.length - a.length);
      const match = keys.find((k) => path === k || path.startsWith(k + "/"));
      if (!match) return true;
      return hasFeature(ROUTE_FEATURE[match]);
    },
    [hasFeature],
  );

  // Página inicial: sempre a home da instância ativa.
  const defaultRoute = useMemo(() => HOME_ROUTE[instance] ?? "/", [instance]);

  const value: Ctx = {
    instance,
    setInstance,
    allowed,
    hasFeature,
    isRouteAllowed,
    defaultRoute,
    loading: authLoading || (!!user && q.isLoading) || sim.loading,
  };
  return <InstanceContext.Provider value={value}>{children}</InstanceContext.Provider>;
}

export function useInstance(): Ctx {
  const ctx = useContext(InstanceContext);
  if (!ctx) {
    // fallback seguro fora do provider (ex: rotas públicas)
    return {
      instance: "solar",
      setInstance: () => {},
      allowed: ["solar"],
      hasFeature: () => true,
      isRouteAllowed: () => true,
      defaultRoute: "/",
      loading: false,
    };
  }
  return ctx;
}

// --- Marketing sub-unit (Solar vs Carregadores) ---
export function useMarketingUnit() {
  const [marketingUnit, setUnit] = useState<MarketingUnit>(() => readMarketingUnit());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === MKT_UNIT_KEY) setUnit(readMarketingUnit());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const setMarketingUnit = useCallback((u: MarketingUnit) => {
    setUnit(u);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MKT_UNIT_KEY, u);
      // dispara no próprio tab para sincronizar componentes montados
      window.dispatchEvent(new StorageEvent("storage", { key: MKT_UNIT_KEY }));
    }
  }, []);
  return { marketingUnit, setMarketingUnit };
}
