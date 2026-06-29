import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { clients, portfolio, atlasInsights, tasks, generationSeries, salesSeries, budgets, forecasts, type BudgetStage } from "@/lib/mock-data";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useState } from "react";
import {
  ArrowDownRight, ArrowUpRight, Sparkles, Target, AlertTriangle, Clock,
  TrendingUp, CheckCircle2, Phone, Mail, Calendar, Info, ChevronDown,
  FileText, CalendarClock, Gift, Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Home — Portal 2P" }, { name: "description", content: "Visão da carteira, projeção vs realizado, tarefas, orçamentos e previsão." }] }),
  component: HomePage,
});

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtShort = (n: number) => `R$ ${(n / 1000).toFixed(0)}k`;

const C = {
  axis: "var(--chart-axis)",
  grid: "var(--border)",
  projected: "var(--muted-foreground)",
  generation: "oklch(0.55 0.2 250)", // azul
  sales: "var(--primary)", // laranja
};

function HomePage() {
  const [metaOpen, setMetaOpen] = useState(false);
  const [forecastFilter, setForecastFilter] = useState<"todos" | "7d" | "30d" | "atrasados">("todos");

  const goal = portfolio.goal;
  const achieved = portfolio.achieved;
  const projected = portfolio.projected;
  const sold = portfolio.sold;
  const goalPct = (achieved / goal) * 100;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  const taskClientNames = new Set(tasks.map((t) => t.client));
  const offRadarInsights = atlasInsights.filter((i) => !i.client || !taskClientNames.has(i.client));

  const today = new Date("2026-06-29");
  const filteredForecasts = forecasts.filter((f) => {
    const d = new Date(f.expectedClose);
    const diff = (d.getTime() - today.getTime()) / 86400000;
    if (forecastFilter === "7d") return diff >= 0 && diff <= 7;
    if (forecastFilter === "30d") return diff >= 0 && diff <= 30;
    if (forecastFilter === "atrasados") return diff < 0;
    return true;
  });
  const stageColor: Record<BudgetStage, string> = {
    "Projeto Fechado": "bg-success/15 text-success",
    "Projeto Não Fechado": "bg-destructive/15 text-destructive",
    "Estoque": "bg-[color:var(--atlas)]/15 text-[color:var(--atlas)]",
    "Em Negociação": "bg-warning/20 text-[color:var(--warning)]",
  };

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-6">
        {/* Hero */}
        <div>
          <div className="text-sm text-muted-foreground">{greeting}, Bruno</div>
          <h1 className="text-3xl md:text-4xl font-bold mt-1">
            Você está em <span className="text-foreground">{goalPct.toFixed(1)}%</span> da meta do mês
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Atlas identificou {atlasInsights.length} ações que podem destravar R$ 104k esta semana.
          </p>
        </div>

        {/* Meta — bloco principal com toggle */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="font-display font-semibold">Meta do mês</div>
                <div className="text-sm flex items-center gap-3">
                  <span><span className="text-muted-foreground">Vendido </span><span className="text-primary font-bold">{fmt(sold)}</span></span>
                  <span className="text-muted-foreground">·</span>
                  <span><span className="text-muted-foreground">Projetado </span><span className="font-semibold">{fmt(projected)}</span></span>
                </div>
              </div>

              {/* % acima da barra, legível em qualquer tema */}
              <div className="flex items-center justify-between mt-3 text-xs">
                <span className="font-semibold text-foreground">{goalPct.toFixed(1)}% alcançado</span>
                <span className="text-muted-foreground tabular-nums">{fmt(achieved)} / {fmt(goal)}</span>
              </div>
              <div className="relative h-3 mt-1.5 rounded-full bg-surface-2 overflow-hidden border border-border">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-[oklch(0.78_0.19_60)] rounded-full transition-all"
                  style={{ width: `${Math.min(goalPct, 100)}%` }}
                />
              </div>

              <button onClick={() => setMetaOpen(!metaOpen)} className="mt-3 text-xs text-primary font-medium flex items-center gap-1 hover:underline">
                {metaOpen ? "Ocultar detalhes" : "Detalhar"}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", metaOpen && "rotate-180")} />
              </button>
            </div>
          </div>

          {metaOpen && (
            <div className="mt-5 pt-5 border-t border-border space-y-5">
              {/* Detalhes KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MiniKpi
                  label="Retenção"
                  value={`${portfolio.retentionActive} / ${portfolio.retentionBase}`}
                  sub={`${portfolio.retention.toFixed(1)}% da carteira ativa`}
                />
                <MiniKpi
                  label="Recorrência"
                  value={`${portfolio.recurrenceCount} / ${portfolio.recurrenceBase}`}
                  sub={`${portfolio.recurrence.toFixed(1)}% dos clientes`}
                />
                <MiniKpi label="Novos recorrentes" value={`${portfolio.newRecurringClients}`} sub="Clientes no mês" />
                <MiniKpi label="Ticket médio" value="R$ 18,27k" sub="3M: R$ 20,68k" trend={-11.6} />
                <MiniKpi label="Conversão R$" value="25,63%" sub="3M: 31,44%" trend={-5.8} />
                <MiniKpi label="Conversão Qtd" value="21,21%" sub="3M: 33,52%" trend={-12.3} />
              </div>

              {/* Dois gráficos */}
              <div className="grid lg:grid-cols-2 gap-4">
                <ChartCard
                  title="Geração — Projetado × Realizado"
                  series={generationSeries}
                  valueKey="generated"
                  valueColor={C.generation}
                  valueLabel="Gerado"
                />
                <ChartCard
                  title="Vendas — Projetado × Realizado"
                  series={salesSeries}
                  valueKey="sold"
                  valueColor={C.sales}
                  valueLabel="Vendido"
                />
              </div>
            </div>
          )}
        </div>

        {/* Seção: Tarefas e Sugestões */}
        <div>
          <div className="flex items-end justify-between mb-3">
            <div>
              <h2 className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-semibold">Operação do dia</h2>
              <h3 className="font-display font-bold text-xl mt-1">Tarefas & Sugestões</h3>
            </div>
          </div>
        </div>

        {/* Tarefas + Atlas Radar */}
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" /> Agenda de hoje
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Tarefas do Salesforce com sugestões do Atlas</p>
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
                              <span className="text-[10px] uppercase tracking-wider font-semibold text-primary">Atlas sugere</span>
                              {insight.impact && <span className="ml-auto text-[10px] font-medium text-primary">{insight.impact}</span>}
                            </div>
                            <div className="text-xs text-foreground/90 leading-snug">{insight.title}</div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{insight.description}</p>
                          </div>
                        )}
                        <div className="flex gap-1.5 mt-2.5">
                          <button className="text-[11px] px-2 py-1 rounded bg-surface-2 hover:bg-primary/15 hover:text-primary text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Ligar</button>
                          <button className="text-[11px] px-2 py-1 rounded bg-surface-2 hover:bg-primary/15 hover:text-primary text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> E-mail</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Atlas radar
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Clientes sem tarefa hoje com sinais de oportunidade ou risco</p>
              </div>
              <span className="text-xs text-muted-foreground">{offRadarInsights.length} sinais</span>
            </div>
            <div className="space-y-3">
              {offRadarInsights.map((i) => {
                const client = clients.find((c) => c.name === i.client);
                const meta = i.type === "opportunity"
                  ? { Icon: TrendingUp, color: "text-success", bg: "bg-success/15", label: "Oportunidade" }
                  : i.type === "risk"
                  ? { Icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/15", label: "Risco" }
                  : i.type === "trend"
                  ? { Icon: Info, color: "text-[color:var(--atlas)]", bg: "bg-[color:var(--atlas)]/15", label: "Tendência" }
                  : { Icon: TrendingUp, color: "text-primary", bg: "bg-primary/15", label: "Ação" };
                const Icon = meta.Icon;
                return (
                  <div key={i.id} className="rounded-xl border border-border bg-surface p-3.5 hover:border-primary/40 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`h-8 w-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`h-4 w-4 ${meta.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] uppercase tracking-wider font-semibold ${meta.color}`}>{meta.label}</span>
                          {i.impact && <span className="ml-auto text-[10px] font-medium text-primary">{i.impact}</span>}
                        </div>
                        <div className="text-sm font-semibold leading-snug">{i.title}</div>
                        {i.client && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {i.client}{client && <> · última interação {client.lastInteraction}</>}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{i.description}</p>
                        <div className="flex gap-1.5 mt-2.5">
                          <button className="text-[11px] px-2 py-1 rounded bg-primary/15 text-primary hover:bg-primary/25 font-medium">Criar tarefa</button>
                          <button className="text-[11px] px-2 py-1 rounded bg-surface-2 hover:bg-surface-2 text-muted-foreground">Dispensar</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Orçamentos + Previsão */}
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Orçamentos em aberto
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {budgets.length} orçamentos · {fmt(budgets.reduce((a, b) => a + b.value, 0))}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {budgets.map((b) => (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface hover:border-primary/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">{b.code}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", stageColor[b.stage])}>{b.stage}</span>
                    </div>
                    <div className="text-sm font-medium truncate mt-0.5">{b.client}</div>
                    <div className="text-[11px] text-muted-foreground">criado em {b.createdAt}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display font-bold text-sm">{fmt(b.value)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 className="font-display font-semibold flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-primary" /> Previsão de fechamento
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Datas que o vendedor previu</p>
              </div>
              <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-xs">
                {([
                  { k: "todos", l: "Todos" },
                  { k: "7d", l: "7 dias" },
                  { k: "30d", l: "30 dias" },
                  { k: "atrasados", l: "Atrasados" },
                ] as const).map((o) => (
                  <button key={o.k} onClick={() => setForecastFilter(o.k)}
                    className={cn("px-2.5 py-1 rounded-md",
                      forecastFilter === o.k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {filteredForecasts.map((f) => {
                const d = new Date(f.expectedClose);
                const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
                const late = diff < 0;
                return (
                  <div key={f.id} className={cn(
                    "p-3 rounded-xl border bg-surface transition-colors",
                    late ? "border-destructive/40 bg-destructive/5" : "border-border hover:border-primary/40",
                  )}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{f.client}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                          <CalendarClock className="h-3 w-3" />
                          {d.toLocaleDateString("pt-BR")}
                          {late ? (
                            <span className="text-destructive font-semibold">· atrasado {Math.abs(diff)}d</span>
                          ) : (
                            <span>· em {diff}d</span>
                          )}
                          <span>· {f.probability}% prob.</span>
                        </div>
                        {f.note && <div className={cn("text-[11px] mt-1", late ? "text-destructive" : "text-muted-foreground")}>{f.note}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-display font-bold text-sm">{fmt(f.value)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredForecasts.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">Nenhuma previsão nesse período.</div>
              )}
            </div>
          </div>
        </div>

        {/* Plano Fidelidade — Em breve */}
        <div className="relative glass rounded-2xl p-6 overflow-hidden">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-[oklch(0.62_0.22_30)] flex items-center justify-center">
              <Gift className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-display font-semibold">Plano Fidelidade 2P</h3>
              <p className="text-xs text-muted-foreground">Acompanhe seus pontos e brindes disponíveis para clientes</p>
            </div>
          </div>
          <div className="relative">
            <div className="grid md:grid-cols-4 gap-3 select-none pointer-events-none">
              {[
                { l: "Pontos disponíveis", v: "12.840" },
                { l: "Faturamento elegível", v: "R$ 482k" },
                { l: "Brindes resgatados", v: "8" },
                { l: "Próximo nível", v: "+R$ 60k" },
              ].map((c) => (
                <div key={c.l} className="rounded-xl bg-surface-2 p-4">
                  <div className="text-[11px] text-muted-foreground">{c.l}</div>
                  <div className="font-display font-bold text-xl mt-1">{c.v}</div>
                </div>
              ))}
            </div>
            <div className="absolute inset-0 backdrop-blur-md bg-background/40 flex items-center justify-center rounded-xl">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-background/80 border border-border shadow-lg">
                <Lock className="h-4 w-4 text-primary" />
                <span className="font-display font-semibold text-sm">Em breve</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function MiniKpi({ label, value, sub, trend }: { label: string; value: string; sub: string; trend?: number }) {
  const up = (trend ?? 0) >= 0;
  return (
    <div className="rounded-xl bg-surface-2 p-3.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-lg mt-1">{value}</div>
      <div className="flex items-center gap-1.5 mt-1">
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

function ChartCard({ title, series, valueKey, valueColor, valueLabel }: {
  title: string;
  series: Array<Record<string, number | string | null>>;
  valueKey: string;
  valueColor: string;
  valueLabel: string;
}) {
  return (
    <div className="rounded-xl bg-surface-2/50 border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-display font-semibold text-sm">{title}</h4>
        <div className="flex gap-3 text-[11px]">
          <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 border-t border-dashed" style={{ borderColor: C.projected }} /><span className="text-muted-foreground">Projetado</span></span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5" style={{ background: valueColor }} /><span className="text-muted-foreground">{valueLabel}</span></span>
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
            <defs>
              <linearGradient id={`g-${valueKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={valueColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={valueColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="day" stroke={C.axis} fontSize={10} tickLine={false} axisLine={false} interval={4} />
            <YAxis stroke={C.axis} fontSize={10} tickLine={false} axisLine={false} width={50} tickFormatter={(v) => fmtShort(v as number)} />
            <Tooltip
              contentStyle={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--chart-tooltip-border)", borderRadius: 10, fontSize: 12, color: "var(--foreground)" }}
              formatter={(v: number) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }))}
            />
            <Area type="monotone" dataKey="projected" name="Projetado" stroke={C.projected} strokeDasharray="4 4" fill="none" strokeWidth={1.5} />
            <Area type="monotone" dataKey={valueKey} name={valueLabel} stroke={valueColor} fill={`url(#g-${valueKey})`} strokeWidth={2.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
