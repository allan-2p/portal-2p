import { useState } from "react";
import { Check, ChevronDown, LayoutGrid } from "lucide-react";
import { useInstance } from "./instance-provider";
import { INSTANCES, type InstanceId } from "@/lib/instances";
import { cn } from "@/lib/utils";

export function InstanceSwitcher() {
  const { instance, setInstance, allowed } = useInstance();
  const [open, setOpen] = useState(false);
  const meta = INSTANCES[instance];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 h-9 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm"
      >
        <span
          className="h-3 w-3 rounded-sm shrink-0"
          style={{ background: meta.swatch }}
          aria-hidden
        />
        <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{meta.label}</span>
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
              const isActive = i.id === instance;
              return (
                <button
                  key={i.id}
                  disabled={!isAllowed}
                  onClick={() => {
                    setInstance(i.id);
                    setOpen(false);
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
          </div>
        </>
      )}
    </div>
  );
}
