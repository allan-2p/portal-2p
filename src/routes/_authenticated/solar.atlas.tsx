import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Sparkles, Target, AlertTriangle, TrendingUp, LineChart, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/solar/atlas")({
  head: () => ({ meta: [{ title: "Atlas — Portal 2P" }] }),
  component: AtlasPage,
});

const SUGGESTIONS = [
  { icon: AlertTriangle, label: "Quais clientes estão em risco?", color: "text-destructive" },
  { icon: Target, label: "Top oportunidades da semana", color: "text-success" },
  { icon: TrendingUp, label: "Plano de ação para bater a meta", color: "text-primary" },
  { icon: LineChart, label: "Tendências da minha carteira", color: "text-[oklch(0.55_0.18_280)]" },
];

function AtlasPage() {
  return (
    <AppLayout>
      <div className="relative max-w-3xl mx-auto h-[calc(100vh-7rem)]">
        {/* Conteúdo real, borrado */}
        <div
          aria-hidden
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 blur-md pointer-events-none select-none opacity-60"
        >
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.65_0.2_30)] flex items-center justify-center mb-5">
            <Sparkles className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Olá, eu sou o Atlas.</h1>
          <p className="text-muted-foreground mt-2 max-w-md">
            Seu copiloto de vendas. Posso analisar sua carteira, sugerir ações e ajudar a bater a meta.
          </p>
          <div className="grid sm:grid-cols-2 gap-2 w-full max-w-xl mt-8">
            {SUGGESTIONS.map((s) => (
              <div key={s.label} className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-surface text-left">
                <s.icon className={cn("h-4 w-4 shrink-0", s.color)} />
                <span className="text-sm">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Overlay "em breve" */}
        <div className="absolute inset-0 flex items-center justify-center px-4">
          <div className="glass rounded-2xl px-8 py-7 max-w-md text-center shadow-xl border border-primary/20">
            <div className="mx-auto h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-[oklch(0.65_0.2_30)] flex items-center justify-center mb-4 shadow-md shadow-primary/30">
              <Clock className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="text-[11px] uppercase tracking-wider text-primary font-semibold">Em breve</div>
            <h2 className="font-display font-bold text-2xl mt-1">Atlas está sendo configurado</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Estamos ligando o Atlas às fontes de dados de cada instância. Assim que a
              integração estiver pronta, seu copiloto vai aparecer aqui.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
