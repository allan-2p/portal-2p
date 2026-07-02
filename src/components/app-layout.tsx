import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Home, KanbanSquare, Layers, Users, LogOut, ShieldCheck, User as UserIcon, Calendar, BarChart3, ChevronLeft, ChevronRight, ChevronDown, Sparkles, ClipboardList, Plug, Shield, UserCog } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import logo from "@/assets/2p-logo.jpg";
import { ThemeToggle } from "./theme-toggle";
import { NotificationsDropdown } from "./notifications-dropdown";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABELS } from "@/hooks/use-auth";
import { useAvatarUrl } from "@/hooks/use-avatar-url";
import { useNotificationsDemoFeed } from "@/hooks/use-notifications";
import { bootstrapFirstAdmin } from "@/lib/users.functions";

import { toast } from "sonner";

const COLLAPSE_KEY = "portal2p-sidebar-collapsed";
const CLIENTES_OPEN_KEY = "portal2p-clientes-open";

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLoadingRoute = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [clientesOpen, setClientesOpen] = useState(true);
  
  const { user, profile, roles, hasRole } = useAuth();
  const avatarUrl = useAvatarUrl(profile?.avatar_url);
  const bootstrap = useServerFn(bootstrapFirstAdmin);
  useNotificationsDemoFeed();

  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    const saved = localStorage.getItem(CLIENTES_OPEN_KEY);
    if (saved !== null) setClientesOpen(saved === "1");
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/clientes")) setClientesOpen(true);
  }, [pathname]);

  // Only show the top progress bar for slow nav (>200ms) to avoid flashing on instant transitions
  const [showBar, setShowBar] = useState(false);
  useEffect(() => {
    if (!isLoadingRoute) { setShowBar(false); return; }
    const t = setTimeout(() => setShowBar(true), 200);
    return () => clearTimeout(t);
  }, [isLoadingRoute]);


  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  const toggleClientes = () => {
    setClientesOpen((v) => {
      localStorage.setItem(CLIENTES_OPEN_KEY, !v ? "1" : "0");
      return !v;
    });
  };

  const initials = (profile?.full_name ?? user?.email ?? "U")
    .split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  async function handlePromote() {
    try {
      const res = await bootstrap();
      if (res.promoted) { toast.success("Você agora é administrador."); location.reload(); }
      else toast.info("Já existe um administrador.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  const atlasActive = pathname.startsWith("/atlas");
  const clientesActive = pathname.startsWith("/clientes");

  const navItems = [
    { to: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
    { to: "/tarefas", label: "Tarefas", icon: Calendar },
    { to: "/pedidos", label: "Pedidos", icon: KanbanSquare },
    { to: "/dashboards", label: "Dashboards", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      <aside
        className={cn(
          "hidden md:flex shrink-0 flex-col border-r border-border bg-surface/60 backdrop-blur transition-[width] duration-300 relative",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className={cn("flex items-center gap-3 py-6", collapsed ? "px-3 justify-center" : "px-5")}>
          <img src={logo} alt="2P" className="h-9 w-auto rounded shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-display font-bold text-base leading-none truncate">Portal 2P</div>
              <div className="text-[11px] text-muted-foreground mt-1 truncate">Inteligência de vendas</div>
            </div>
          )}
        </div>

        <nav className="px-2 py-2 flex-1 overflow-y-auto">
          {/* Atlas — destaque */}
          <Link
            to="/atlas"
            preload="intent"
            title={collapsed ? "Atlas" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl text-sm transition-all mb-2 relative overflow-hidden group",
              collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
              atlasActive
                ? "bg-gradient-to-r from-primary to-[oklch(0.65_0.2_30)] text-primary-foreground shadow-md shadow-primary/30 font-semibold"
                : "bg-gradient-to-r from-primary/10 to-[oklch(0.65_0.2_30)]/5 text-foreground hover:from-primary/20 hover:to-[oklch(0.65_0.2_30)]/10 border border-primary/20",
            )}
          >
            <Sparkles className={cn("h-4 w-4 shrink-0", !atlasActive && "text-primary")} />
            {!collapsed && (
              <>
                <span className="font-semibold">Atlas</span>
                <span className={cn(
                  "ml-auto text-[10px] px-1.5 py-0.5 rounded-md font-bold tracking-wider",
                  atlasActive ? "bg-background/20" : "bg-primary text-primary-foreground",
                )}>AI</span>
              </>
            )}
          </Link>

          <div className={cn("h-px bg-border my-2", collapsed && "mx-1")} />

          {navItems.slice(0, 1).map((item) => {
            const active = item.match ? item.match(pathname) : pathname.startsWith(item.to);
            return <NavLink key={item.to} item={item} active={active} collapsed={collapsed} />;
          })}

          {navItems.slice(1, 3).map((item) => {
            const active = pathname.startsWith(item.to);
            return <NavLink key={item.to} item={item} active={active} collapsed={collapsed} />;
          })}

          {/* Clientes — grupo expansível */}
          {collapsed ? (
            <Link
              to="/clientes/segmentacao"
              preload="intent"
              title="Clientes"
              className={cn(
                "flex items-center justify-center px-2 py-2.5 rounded-lg text-sm mb-1",
                clientesActive ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <Layers className="h-4 w-4" />
            </Link>
          ) : (
            <div className="mb-1">
              <button
                onClick={toggleClientes}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  clientesActive ? "text-primary font-medium" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <Layers className="h-4 w-4 shrink-0" />
                <span className="truncate">Clientes</span>
                <ChevronDown className={cn("h-3.5 w-3.5 ml-auto transition-transform", !clientesOpen && "-rotate-90")} />
              </button>
              {clientesOpen && (
                <div className="mt-1 ml-3 pl-3 border-l border-border space-y-0.5">
                  <SubLink to="/clientes/cadastros" label="Cadastros" icon={ClipboardList} active={pathname.startsWith("/clientes/cadastros")} />
                  <SubLink to="/clientes/segmentacao" label="Segmentação" icon={Layers} active={pathname.startsWith("/clientes/segmentacao")} />
                </div>
              )}
            </div>
          )}

          {navItems.slice(3).map((item) => {
            const active = pathname.startsWith(item.to);
            return <NavLink key={item.to} item={item} active={active} collapsed={collapsed} />;
          })}

          {hasRole("admin") && (
            <AdminGroup
              pathname={pathname}
              collapsed={collapsed}
            />
          )}
        </nav>

        <button
          onClick={toggleCollapsed}
          className="absolute -right-3 top-7 h-6 w-6 rounded-full bg-surface border border-border flex items-center justify-center shadow hover:bg-surface-2 z-10"
          aria-label="Recolher menu"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-lg">
          <div className="flex items-center gap-4 px-6 h-16">
            <div className="md:hidden flex items-center gap-2">
              <img src={logo} alt="2P" className="h-7 w-auto rounded" />
              <span className="font-display font-bold">Portal 2P</span>
            </div>
            <div className="hidden md:flex flex-1" />

            <div className="flex items-center gap-2 ml-auto">
              {user && roles.length === 0 && (
                <button
                  onClick={handlePromote}
                  className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Tornar-me admin
                </button>
              )}
              <ThemeToggle />
              <NotificationsDropdown />
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="h-9 w-9 rounded-full overflow-hidden bg-gradient-to-br from-primary to-[oklch(0.62_0.22_25)] flex items-center justify-center font-semibold text-sm text-primary-foreground ring-2 ring-background"
                >
                  {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-10 z-50 w-60 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                      <div className="px-4 py-3 border-b border-border">
                        <div className="font-medium text-sm truncate">{profile?.full_name ?? user?.email}</div>
                        <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
                        {roles.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {roles.map((r) => (
                              <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                                {ROLE_LABELS[r]}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Link to="/perfil" onClick={() => setMenuOpen(false)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface-2">
                        <UserIcon className="h-4 w-4" /> Meu perfil
                      </Link>
                      <button onClick={handleSignOut} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface-2 text-destructive border-t border-border">
                        <LogOut className="h-4 w-4" /> Sair
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>
        {showBar && <div className="route-bar" aria-hidden />}
        <div key={pathname} className="p-6 page-transition">{children}</div>

      </main>
    </div>
  );
}

function NavLink({
  item, active, collapsed,
}: {
  item: { to: string; label: string; icon: typeof Home };
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      preload="intent"
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg text-sm transition-all mb-1",
        collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
        active ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function SubLink({ to, label, icon: Icon, active }: { to: string; label: string; icon: typeof Home; active: boolean }) {
  return (
    <Link
      to={to}
      preload="intent"
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors",
        active ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

const ADMIN_OPEN_KEY = "portal2p-admin-open";

function AdminGroup({ pathname, collapsed }: { pathname: string; collapsed: boolean }) {
  const active = pathname.startsWith("/admin") || pathname.startsWith("/usuarios") || pathname.startsWith("/integracoes");
  const [open, setOpen] = useState(active);
  useEffect(() => {
    const saved = localStorage.getItem(ADMIN_OPEN_KEY);
    if (saved !== null) setOpen(saved === "1");
  }, []);
  useEffect(() => { if (active) setOpen(true); }, [active]);
  const toggle = () => setOpen((v) => { localStorage.setItem(ADMIN_OPEN_KEY, !v ? "1" : "0"); return !v; });

  if (collapsed) {
    return (
      <Link
        to="/integracoes"
        preload="intent"
        title="Administrador"
        className={cn(
          "flex items-center justify-center px-2 py-2.5 rounded-lg text-sm mb-1",
          active ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        )}
      >
        <Shield className="h-4 w-4" />
      </Link>
    );
  }
  return (
    <div className="mb-1">
      <button
        onClick={toggle}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
          active ? "text-primary font-medium" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        )}
      >
        <Shield className="h-4 w-4 shrink-0" />
        <span className="truncate">Administrador</span>
        <ChevronDown className={cn("h-3.5 w-3.5 ml-auto transition-transform", !open && "-rotate-90")} />
      </button>
      {open && (
        <div className="mt-1 ml-3 pl-3 border-l border-border space-y-0.5">
          <SubLink to="/usuarios" label="Usuários" icon={Users} active={pathname.startsWith("/usuarios")} />
          <SubLink to="/admin/vendedores" label="Vendedores" icon={UserCog} active={pathname.startsWith("/admin/vendedores")} />
          <SubLink to="/integracoes" label="Integrações" icon={Plug} active={pathname.startsWith("/integracoes")} />
        </div>
      )}
    </div>
  );
}
