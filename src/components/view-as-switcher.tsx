import { useState } from "react";
import { Eye, Check, RotateCcw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSetMyViewPreference } from "@/hooks/use-view-variant";
import { getMyViewPreferences } from "@/lib/views.functions";
import { PERSONAS, SCREENS } from "@/lib/view-screens";
import { cn } from "@/lib/utils";

/**
 * Toggle "Ver como…" no header. Muda a variante da tela ATUAL para uma
 * persona escolhida (persistido em user_view_preferences). Admin pode assumir
 * qualquer persona; demais só personas coerentes com seu Papel real.
 *
 * O switcher é sempre visível, mas escondido quando a rota atual não tem
 * variantes cadastradas.
 */
export function ViewAsSwitcher({ currentScreen }: { currentScreen: string | null }) {
  const [open, setOpen] = useState(false);
  const { roles, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const fetchPrefs = useServerFn(getMyViewPreferences);
  const qc = useQueryClient();
  const prefsQ = useQuery({
    queryKey: ["view-prefs"],
    queryFn: () => fetchPrefs(),
    staleTime: 60_000,
  });
  const setPref = useSetMyViewPreference();

  const screenMeta = SCREENS.find((s) => s.key === currentScreen);
  if (!screenMeta) return null;

  const active = prefsQ.data?.[screenMeta.key] ?? null;
  const allowed = PERSONAS.filter(
    (p) => isAdmin || p.key === "default" || (p.role && roles.includes(p.role)),
  );

  const activeLabel = active ? PERSONAS.find((p) => p.key === active)?.label ?? active : null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={`Ver ${screenMeta.label} como…`}
        className={cn(
          "h-9 px-2.5 rounded-lg border flex items-center gap-1.5 text-xs transition-colors",
          active
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border bg-surface hover:bg-surface-2 text-muted-foreground",
        )}
      >
        <Eye className="h-3.5 w-3.5" />
        <span className="max-w-[10ch] truncate">{activeLabel ?? "Ver como"}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-72 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Ver como
              </div>
              <div className="text-sm font-medium truncate">{screenMeta.label}</div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              <button
                onClick={() => {
                  setPref.mutate(
                    { screen: screenMeta.key, variant_key: null },
                    {
                      onSuccess: () => {
                        qc.invalidateQueries({ queryKey: ["view-prefs"] });
                        setOpen(false);
                      },
                    },
                  );
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2 border-b border-border",
                  !active && "text-primary font-medium",
                )}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="flex-1 text-left">Automático (por Papel)</span>
                {!active && <Check className="h-3.5 w-3.5" />}
              </button>
              {allowed.map((p) => (
                <button
                  key={p.key}
                  onClick={() => {
                    setPref.mutate(
                      { screen: screenMeta.key, variant_key: p.key },
                      {
                        onSuccess: () => {
                          qc.invalidateQueries({ queryKey: ["view-prefs"] });
                          setOpen(false);
                        },
                      },
                    );
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2",
                    active === p.key && "text-primary font-medium",
                  )}
                >
                  <span className="flex-1 text-left">
                    <div>{p.label}</div>
                    {p.description && (
                      <div className="text-[11px] text-muted-foreground">{p.description}</div>
                    )}
                  </span>
                  {active === p.key && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
            <div className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">
              A escolha persiste até você voltar para Automático.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
