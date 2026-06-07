import { X, Sparkles, TrendingUp, AlertTriangle, Target, LineChart, Send } from "lucide-react";
import { atlasInsights, type AtlasInsight } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { useState } from "react";

const typeMeta: Record<AtlasInsight["type"], { icon: typeof Sparkles; color: string; label: string }> = {
  opportunity: { icon: Target, color: "text-success", label: "Oportunidade" },
  risk: { icon: AlertTriangle, color: "text-destructive", label: "Risco" },
  action: { icon: TrendingUp, color: "text-primary", label: "Ação" },
  trend: { icon: LineChart, color: "text-[color:var(--atlas)]", label: "Tendência" },
};

export function AtlasPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [input, setInput] = useState("");

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 bg-background/60 backdrop-blur-sm z-40 transition-opacity",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed right-0 top-0 bottom-0 w-full sm:w-[440px] bg-surface border-l border-border z-50 flex flex-col transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-[oklch(0.7_0.18_280)] flex items-center justify-center glow-primary">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <div className="font-display font-semibold flex items-center gap-2">
              Atlas
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-sans">AI</span>
            </div>
            <div className="text-xs text-muted-foreground">Seu copiloto de vendas</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-2 rounded-lg">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2 px-1">
            Insights de hoje
          </div>
          {atlasInsights.map((insight) => {
            const meta = typeMeta[insight.type];
            const Icon = meta.icon;
            return (
              <div key={insight.id} className="glass rounded-xl p-4 hover:border-primary/40 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={cn("h-8 w-8 rounded-lg bg-surface-2 flex items-center justify-center shrink-0", meta.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("text-[10px] uppercase tracking-wider font-semibold", meta.color)}>
                        {meta.label}
                      </span>
                      {insight.impact && (
                        <span className="text-[10px] text-muted-foreground">• {insight.impact}</span>
                      )}
                    </div>
                    <div className="font-medium text-sm leading-snug">{insight.title}</div>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{insight.description}</p>
                    <div className="flex gap-2 mt-3">
                      <button className="text-[11px] px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 font-medium">
                        Criar plano de ação
                      </button>
                      <button className="text-[11px] px-2.5 py-1 rounded-md bg-surface-2 hover:bg-surface text-muted-foreground">
                        Detalhar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border p-4">
          <div className="flex gap-2 mb-2 flex-wrap">
            {["Quem está em risco?", "Top oportunidades", "Plano para esta semana"].map((s) => (
              <button
                key={s}
                onClick={() => setInput(s)}
                className="text-[11px] px-2 py-1 rounded-md bg-surface-2 hover:bg-surface text-muted-foreground"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="relative">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte ao Atlas…"
              className="w-full pl-3 pr-10 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary/50"
            />
            <button className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90">
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
