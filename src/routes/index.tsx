import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { clients, portfolio, atlasInsights, tasks, monthSeries } from "@/lib/mock-data";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Sparkles, Target, AlertTriangle, CheckCircle2, Clock, TrendingUp } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — Portal 2P" },
      { name: "description", content: "Visão diária com insights do Atlas: oportunidades, riscos e plano de ação." },
    ],
  }),
  component: HomePage,
});

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function HomePage() {
  const topPerformers = [...clients].sort((a, b) => b.health - a.health).slice(0, 4);
  const atRisk = [...clients].sort((a, b) => a.health - b.health).slice(0, 4);
  const projectedToday = portfolio.projected;
  const sold = portfolio.sold;
  const pct = (sold / projectedToday) * 100;

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-6">
        {/* Hero */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Bom dia, Bruno</div>
            <h1 className="text-3xl md:text-4xl font-bold mt-1">
              Sua carteira está em <span className="text-gradient-primary">{pct.toFixed(0)}%</span> da meta de hoje
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Atlas identificou {atlasInsights.length} ações que podem destravar R$ 104k esta semana.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90">
              <Sparkles className="h-4 w-4" /> Ver plano do Atlas
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Vendido / Projetado" value={fmt(sold)} sub={`Meta hoje ${fmt(projectedToday)}`} trend={-9.3} accent="primary" />
          <KpiCard label="Ticket Médio" value="R$ 18,27 mil" sub="Média 3M: R$ 20,68 mil" trend={-11.6} />
          <KpiCard label="Conversão R$" value="25,63%" sub="Média 3M: 31,44%" trend={-5.8} />
          <KpiCard label="Conversão Qtd" value="21,21%" sub="Média 3M: 33,52%" trend={-12.3} />
        </div>

        {/* Atlas insights top row */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary to-[oklch(0.7_0.18_280)] flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              Atlas recomenda
            </h2>
            <span className="text-xs text-muted-foreground">atualizado há 4min</span>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {atlasInsights.slice(0, 3).map((i) => (
              <div key={i.id} className="glass rounded-2xl p-5 hover:border-primary/40 transition-colors group">
                <div className="flex items-center gap-2 mb-3">
                  {i.type === "opportunity" && <Target className="h-4 w-4 text-success" />}
                  {i.type === "risk" && <AlertTriangle className="h-4 w-4 text-destructive" />}
                  {i.type === "action" && <TrendingUp className="h-4 w-4 text-primary" />}
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    {i.type === "opportunity" ? "Oportunidade" : i.type === "risk" ? "Risco" : "Ação"}
                  </span>
                  {i.impact && <span className="ml-auto text-xs text-primary font-medium">{i.impact}</span>}
                </div>
                <div className="font-display font-semibold leading-snug">{i.title}</div>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{i.description}</p>
                <button className="mt-4 text-xs font-medium text-primary flex items-center gap-1 hover:gap-2 transition-all">
                  Criar plano de ação →
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Main grid */}
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold">Vendas do mês</h3>
                <p className="text-xs text-muted-foreground">Projetado · Gerado · Vendido</p>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Valor vendido</div>
                <div className="font-display font-bold text-lg">{fmt(sold)}</div>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthSeries} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.72 0.19 47)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="oklch(0.72 0.19 47)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.72 0.17 155)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.72 0.17 155)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" stroke="oklch(0.55 0.015 250)" fontSize={11} tickLine={false} axisLine={false} interval={4} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: "oklch(0.22 0.013 250)", border: "1px solid oklch(0.3 0.012 250)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => fmt(v)}
                  />
                  <Area type="monotone" dataKey="projected" stroke="oklch(0.55 0.015 250)" strokeDasharray="3 3" fill="none" />
                  <Area type="monotone" dataKey="generated" stroke="oklch(0.72 0.17 155)" fill="url(#g2)" strokeWidth={2} />
                  <Area type="monotone" dataKey="sold" stroke="oklch(0.72 0.19 47)" fill="url(#g1)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold">Tarefas de hoje</h3>
              <span className="text-xs text-muted-foreground">{tasks.length} pendentes</span>
            </div>
            <div className="space-y-2">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-surface-2 group cursor-pointer">
                  <button className="h-5 w-5 rounded-md border-2 border-border group-hover:border-primary flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-3 w-3 text-primary opacity-0 group-hover:opacity-50" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.client}</div>
                  </div>
                  <div className={`text-[10px] px-2 py-0.5 rounded shrink-0 flex items-center gap-1 ${
                    t.priority === "high" ? "bg-destructive/15 text-destructive" :
                    t.priority === "medium" ? "bg-warning/15 text-[color:var(--warning)]" :
                    "bg-surface-2 text-muted-foreground"
                  }`}>
                    <Clock className="h-2.5 w-2.5" /> {t.due}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top performers vs at risk */}
        <div className="grid lg:grid-cols-2 gap-4">
          <ClientList title="Indo bem" subtitle="Clientes saudáveis na sua carteira" data={topPerformers} good />
          <ClientList title="Precisa de atenção" subtitle="Risco de churn ou queda de geração" data={atRisk} />
        </div>

        <div className="text-center pt-4">
          <Link to="/carteira" className="text-sm text-primary hover:underline">Ver carteira completa →</Link>
        </div>
      </div>
    </AppLayout>
  );
}

function KpiCard({ label, value, sub, trend, accent }: { label: string; value: string; sub: string; trend: number; accent?: "primary" }) {
  const up = trend >= 0;
  return (
    <div className={`glass rounded-2xl p-5 ${accent === "primary" ? "border-primary/30" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-2xl mt-1.5">{value}</div>
      <div className="flex items-center gap-2 mt-2">
        <span className={`text-xs flex items-center gap-0.5 ${up ? "text-success" : "text-destructive"}`}>
          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(trend).toFixed(1)}%
        </span>
        <span className="text-xs text-muted-foreground truncate">{sub}</span>
      </div>
    </div>
  );
}

function ClientList({ title, subtitle, data, good }: { title: string; subtitle: string; data: typeof clients; good?: boolean }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display font-semibold flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${good ? "bg-success" : "bg-destructive"}`} />
            {title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-2">
        {data.map((c) => (
          <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-2 cursor-pointer">
            <div className="h-9 w-9 rounded-lg bg-surface-2 flex items-center justify-center font-display font-bold text-sm text-primary">
              {c.segment}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{c.name}</div>
              <div className="text-xs text-muted-foreground">Última interação: {c.lastInteraction}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-semibold">{fmt(c.sales)}</div>
              <div className="flex items-center gap-1 justify-end">
                <div className="w-16 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className={`h-full ${c.health > 70 ? "bg-success" : c.health > 40 ? "bg-warning" : "bg-destructive"}`}
                    style={{ width: `${c.health}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{c.health}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
