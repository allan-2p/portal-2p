import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { sectionForPath } from "@/lib/admin-nav";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useInstance } from "./instance-provider";

/**
 * Menu lateral do ambiente de Administração. Mostra apenas os itens da seção
 * atual (Configurações, Integrações ou Moderação) — a troca de seção acontece
 * pela engrenagem no topo.
 */
export function AdminSidebar({ pathname, collapsed }: { pathname: string; collapsed: boolean }) {
  const navigate = useNavigate();
  const { hasFeature, defaultRoute } = useInstance();
  const current = sectionForPath(pathname);

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
                      <AdminGroupItems items={items} pathname={pathname} collapsed={collapsed} />
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
                    <AdminGroupItems items={items} pathname={pathname} collapsed={collapsed} />
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
}: {
  items: { to: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  pathname: string;
  collapsed: boolean;
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
            {!collapsed && <span className="truncate">{i.label}</span>}
          </Link>
        );
      })}
    </div>
  );
}
