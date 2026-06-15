import { Link, useRouterState } from "@tanstack/react-router";
import { Home, KanbanSquare, Layers, Sparkles, Search, Bell } from "lucide-react";
import { useState, type ReactNode } from "react";
import logo from "@/assets/2p-logo.jpg";
import { AtlasPanel } from "./atlas-panel";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/pedidos", label: "Pedidos", icon: KanbanSquare },
  { to: "/segmentacao", label: "Segmentação", icon: Layers },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [atlasOpen, setAtlasOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-surface/60 backdrop-blur">
        <div className="px-5 py-6 flex items-center gap-3">
          <img src={logo} alt="2P" className="h-9 w-auto rounded" />
          <div>
            <div className="font-display font-bold text-base leading-none">Portal 2P</div>
            <div className="text-[11px] text-muted-foreground mt-1">Inteligência de vendas</div>
          </div>
        </div>
        <nav className="px-3 py-2 flex-1">
          {nav.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all mb-1",
                  active
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={() => setAtlasOpen(true)}
          className="mx-3 mb-4 glass rounded-xl p-4 text-left hover:glow-primary transition-all group"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-[oklch(0.7_0.18_280)] flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-display font-semibold text-sm">Atlas</span>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">AI</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">5 insights novos para sua carteira hoje.</p>
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
              <ThemeToggle />
              <button className="relative p-2 rounded-lg hover:bg-surface-2 border border-border bg-surface">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
              </button>
              <button
                onClick={() => setAtlasOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-colors text-sm font-medium"
              >
                <Sparkles className="h-4 w-4" />
                Atlas
              </button>
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-[oklch(0.62_0.22_25)] flex items-center justify-center font-semibold text-sm text-primary-foreground">
                BA
              </div>
            </div>
          </div>
        </header>
        <div className="p-6">{children}</div>
      </main>

      <AtlasPanel open={atlasOpen} onClose={() => setAtlasOpen(false)} />
    </div>
  );
}
