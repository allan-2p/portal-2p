import { useState } from "react";
import { Check, ChevronDown, LayoutGrid, Shield } from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useInstance } from "./instance-provider";
import { INSTANCES, type InstanceId } from "@/lib/instances";
import { isGroupAdminPath } from "@/lib/admin-area";
import { getAdminAreas } from "@/lib/admin-guard.functions";
import { cn } from "@/lib/utils";

const INSTANCE_HOME: Record<InstanceId, string> = {
  solar: "/",
  carregadores: "/carregadores",
  marketing: "/marketing",
  financeiro: "/financeiro",
};

/** Área do Grupo 2P — não é uma instância, é o ambiente neutro (preto). */
const ADMIN_AREA = {
  label: "Administração",
  short: "2P",
  description: "Grupo 2P — sem instância específica.",
  swatch: "oklch(0.2 0 0)",
  home: "/admin",
};

export function InstanceSwitcher() {
  const { instance, setInstance, allowed } = useInstance();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const meta = INSTANCES[instance];

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const adminActive = isGroupAdminPath(pathname);

  const fetchAreas = useServerFn(getAdminAreas);
  const areasQ = useQuery({
    queryKey: ["admin-areas"],
    queryFn: () => fetchAreas(),
    staleTime: 60_000,
  });
  const adminAllowed = Object.values(areasQ.data ?? {}).some(Boolean);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 h-9 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm"
      >
        <span
          className="h-3 w-3 rounded-sm shrink-0"
          style={{ background: adminActive ? ADMIN_AREA.swatch : meta.swatch }}
          aria-hidden
        />
        {adminActive ? (
          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="font-medium">{adminActive ? ADMIN_AREA.label : meta.label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-64 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
            <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
              Instância
            </div>
            {(Object.values(INSTANCES) as (typeof INSTANCES)[InstanceId][]).map((i) => {
              const isAllowed = allowed.includes(i.id);
              const isActive = !adminActive && i.id === instance;
              return (
                <button
                  key={i.id}
                  disabled={!isAllowed}
                  onClick={() => {
                    setInstance(i.id);
                    setOpen(false);
                    if (i.id !== instance || adminActive) {
                      navigate({ to: INSTANCE_HOME[i.id] });
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors",
                    isAllowed ? "hover:bg-surface-2" : "opacity-40 cursor-not-allowed",
                    isActive && "bg-surface-2",
                  )}
                >
                  <span
                    className="h-6 w-6 rounded-md shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ background: i.swatch }}
                  >
                    {i.short}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{i.label}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {isAllowed ? i.description : "Sem acesso"}
                    </div>
                  </div>
                  {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              );
            })}

            <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-y border-border">
              Grupo 2P
            </div>
            <button
              disabled={!adminAllowed}
              onClick={() => {
                setOpen(false);
                navigate({ to: ADMIN_AREA.home });
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors",
                adminAllowed ? "hover:bg-surface-2" : "opacity-40 cursor-not-allowed",
                adminActive && "bg-surface-2",
              )}
            >
              <span
                className="h-6 w-6 rounded-md shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                style={{ background: ADMIN_AREA.swatch }}
              >
                {ADMIN_AREA.short}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{ADMIN_AREA.label}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {adminAllowed ? ADMIN_AREA.description : "Sem acesso"}
                </div>
              </div>
              {adminActive && <Check className="h-4 w-4 text-primary shrink-0" />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
