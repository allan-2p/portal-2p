import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { clients, portfolio, atlasInsights, tasks, monthSeries } from "@/lib/mock-data";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Sparkles,
  Target,
  AlertTriangle,
  Clock,
  TrendingUp,
  CheckCircle2,
  Phone,
  Mail,
  Calendar,
  Info,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — Portal 2P" },
      { name: "description", content: "Visão da carteira, projeção vs realizado, tarefas do dia e sugestões do Atlas." },
    ],
  }),
  component: HomePage,
});

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// CSS-var resolved colors for Recharts (work in both themes)
const C = {
  axis: "var(--chart-axis)",
  grid: "var(--border)",
  projected: "var(--muted-foreground)",
  generated: "var(--success)",
  sold: "var(--primary)",
};

function HomePage() {
  const todayPct = (portfolio.sold / portfolio.projected) * 100;
  const goalPct = (portfolio.achieved / portfolio.goal) * 100;

  // Clientes ligados às tarefas de hoje
  const taskClientNames = new Set(tasks.map((t) => t.client));
  const taskInsights = atlasInsights.filter((i) => i.client && taskClientNames.has(i.client));

  // Insights "fora da agenda": clientes sem tarefa hoje mas com follow-up sugerido
  const offRadarInsights = atlasInsights.filter((i) => !i.client || !taskClientNames.has(i.client));

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-6">
        {/* Hero */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Bom dia, Bruno</div>
            <h1 className="text-3xl md:text-4xl font-bold mt-1">
              Sua carteira está em{" "}
              <span className="text-gradient-primary">{todayPct.toFixed(0)}%</span> da meta de hoje
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Atlas identificou {atlasInsights.length} ações que podem destravar R$ 104k esta semana.
            </p>
          </div>
          <button className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 self-start md:self-auto">
            <Sparkles className="h-4 w-4" /> Ver plano do Atlas
          </button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi label="Vendido / Projetado" value={fmt(portfolio.sold)} sub={`Meta hoje ${fmt(portfolio.projected)}`} trend={-9.3} highlight />
          <Kpi label="Ticket Médio" value="R$ 18,27 mil" sub="Média 3M: R$ 20,68 mil" trend={-11.6} />
          <Kpi label="Conversão R$" value="25,63%" sub="Média 3M: 31,44%" trend={-5.8} />
          <Kpi label="Conversão Qtd" value="21,21%" sub="Média 3M: 33,52%" trend={-12.3} />
          <Kpi label="Sem Cotar +30d" value="1.628" sub="clientes" />
          <Kpi label="Sem Pedido +30d" value="1.778" sub="clientes" />
        </div>

        {/* Meta do mês */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="font-display font-semibold">Meta do mês</div>
                <div className="text-sm">
                  <span className="text-primary font-bold">{fmt(portfolio.achieved)}</span>
                  <span className="text-muted-foreground"> / {fmt(portfolio.goal)}</span>
                </div>
              </div>
              <div className="h-2 mt-2 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-[oklch(0.78_0.19_60)]"
                  style={{ width: `${goalPct}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1.5">
                {goalPct.toFixed(2)}% alcançado · {todayPct.toFixed(0)}% do dia
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h3 className="font-display font-semibold">Projeção × Geração × Vendas</h3>
              <p className="text-xs text-muted-foreground">Acumulado diário do mês</p>
            </div>
            <div className="flex gap-4 text-xs">
              <Legenda color={C.projected} dashed label="Projetado" value={fmt(portfolio.projected)} />
              <Legenda color={C.generated} label="Gerado" value={fmt(portfolio.generationMonth)} />
              <Legenda color={C.sold} label="Vendido" value={fmt(portfolio.sold)} />
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthSeries} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="g-sold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.sold} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={C.sold} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g-gen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.generated} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={C.generated} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" stroke={C.axis} fontSize={11} tickLine={false} axisLine={false} interval={4} />
                <YAxis stroke={C.axis} fontSize={11} tickLine={false} axisLine={false} width={60} tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
                <Tooltip
                  contentStyle={{
                    background: "var(--chart-tooltip-bg)",
                    border: "1px solid var(--chart-tooltip-border)",
                    borderRadius: 10,
                    fontSize: 12,
                    color: "var(--foreground)",
                    boxShadow: "0 8px 24px -8px rgba(0,0,0,0.15)",
                  }}
                  labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                  formatter={(v: number) => fmt(v)}
                />
                <Area
                  type="monotone"
                  dataKey="projected"
                  name="Projetado"
                  stroke={C.projected}
                  strokeDasharray="4 4"
                  fill="none"
                  strokeWidth={1.5}
                />
                <Area
                  type="monotone"
                  dataKey="generated"
                  name="Gerado"
                  stroke={C.generated}
                  fill="url(#g-gen)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="sold"
                  name="Vendido"
                  stroke={C.sold}
                  fill="url(#g-sold)"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Two columns: Tarefas + Off-radar */}
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Coluna 1: Tarefas Salesforce + sugestões */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  Agenda de hoje
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tarefas do Salesforce + sugestões do Atlas para cada cliente
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{tasks.length} pendentes</span>
            </div>

            <div className="space-y-3">
              {tasks.map((t) => {
                const insight = atlasInsights.find((i) => i.client === t.client);
                return (
                  <div key={t.id} className="rounded-xl border border-border bg-surface p-3.5 hover:border-primary/40 transition-colors">
                    <div className="flex items-start gap-3">
                      <button className="mt-0.5 h-5 w-5 rounded-md border-2 border-border hover:border-primary flex items-center justify-center shrink-0 group">
                        <CheckCircle2 className="h-3 w-3 text-primary opacity-0 group-hover:opacity-60" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{t.title}</div>
                            <div className="text-xs text-muted-foreground truncate">{t.client}</div>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded shrink-0 flex items-center gap-1 ${
                            t.priority === "high" ? "bg-destructive/15 text-destructive" :
                            t.priority === "medium" ? "bg-warning/20 text-[color:var(--warning)]" :
                            "bg-surface-2 text-muted-foreground"
                          }`}>
                            <Clock className="h-2.5 w-2.5" /> {t.due}
                          </span>
                        </div>
                        {insight && (
                          <div className="mt-3 rounded-lg bg-primary/8 border border-primary/20 p-2.5">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Sparkles className="h-3 w-3 text-primary" />
                              <span className="text-[10px] uppercase tracking-wider font-semibold text-primary">
                                Atlas sugere
                              </span>
                              {insight.impact && (
                                <span className="ml-auto text-[10px] font-medium text-primary">{insight.impact}</span>
                              )}
                            </div>
                            <div className="text-xs text-foreground/90 leading-snug">{insight.title}</div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{insight.description}</p>
                          </div>
                        )}
                        <div className="flex gap-1.5 mt-2.5">
                          <button className="text-[11px] px-2 py-1 rounded bg-surface-2 hover:bg-primary/15 hover:text-primary text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" /> Ligar
                          </button>
                          <button className="text-[11px] px-2 py-1 rounded bg-surface-2 hover:bg-primary/15 hover:text-primary text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" /> E-mail
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Coluna 2: Off-radar (sem tarefa hoje, mas Atlas vê algo) */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Atlas radar
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Clientes sem tarefa hoje, mas com sinal de oportunidade ou risco
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{offRadarInsights.length} sinais</span>
            </div>

            <div className="space-y-3">
              {offRadarInsights.map((i) => {
                const client = clients.find((c) => c.name === i.client);
                const typeMeta =
                  i.type === "opportunity"
                    ? { Icon: TrendingUp, color: "text-success", bg: "bg-success/15", label: "Oportunidade" }
                    : i.type === "risk"
                    ? { Icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/15", label: "Risco" }
                    : i.type === "trend"
                    ? { Icon: Info, color: "text-[color:var(--atlas)]", bg: "bg-[color:var(--atlas)]/15", label: "Tendência" }
                    : { Icon: TrendingUp, color: "text-primary", bg: "bg-primary/15", label: "Ação" };
                const Icon = typeMeta.Icon;
                return (
                  <div
                    key={i.id}
                    className="rounded-xl border border-border bg-surface p-3.5 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`h-8 w-8 rounded-lg ${typeMeta.bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`h-4 w-4 ${typeMeta.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] uppercase tracking-wider font-semibold ${typeMeta.color}`}>
                            {typeMeta.label}
                          </span>
                          {i.impact && (
                            <span className="ml-auto text-[10px] font-medium text-primary">{i.impact}</span>
                          )}
                        </div>
                        <div className="text-sm font-semibold leading-snug">{i.title}</div>
                        {i.client && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {i.client}
                            {client && <> · última interação {client.lastInteraction}</>}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{i.description}</p>
                        <div className="flex gap-1.5 mt-2.5">
                          <button className="text-[11px] px-2 py-1 rounded bg-primary/15 text-primary hover:bg-primary/25 font-medium">
                            Criar tarefa
                          </button>
                          <button className="text-[11px] px-2 py-1 rounded bg-surface-2 hover:bg-surface-2 text-muted-foreground">
                            Dispensar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Kpi({
  label,
  value,
  sub,
  trend,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  trend?: number;
  highlight?: boolean;
}) {
  const up = (trend ?? 0) >= 0;
  return (
    <div className={`glass rounded-xl p-4 ${highlight ? "border-primary/40" : ""}`}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-xl mt-1">{value}</div>
      <div className="flex items-center gap-1.5 mt-1.5">
        {trend !== undefined && (
          <span className={`text-[11px] flex items-center gap-0.5 ${up ? "text-success" : "text-destructive"}`}>
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
        <span className="text-[11px] text-muted-foreground truncate">{sub}</span>
      </div>
    </div>
  );
}

function Legenda({ color, label, value, dashed }: { color: string; label: string; value: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block w-6 h-0.5 rounded"
        style={{
          background: dashed
            ? `repeating-linear-gradient(to right, ${color} 0 4px, transparent 4px 8px)`
            : color,
        }}
      />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}
