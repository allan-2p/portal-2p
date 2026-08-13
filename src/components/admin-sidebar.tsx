import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, ChevronDown } from "lucide-react";
import { sectionForPath } from "@/lib/admin-nav";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useInstance } from "./instance-provider";
import { IntegrationStatusDot, useIntegrationHealthMap, type IntegrationHealthItem } from "./integration-status";
import { useIntegrationAlerts, type IntegrationAlert } from "./integration-alerts";

function slugFromTo(to: string): string | null {
  const i = to.indexOf("#");
  return i === -1 ? null : to.slice(i + 1);
}

/**
 * Menu lateral do ambiente de Administração. Mostra apenas os itens da seção
 * atual (Configurações, Integrações ou Moderação) — a troca de seção acontece
 * pela engrenagem no topo.
 */
export function AdminSidebar({ pathname, collapsed }: { pathname: string; collapsed: boolean }) {
  const navigate = useNavigate();
  const { hasFeature, defaultRoute } = useInstance();
  const current = sectionForPath(pathname);
  const health = useIntegrationHealthMap(current?.id === "integracoes");
  const { bySlug: alertsBySlug } = useIntegrationAlerts(current?.id === "integracoes");

  return (
    <nav className="px-2 py-2 flex-1 overflow-y-auto">
      <button
        onClick={() => navigate({ to: defaultRoute })}
        title="Voltar ao portal"
        className={cn(
          "w-full flex items-center gap-3 rounded-lg text-sm mb-3 text-muted-foreground hover:bg-surface-2 hover:text-foreground",
          collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
        )}
      >
        <ArrowLeft className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="truncate">Voltar ao portal</span>}
      </button>

      {current && (
        <>
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg mb-2 bg-foreground text-background font-semibold text-sm",
              collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
            )}
            title={collapsed ? current.label : undefined}
          >
            <current.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{current.label}</span>}
          </div>

          {current.groups.map((g, gi) => {
            const items = g.items.filter((i) => !i.feature || hasFeature(i.feature));
            if (!items.length) return null;
            const hasActiveItem = items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));

            return (
              <div key={gi} className={cn("mb-4", g.collapsible && !collapsed && "mb-2")}>
                {g.collapsible && !collapsed ? (
                  <Collapsible defaultOpen={hasActiveItem}>
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="group w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-2 transition-colors"
                      >
                        <span className="truncate">{g.label}</span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <AdminGroupItems items={items} pathname={pathname} collapsed={collapsed} health={health} alerts={alertsBySlug} />
                    </CollapsibleContent>
                  </Collapsible>
                ) : (
                  <>
                    {!collapsed && g.label && (
                      <div className="px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {g.label}
                      </div>
                    )}
                    {collapsed && gi > 0 && <div className="h-px bg-border mx-1 mb-2" />}
                    <AdminGroupItems items={items} pathname={pathname} collapsed={collapsed} health={health} alerts={alertsBySlug} />
                  </>
                )}
              </div>
            );
          })}
        </>
      )}
    </nav>
  );
}

function AdminGroupItems({
  items,
  pathname,
  collapsed,
  health,
  alerts,
}: {
  items: { to: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  pathname: string;
  collapsed: boolean;
  health?: { map: Map<string, IntegrationHealthItem>; isLoading: boolean };
  alerts?: Map<string, IntegrationAlert>;
}) {
  return (
    <div className="space-y-0.5">
      {items.map((i) => {
        const Icon = i.icon;
        const active = pathname === i.to || pathname.startsWith(`${i.to}/`);
        return (
          <Link
            key={i.to}
            to={i.to}
            preload="intent"
            title={collapsed ? i.label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg text-sm transition-colors",
              collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
              active
                ? "bg-primary/15 text-primary font-medium"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate flex-1">{i.label}</span>}
            {(() => {
              const slug = slugFromTo(i.to);
              if (!health || !slug) return null;
              const alert = alerts?.get(slug);
              if (alert && alert.level !== "off") {
                return (
                  <AlertTriangle
                    title={alert.message}
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      alert.level === "error" ? "text-destructive" : "text-amber-500",
                    )}
                  />
                );
              }
              return <IntegrationStatusDot item={health.map.get(slug)} loading={health.isLoading} />;
            })()}
          </Link>
        );
      })}
    </div>
  );
}
