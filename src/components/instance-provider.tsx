import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyAccess } from "@/lib/access.functions";
import {
  INSTANCES,
  type InstanceId,
  type FeatureKey,
  defaultInstanceForList,
  ROUTE_FEATURE,
} from "@/lib/instances";

const STORAGE_KEY = "portal2p-instance";
const MKT_UNIT_KEY = "portal2p-marketing-unit";

export type MarketingUnit = "solar" | "carregadores";

function readMarketingUnit(): MarketingUnit {
  if (typeof window === "undefined") return "solar";
  const v = window.localStorage.getItem(MKT_UNIT_KEY);
  return v === "carregadores" ? "carregadores" : "solar";
}

type Ctx = {
  instance: InstanceId;
  setInstance: (id: InstanceId) => void;
  allowed: InstanceId[];
  hasFeature: (key: FeatureKey) => boolean;
  isRouteAllowed: (path: string) => boolean;
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
  const fetchAccess = useServerFn(getMyAccess);
  const q = useQuery({
    queryKey: ["my-access"],
    queryFn: () => fetchAccess(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const allowed: InstanceId[] = useMemo(() => {
    const list = (q.data?.instances ?? []) as string[];
    const filt = list.filter((v): v is InstanceId => v === "solar" || v === "carregadores" || v === "marketing");
    return filt.length ? filt : ["solar"];
  }, [q.data]);

  const [instance, setInstanceState] = useState<InstanceId>(() => readSavedInstance() ?? "solar");

  // Se a instância salva não está mais liberada, cai no default.
  useEffect(() => {
    if (!allowed.includes(instance)) {
      setInstanceState(defaultInstanceForList(allowed));
    }
  }, [allowed, instance]);

  // Aplica atributo no <html> pra CSS reagir.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-instance", instance);
  }, [instance]);

  const setInstance = useCallback((id: InstanceId) => {
    setInstanceState(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const denied = q.data?.denied ?? [];
  const deniedSet = useMemo(
    () => new Set(denied.map((d) => `${d.instance_id}::${d.feature_key}`)),
    [denied],
  );

  const hasFeature = useCallback(
    (key: FeatureKey) => {
      const meta = INSTANCES[instance];
      if (!meta.routes.includes(key)) return false;
      if (deniedSet.has(`${instance}::${key}`)) return false;
      return true;
    },
    [instance, deniedSet],
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

  const value: Ctx = {
    instance,
    setInstance,
    allowed,
    hasFeature,
    isRouteAllowed,
    loading: q.isLoading,
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
