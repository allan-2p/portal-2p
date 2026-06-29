import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Home, KanbanSquare, Layers, Search, Users, LogOut, ShieldCheck, User as UserIcon, Calendar, BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import logo from "@/assets/2p-logo.jpg";
import { ThemeToggle } from "./theme-toggle";
import { NotificationsDropdown } from "./notifications-dropdown";
import { AtlasFab } from "./atlas-fab";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABELS } from "@/hooks/use-auth";
import { useAvatarUrl } from "@/hooks/use-avatar-url";
import { useNotificationsDemoFeed } from "@/hooks/use-notifications";
import { bootstrapFirstAdmin } from "@/lib/users.functions";
import { toast } from "sonner";

const baseNav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/tarefas", label: "Tarefas", icon: Calendar },
  { to: "/pedidos", label: "Pedidos", icon: KanbanSquare },
  { to: "/carteira", label: "Carteira", icon: Layers },
  { to: "/dashboards", label: "Dashboards", icon: BarChart3 },
];

const COLLAPSE_KEY = "portal2p-sidebar-collapsed";

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { user, profile, roles, hasRole } = useAuth();
  const avatarUrl = useAvatarUrl(profile?.avatar_url);
  const bootstrap = useServerFn(bootstrapFirstAdmin);
  useNotificationsDemoFeed();

  useEffect(() => {
    const saved = localStorage.getItem(COLLAPSE_KEY);
    if (saved === "1") setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  const nav = hasRole("admin")
    ? [...baseNav, { to: "/usuarios", label: "Usuários", icon: Users }]
    : baseNav;

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
        <nav className="px-2 py-2 flex-1">
          {nav.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg text-sm transition-all mb-1",
                  collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                  active
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
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
            <div className="hidden md:flex items-center gap-2 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  placeholder="Buscar cliente, pedido, projeto…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
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
        <div className="p-6">{children}</div>
      </main>

      <AtlasFab />
    </div>
  );
}
