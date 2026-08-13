import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ADMIN_SECTIONS, sectionForPath, type AdminSectionId } from "@/lib/admin-nav";
import { cn } from "@/lib/utils";
import { useInstance } from "./instance-provider";

/**
 * Menu lateral do ambiente de Administração (Configurações, Painel de Controle,
 * Moderação). Substitui o menu padrão do portal enquanto o usuário está nessas telas.
 */
export function AdminSidebar({ pathname, collapsed }: { pathname: string; collapsed: boolean }) {
  const navigate = useNavigate();
  const { hasFeature, defaultRoute } = useInstance();
  const current = sectionForPath(pathname);
  const currentId: AdminSectionId | null = current?.id ?? null;

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

      {/* Seletor de seção */}
      <div className={cn("space-y-1 mb-3", collapsed && "space-y-1.5")}>
        {ADMIN_SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = currentId === s.id;
          return (
            <Link
              key={s.id}
              to={s.home}
              preload="intent"
              title={collapsed ? s.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg text-sm transition-all",
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                active
                  ? "bg-foreground text-background font-semibold"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{s.label}</span>}
            </Link>
          );
        })}
      </div>

      {current && (
        <>
          <div className={cn("h-px bg-border my-2", collapsed && "mx-1")} />
          {current.groups.map((g, gi) => {
            const items = g.items.filter((i) => !i.feature || hasFeature(i.feature));
            if (!items.length) return null;
            return (
              <div key={gi} className="mb-3">
                {!collapsed && g.label && (
                  <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {g.label}
                  </div>
                )}
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
              </div>
            );
          })}
        </>
      )}
    </nav>
  );
}
