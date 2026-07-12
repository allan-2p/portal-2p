import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Home, KanbanSquare, Layers, Users, LogOut, ShieldCheck, User as UserIcon, Calendar, BarChart3, ChevronLeft, ChevronRight, ChevronDown, Sparkles, ClipboardList, Plug, Shield, UserCog, Target, Table as TableIcon, Megaphone, Filter, TrendingUp, Settings2, KeyRound, Eye, LineChart, Tv } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ThemeToggle } from "./theme-toggle";
import { NotificationsDropdown } from "./notifications-dropdown";
import { InstanceSwitcher } from "./instance-switcher";
import { MarketingUnitSwitch } from "./marketing-unit-switch";
import { ViewAsSwitcher } from "./view-as-switcher";
import { useInstance } from "./instance-provider";
import { INSTANCES, type FeatureKey } from "@/lib/instances";
import { SCREENS, type ScreenKey } from "@/lib/view-screens";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABELS } from "@/hooks/use-auth";
import { useAvatarUrl } from "@/hooks/use-avatar-url";
import { useSalesforceNotifications } from "@/hooks/use-salesforce-notifications";
import { bootstrapFirstAdmin } from "@/lib/users.functions";

import { toast } from "sonner";

const COLLAPSE_KEY = "portal2p-sidebar-collapsed";
const CLIENTES_OPEN_KEY = "portal2p-clientes-open";
const DASHBOARDS_OPEN_KEY = "portal2p-dashboards-open";

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLoadingRoute = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [clientesOpen, setClientesOpen] = useState(true);
  const [dashboardsOpen, setDashboardsOpen] = useState(true);

  const { user, profile, roles, hasRole } = useAuth();
  const avatarUrl = useAvatarUrl(profile?.avatar_url);
  const bootstrap = useServerFn(bootstrapFirstAdmin);
  useSalesforceNotifications();
  const { instance, hasFeature, isRouteAllowed } = useInstance();
  const instMeta = INSTANCES[instance];

  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    const saved = localStorage.getItem(CLIENTES_OPEN_KEY);
    if (saved !== null) setClientesOpen(saved === "1");
    const savedD = localStorage.getItem(DASHBOARDS_OPEN_KEY);
    if (savedD !== null) setDashboardsOpen(savedD === "1");
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/clientes")) setClientesOpen(true);
    if (pathname.startsWith("/dashboards")) setDashboardsOpen(true);
  }, [pathname]);

  // Se usuário está numa rota que a instância atual não permite, redireciona para home.
  useEffect(() => {
    if (!isRouteAllowed(pathname)) {
      toast.info(`"${pathname}" não está disponível na instância ${instMeta.label}.`);
      navigate({ to: "/" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, pathname]);

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

  const toggleDashboards = () => {
    setDashboardsOpen((v) => {
      localStorage.setItem(DASHBOARDS_OPEN_KEY, !v ? "1" : "0");
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
  const dashboardsActive = pathname.startsWith("/dashboards");
  const marketingActive = pathname.startsWith("/marketing");

  // Filtragem de itens por feature.
  const show = (k: FeatureKey) => hasFeature(k);

  return (
    <div className="min-h-screen flex bg-background">
      <aside
        className={cn(
          "hidden md:flex shrink-0 flex-col border-r border-border bg-surface/60 backdrop-blur transition-[width] duration-300 relative",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className={cn("flex items-center gap-3 py-6", collapsed ? "px-3 justify-center" : "px-5")}>
          <img src={instMeta.logo} alt={instMeta.label} className="h-9 w-auto rounded shrink-0 object-contain" />
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-display font-bold text-base leading-none truncate">Portal 2P</div>
              <div className="text-[11px] text-muted-foreground mt-1 truncate">{instMeta.label}</div>
            </div>
          )}
        </div>

        <nav className="px-2 py-2 flex-1 overflow-y-auto">
          {/* Atlas — só se instância permitir */}
          {show("atlas") && (
            <>
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
            </>
          )}

          {show("home") && (
            <NavLink item={{ to: "/", label: "Home", icon: Home }} active={pathname === "/"} collapsed={collapsed} />
          )}
          {show("tarefas") && (
            <NavLink item={{ to: "/tarefas", label: "Tarefas", icon: Calendar }} active={pathname.startsWith("/tarefas")} collapsed={collapsed} />
          )}
          {show("pedidos") && (
            <NavLink item={{ to: "/pedidos", label: "Pedidos", icon: KanbanSquare }} active={pathname.startsWith("/pedidos")} collapsed={collapsed} />
          )}

          {/* Clientes — grupo expansível */}
          {(show("clientes.cadastros") || show("clientes.segmentacao")) && (
            collapsed ? (
              <Link
                to={show("clientes.segmentacao") ? "/clientes/segmentacao" : "/clientes/cadastros"}
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
                    {show("clientes.cadastros") && (
                      <SubLink to="/clientes/cadastros" label="Cadastros" icon={ClipboardList} active={pathname.startsWith("/clientes/cadastros")} />
                    )}
                    {show("clientes.segmentacao") && (
                      <SubLink to="/clientes/segmentacao" label="Segmentação" icon={Layers} active={pathname.startsWith("/clientes/segmentacao")} />
                    )}
                  </div>
                )}
              </div>
            )
          )}

          {show("dashboards") && (
            collapsed ? (
              <Link
                to="/dashboards/metas"
                preload="intent"
                title="Dashboards"
                className={cn(
                  "flex items-center justify-center px-2 py-2.5 rounded-lg text-sm mb-1",
                  dashboardsActive ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <BarChart3 className="h-4 w-4" />
              </Link>
            ) : (
              <div className="mb-1">
                <button
                  onClick={toggleDashboards}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                    dashboardsActive ? "text-primary font-medium" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  <BarChart3 className="h-4 w-4 shrink-0" />
                  <span className="truncate">Dashboards</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 ml-auto transition-transform", !dashboardsOpen && "-rotate-90")} />
                </button>
                {dashboardsOpen && (
                  <div className="mt-1 ml-3 pl-3 border-l border-border space-y-0.5">
                    <SubLink to="/dashboards/metas" label="Metas" icon={Target} active={pathname.startsWith("/dashboards/metas")} />
                  </div>
                )}
              </div>
            )
          )}

          {/* Marketing — só na instância marketing */}
          {show("marketing.home") && (
            collapsed ? (
              <Link
                to="/marketing"
                preload="intent"
                title="Marketing"
                className={cn(
                  "flex items-center justify-center px-2 py-2.5 rounded-lg text-sm mb-1",
                  marketingActive ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <Megaphone className="h-4 w-4" />
              </Link>
            ) : (
              <div className="mb-1 space-y-0.5">
                <NavLink item={{ to: "/marketing", label: "Home", icon: Megaphone }} active={pathname === "/marketing"} collapsed={false} />
                {show("marketing.social") && (
                  <NavLink item={{ to: "/marketing/social", label: "Social Media", icon: Users }} active={pathname.startsWith("/marketing/social")} collapsed={false} />
                )}
                {show("marketing.trafego") && (
                  <NavLink item={{ to: "/marketing/trafego", label: "Tráfego Pago", icon: Filter }} active={pathname.startsWith("/marketing/trafego")} collapsed={false} />
                )}
                {show("marketing.cohort") && (
                  <NavLink item={{ to: "/marketing/cohort", label: "Análise Cohort", icon: LineChart }} active={pathname.startsWith("/marketing/cohort")} collapsed={false} />
                )}
                {show("marketing.cac") && (
                  <NavLink item={{ to: "/marketing/cac", label: "CAC", icon: TrendingUp }} active={pathname.startsWith("/marketing/cac")} collapsed={false} />
                )}
              </div>
            )
          )}

          {hasRole("admin") && (
            <AdminGroup pathname={pathname} collapsed={collapsed} show={show} />
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
              <img src={instMeta.logo} alt={instMeta.label} className="h-7 w-auto rounded object-contain" />
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
              <Link
                to="/2p-group"
                target="_blank"
                title="Painel de TV — 2P Group"
                className="h-9 w-9 rounded-lg border border-border bg-gradient-to-br from-[#F28A3C]/20 to-[#1A00B0]/20 hover:from-[#F28A3C]/35 hover:to-[#1A00B0]/35 flex items-center justify-center transition-colors"
              >
                <Tv className="h-4 w-4" />
              </Link>
              <InstanceSwitcher />
              {instance === "marketing" && <MarketingUnitSwitch />}
              <ViewAsSwitcher currentScreen={currentScreenKey(pathname)} />
              <ThemeToggle />
              <NotificationsDropdown />

              {hasRole("admin") && (
                <div className="relative">
                  <button
                    onClick={() => setAdminMenuOpen((v) => !v)}
                    className="h-9 w-9 rounded-lg border border-border bg-surface hover:bg-surface-2 flex items-center justify-center"
                    title="Configurações de administrador"
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                  {adminMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setAdminMenuOpen(false)} />
                      <div className="absolute right-0 top-11 z-50 w-64 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                        <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                          Administração
                        </div>
                        <Link
                          to="/admin/acessos-instancias"
                          onClick={() => setAdminMenuOpen(false)}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface-2"
                        >
                          <Shield className="h-4 w-4" /> Acessos por Instância
                        </Link>
                        <Link
                          to="/admin/permissoes"
                          onClick={() => setAdminMenuOpen(false)}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface-2 border-t border-border"
                        >
                          <KeyRound className="h-4 w-4" /> Permissões de Usuários
                        </Link>
                        <Link
                          to="/admin/visualizacoes"
                          onClick={() => setAdminMenuOpen(false)}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface-2 border-t border-border"
                        >
                          <Eye className="h-4 w-4" /> Versões de Tela
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              )}

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

function AdminGroup({ pathname, collapsed, show }: { pathname: string; collapsed: boolean; show: (k: FeatureKey) => boolean }) {
  const active = pathname.startsWith("/admin") || pathname.startsWith("/usuarios") || pathname.startsWith("/integracoes");
  const [open, setOpen] = useState(active);
  useEffect(() => {
    const saved = localStorage.getItem(ADMIN_OPEN_KEY);
    if (saved !== null) setOpen(saved === "1");
  }, []);
  useEffect(() => { if (active) setOpen(true); }, [active]);
  const toggle = () => setOpen((v) => { localStorage.setItem(ADMIN_OPEN_KEY, !v ? "1" : "0"); return !v; });

  const showUsers = show("admin.usuarios");
  const showVend = show("admin.vendedores");
  const showMetas = show("admin.metas");
  const showTab = show("admin.tabelas");
  const showInt = show("admin.integracoes");
  const anyChild = showUsers || showVend || showMetas || showTab || showInt;
  if (!anyChild) return null;

  if (collapsed) {
    return (
      <Link
        to={showInt ? "/integracoes" : showUsers ? "/usuarios" : "/admin/metas"}
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
          {showUsers && <SubLink to="/usuarios" label="Usuários" icon={Users} active={pathname.startsWith("/usuarios")} />}
          {showVend && <SubLink to="/admin/vendedores" label="Vendedores" icon={UserCog} active={pathname.startsWith("/admin/vendedores")} />}
          {showMetas && <SubLink to="/admin/metas" label="Regras de Metas" icon={Target} active={pathname.startsWith("/admin/metas")} />}
          {showTab && <SubLink to="/admin/tabelas" label="Tabelas" icon={TableIcon} active={pathname.startsWith("/admin/tabelas")} />}
          {showInt && <SubLink to="/integracoes" label="Integrações" icon={Plug} active={pathname.startsWith("/integracoes")} />}
        </div>
      )}
    </div>
  );
}

function currentScreenKey(pathname: string): ScreenKey | null {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/dashboards")) return "dashboards";
  if (pathname.startsWith("/clientes/segmentacao")) return "clientes.segmentacao";
  return SCREENS.find((s) => pathname.startsWith("/" + s.key))?.key ?? null;
}
