import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { clients, portfolio, atlasInsights, tasks as mockTasks, generationSeries, salesSeries } from "@/lib/mock-data";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowUpRight, Sparkles, Target, AlertTriangle, Clock,
  TrendingUp, CheckCircle2, Calendar, Info, ChevronDown,
  FileText, CalendarClock, Gift, Lock, Users as UsersIcon, Loader2,
  CalendarIcon, MessageSquare, Check, Plus,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  getSalesforceTasks,
  getSalesforceSalespeople,
  getSalesforceOpportunities,
  getSalesforceForecasts,
  getSalesforceVendas,
  completeSalesforceTask,
  createSalesforceTask,
  logSalesforceInteraction,
  opportunityStages,
  type OpportunityStage,
  type SalesforceOpportunity,
  type SalesforceTask,
} from "@/lib/salesforce.functions";
import { getMonthGoalTotal } from "@/lib/admin.functions";

type TaskInteractionState = { contacted: "yes" | "no"; note?: string; ts: number };
const TASK_INTERACTIONS_KEY = "portal2p:task-interactions:v1";
function loadTaskInteractions(): Record<string, TaskInteractionState> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(TASK_INTERACTIONS_KEY) || "{}");
  } catch {
    return {};
  }
}
function persistTaskInteractions(map: Record<string, TaskInteractionState>) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(TASK_INTERACTIONS_KEY, JSON.stringify(map)); } catch {}
}




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
  generation: "oklch(0.55 0.2 250)",
  sales: "var(--primary)",
};

const STAGE_COLOR: Record<OpportunityStage, string> = {
  "Projeto Fechado": "bg-success/15 text-success",
  "Projeto Não Fechado": "bg-destructive/15 text-destructive",
  "Estoque": "bg-[color:var(--atlas)]/15 text-[color:var(--atlas)]",
  "Em Negociação": "bg-warning/20 text-[color:var(--warning)]",
};

function fmtKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}


function HomePage() {
  const { profile, user } = useAuth();
  const displayName = (profile?.full_name?.trim().split(/\s+/)[0]) || (user?.email?.split("@")[0]) || "";
  const [metaOpen, setMetaOpen] = useState(false);
  const [forecastFilter, setForecastFilter] = useState<"todos" | "7d" | "30d" | "atrasados">("todos");
  const [ownerId, setOwnerId] = useState<string>("all");
  const [agendaDate, setAgendaDate] = useState<Date>(() => startOfDay(new Date()));
  const [agendaOpen, setAgendaOpen] = useState(false);

  const [stageFilter, setStageFilter] = useState<"all" | OpportunityStage>("all");

  const ownerParam = ownerId === "all" ? null : ownerId;

  // ---- Server data ----
  const fetchSalespeople = useServerFn(getSalesforceSalespeople);
  const peopleQ = useQuery({
    queryKey: ["sf-salespeople"],
    queryFn: () => fetchSalespeople(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const salespeople = peopleQ.data?.records ?? [];

  const fetchTasks = useServerFn(getSalesforceTasks);
  const today = useMemo(() => new Date(), []);
  const agendaRangeParams = useMemo(() => {
    const key = fmtKey(agendaDate);
    return { start: key, end: key };
  }, [agendaDate]);


  const tasksQ = useQuery({
    queryKey: ["sf-home-tasks", agendaRangeParams.start, agendaRangeParams.end, ownerParam],
    queryFn: () => fetchTasks({ data: { ...agendaRangeParams, ownerId: ownerParam } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const sfTasks = tasksQ.data?.records ?? [];

  // Interação por tarefa (persistida localmente) — "Consegui falar" / "Não consegui falar"
  const queryClient = useQueryClient();
  const [taskInteractions, setTaskInteractions] = useState<Record<string, TaskInteractionState>>(() => loadTaskInteractions());
  const setTaskInteraction = (taskId: string, s: TaskInteractionState | null) => {
    setTaskInteractions((prev) => {
      const next = { ...prev };
      if (s === null) delete next[taskId];
      else next[taskId] = s;
      persistTaskInteractions(next);
      return next;
    });
  };
  const [interactionTask, setInteractionTask] = useState<SalesforceTask | null>(null);
  const [completeTask, setCompleteTask] = useState<SalesforceTask | null>(null);



  const fetchOpps = useServerFn(getSalesforceOpportunities);
  const oppsQ = useQuery({
    queryKey: ["sf-home-opps", ownerParam],
    queryFn: () => fetchOpps({ data: { ownerId: ownerParam } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const opps: SalesforceOpportunity[] = oppsQ.data?.records ?? [];
  const filteredOpps = stageFilter === "all" ? opps : opps.filter((o) => o.stage === stageFilter);
  const oppsTotal = filteredOpps.reduce((a, b) => a + (b.amount ?? 0), 0);

  const fetchForecasts = useServerFn(getSalesforceForecasts);
  const forecastsQ = useQuery({
    queryKey: ["sf-home-forecasts", ownerParam],
    queryFn: () => fetchForecasts({ data: { ownerId: ownerParam } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const forecasts: SalesforceOpportunity[] = forecastsQ.data?.records ?? [];
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const filteredForecasts = forecasts.filter((f) => {
    if (!f.forecastDate) return false;
    const d = new Date(f.forecastDate + "T00:00:00");
    const diff = Math.round((d.getTime() - todayStart.getTime()) / 86400000);
    if (forecastFilter === "7d") return diff >= 0 && diff <= 7;
    if (forecastFilter === "30d") return diff >= 0 && diff <= 30;
    if (forecastFilter === "atrasados") return diff < 0;
    return true;
  });

  // ---- Meta do mês atual (do banco) ----
  const fetchMonthGoal = useServerFn(getMonthGoalTotal);
  const monthGoalQ = useQuery({
    queryKey: ["month-goal", today.getFullYear(), today.getMonth() + 1, ownerParam],
    queryFn: () =>
      fetchMonthGoal({
        data: {
          year: today.getFullYear(),
          month: today.getMonth() + 1,
          ownerId: ownerParam,
        },
      }),
    staleTime: 60_000,
  });
  const dbGoal = monthGoalQ.data?.total ?? 0;

  // ---- Vendido do mês (Salesforce: Opportunity StageName = 'Pedido Concluído') ----
  const monthRange = useMemo(() => {
    const y = today.getFullYear();
    const m = today.getMonth();
    return { start: fmtKey(new Date(y, m, 1)), end: fmtKey(new Date(y, m + 1, 0)) };
  }, [today]);
  const fetchVendas = useServerFn(getSalesforceVendas);
  const vendasQ = useQuery({
    queryKey: ["sf-home-vendas", monthRange.start, monthRange.end],
    queryFn: () => fetchVendas({ data: monthRange }),
    staleTime: 60_000,
  });
  const sold = useMemo(() => {
    const recs = vendasQ.data?.records ?? [];
    return recs
      .filter((r) => ownerParam == null || r.ownerId === ownerParam)
      .reduce((a, r) => a + (r.total ?? r.amount ?? 0), 0);
  }, [vendasQ.data, ownerParam]);

  // ---- Mock (mantidos para projetado) ----
  const goal = dbGoal;
  const achieved = sold;
  const projected = portfolio.projected;
  const goalPct = goal > 0 ? (sold / goal) * 100 : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const taskClientNames = new Set(mockTasks.map((t) => t.client));
  const offRadarInsights = atlasInsights.filter((i) => !i.client || !taskClientNames.has(i.client));

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-6">
        {/* Hero + filtro global de vendedor */}
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-sm text-muted-foreground">{greeting}{displayName ? `, ${displayName}` : ""}</div>
            <h1 className="text-3xl md:text-4xl font-bold mt-1">
              Você está em <span className="text-foreground">{goalPct.toFixed(1)}%</span> da meta do mês
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Atlas identificou {atlasInsights.length} ações que podem destravar R$ 104k esta semana.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border">
              <UsersIcon className="h-4 w-4 text-primary" />
              <label className="text-xs text-muted-foreground">Vendedor</label>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="bg-transparent text-sm font-medium outline-none pr-1 max-w-[220px]"
                disabled={peopleQ.isLoading}
              >
                <option value="all">Todos</option>
                {salespeople.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {peopleQ.isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>
          </div>
        </div>

        {/* Meta */}
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
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MiniKpi label="Retenção" value={`${portfolio.retentionActive} / ${portfolio.retentionBase}`} sub={`${portfolio.retention.toFixed(1)}% da carteira ativa`} />
                <MiniKpi label="Recorrência" value={`${portfolio.recurrenceCount} / ${portfolio.recurrenceBase}`} sub={`${portfolio.recurrence.toFixed(1)}% dos clientes`} />
                <MiniKpi label="Novos recorrentes" value={`${portfolio.newRecurringClients}`} sub="Clientes no mês" />
                <MiniKpi label="Ticket médio" value="R$ 18,27k" sub="3M: R$ 20,68k" trend={-11.6} />
                <MiniKpi label="Conversão R$" value="25,63%" sub="3M: 31,44%" trend={-5.8} />
                <MiniKpi label="Conversão Qtd" value="21,21%" sub="3M: 33,52%" trend={-12.3} />
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                <ChartCard title="Geração — Projetado × Realizado" series={generationSeries} valueKey="generated" valueColor={C.generation} valueLabel="Gerado" />
                <ChartCard title="Vendas — Projetado × Realizado" series={salesSeries} valueKey="sold" valueColor={C.sales} valueLabel="Vendido" />
              </div>
            </div>
          )}
        </div>

        {/* Seção: Operação */}
        <div>
          <div className="flex items-end justify-between mb-3">
            <div>
              <h2 className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-semibold">Operação do dia</h2>
              <h3 className="font-display font-bold text-xl mt-1">Tarefas & Sugestões</h3>
            </div>
          </div>
        </div>

        {/* Agenda + Atlas Radar */}
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="glass rounded-2xl p-5">
            <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
              <div>
                <h3 className="font-display font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" /> Agenda de hoje
                  {tasksQ.isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tarefas em aberto do Salesforce
                </p>
              </div>
              <Popover open={agendaOpen} onOpenChange={setAgendaOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {fmtKey(agendaDate) === fmtKey(today)
                      ? "Hoje"
                      : agendaDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <CalendarPicker
                    mode="single"
                    selected={agendaDate}
                    defaultMonth={agendaDate}
                    onSelect={(d) => {
                      if (d) {
                        setAgendaDate(startOfDay(d));
                        setAgendaOpen(false);
                      }
                    }}
                    disabled={{ before: startOfDay(today) }}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>

            </div>
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {tasksQ.isLoading && (
                <div className="text-center text-sm text-muted-foreground py-8">Carregando…</div>
              )}
              {!tasksQ.isLoading && sfTasks.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  Nenhuma tarefa em aberto no período.
                </div>
              )}
              {sfTasks.map((t) => {
                const inter = taskInteractions[t.id] ?? null;
                return (
                <div key={t.id} className="rounded-xl border border-border bg-surface p-3.5 hover:border-primary/40 transition-colors">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => setCompleteTask(t)}
                      title="Concluir tarefa"
                      className="mt-0.5 h-5 w-5 rounded-full border-2 border-border hover:border-primary flex items-center justify-center shrink-0 group"
                    >
                      <CheckCircle2 className="h-3 w-3 text-primary opacity-0 group-hover:opacity-80" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                            {t.subject}
                            {inter && (
                              <span
                                title={inter.contacted === "yes" ? "Falou com o cliente" : "Não conseguiu falar"}
                                className={cn(
                                  "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                                  inter.contacted === "yes"
                                    ? "bg-success/15 text-success"
                                    : "bg-warning/20 text-[color:var(--warning)]",
                                )}
                              >
                                <Check className="h-2.5 w-2.5" />
                                {inter.contacted === "yes" ? "Falou" : "Não falou"}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {t.what ?? t.who ?? t.owner ?? "—"}
                          </div>
                        </div>
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded shrink-0 flex items-center gap-1",
                          t.priority?.toLowerCase().startsWith("alt") ? "bg-destructive/15 text-destructive" :
                          t.priority?.toLowerCase().startsWith("baix") ? "bg-surface-2 text-muted-foreground" :
                          "bg-warning/20 text-[color:var(--warning)]",
                        )}>
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(t.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                        </span>
                      </div>
                      {t.owner && (
                        <div className="text-[11px] text-muted-foreground mt-1">Responsável: {t.owner}</div>
                      )}
                      <div className="flex gap-1.5 mt-2.5">
                        <button
                          onClick={() => setInteractionTask(t)}
                          className="text-[11px] px-2 py-1 rounded bg-surface-2 hover:bg-primary/15 hover:text-primary text-muted-foreground flex items-center gap-1"
                        >
                          <MessageSquare className="h-3 w-3" /> Interação
                        </button>
                        <button
                          onClick={() => setCompleteTask(t)}
                          className="text-[11px] px-2 py-1 rounded bg-surface-2 hover:bg-success/15 hover:text-success text-muted-foreground flex items-center gap-1"
                        >
                          <Check className="h-3 w-3" /> Concluir
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );})}
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Atlas radar
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Clientes com sinais de oportunidade ou risco</p>
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
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Seção: Pipeline */}
        <div>
          <div className="flex items-end justify-between mb-3">
            <div>
              <h2 className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-semibold">Pipeline comercial</h2>
              <h3 className="font-display font-bold text-xl mt-1">Orçamentos & Previsões de Fechamento</h3>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Orçamentos */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
              <div>
                <h3 className="font-display font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Orçamentos
                  {oppsQ.isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filteredOpps.length} oportunidade(s) · {fmt(oppsTotal)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3 text-xs">
              <button
                onClick={() => setStageFilter("all")}
                className={cn(
                  "px-2.5 py-1 rounded-md border",
                  stageFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 border-border text-muted-foreground",
                )}
              >
                Todas
              </button>
              {opportunityStages.map((s) => (
                <button
                  key={s}
                  onClick={() => setStageFilter(s)}
                  className={cn(
                    "px-2.5 py-1 rounded-md border",
                    stageFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 border-border text-muted-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {oppsQ.isLoading && (
                <div className="text-center text-sm text-muted-foreground py-8">Carregando…</div>
              )}
              {!oppsQ.isLoading && filteredOpps.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">Nenhuma oportunidade.</div>
              )}
              {filteredOpps.map((b) => (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface hover:border-primary/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", STAGE_COLOR[b.stage as OpportunityStage] ?? "bg-surface-2 text-muted-foreground")}>{b.stage}</span>
                      {b.owner && <span className="text-[10px] text-muted-foreground">· {b.owner}</span>}
                    </div>
                    <div className="text-sm font-medium truncate mt-0.5">{b.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{b.account ?? "—"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display font-bold text-sm">{b.amount != null ? fmt(b.amount) : "—"}</div>
                    {b.closeDate && (
                      <div className="text-[10px] text-muted-foreground">{new Date(b.closeDate + "T00:00:00").toLocaleDateString("pt-BR")}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Previsão de fechamento */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 className="font-display font-semibold flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-primary" /> Previsão de fechamento
                  {forecastsQ.isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Oportunidades em aberto com previsão preenchida</p>
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
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {forecastsQ.isLoading && (
                <div className="text-center text-sm text-muted-foreground py-8">Carregando…</div>
              )}
              {!forecastsQ.isLoading && filteredForecasts.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">Nenhuma previsão nesse período.</div>
              )}
              {filteredForecasts.map((f) => {
                const d = new Date(f.forecastDate! + "T00:00:00");
                const diff = Math.round((d.getTime() - todayStart.getTime()) / 86400000);
                const late = diff < 0;
                return (
                  <div key={f.id} className={cn(
                    "p-3 rounded-xl border bg-surface transition-colors",
                    late ? "border-destructive/40 bg-destructive/5" : "border-border hover:border-primary/40",
                  )}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{f.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{f.account ?? "—"}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-1 flex-wrap">
                          <CalendarClock className="h-3 w-3" />
                          {d.toLocaleDateString("pt-BR")}
                          {late ? (
                            <span className="text-destructive font-semibold">· atrasado {Math.abs(diff)}d</span>
                          ) : (
                            <span>· em {diff}d</span>
                          )}
                          {f.probability != null && <span>· {f.probability}% prob.</span>}
                          <span className={cn("px-1.5 py-0.5 rounded", STAGE_COLOR[f.stage as OpportunityStage] ?? "bg-surface-2")}>{f.stage}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-display font-bold text-sm">{f.amount != null ? fmt(f.amount) : "—"}</div>
                        {f.owner && <div className="text-[10px] text-muted-foreground">{f.owner}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Plano Fidelidade — Em breve */}
        <div className="relative glass rounded-2xl p-8 overflow-hidden">
          <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.62_0.22_30)] flex items-center justify-center shadow-lg">
                <Gift className="h-7 w-7 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-display font-bold text-xl">Plano Fidelidade 2P</h3>
                <p className="text-sm text-muted-foreground mt-1">Acompanhe seus pontos, faturamento elegível e brindes disponíveis para presentear seus clientes.</p>
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="grid md:grid-cols-4 gap-4 select-none pointer-events-none">
              {[
                { l: "Pontos disponíveis", v: "12.840", s: "Atualizado hoje" },
                { l: "Faturamento elegível", v: "R$ 482k", s: "Acumulado 2026" },
                { l: "Brindes resgatados", v: "8", s: "Nos últimos 90 dias" },
                { l: "Próximo nível", v: "+R$ 60k", s: "Para nível Prata" },
              ].map((c) => (
                <div key={c.l} className="rounded-xl bg-surface-2 p-5">
                  <div className="text-xs text-muted-foreground">{c.l}</div>
                  <div className="font-display font-bold text-2xl mt-2">{c.v}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{c.s}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid md:grid-cols-3 gap-4 select-none pointer-events-none">
              {[
                { l: "Brinde disponível", v: "Kit Limpeza Premium", s: "Custo: 2.400 pts" },
                { l: "Brinde disponível", v: "Voucher Distribuidor", s: "Custo: 4.000 pts" },
                { l: "Brinde disponível", v: "Viagem técnica 2P", s: "Custo: 10.000 pts" },
              ].map((c, idx) => (
                <div key={idx} className="rounded-xl bg-surface-2 p-5 border border-border">
                  <div className="text-xs text-muted-foreground">{c.l}</div>
                  <div className="font-display font-bold text-lg mt-1">{c.v}</div>
                  <div className="text-[11px] text-primary mt-1 font-medium">{c.s}</div>
                </div>
              ))}
            </div>
            <div className="absolute inset-0 backdrop-blur-md bg-background/40 flex items-center justify-center rounded-xl">
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-background/80 border border-border shadow-lg">
                <Lock className="h-4 w-4 text-primary" />
                <span className="font-display font-semibold text-sm">Em breve</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <InteractionQuickDialog
        task={interactionTask}
        existing={interactionTask ? taskInteractions[interactionTask.id] ?? null : null}
        onClose={() => setInteractionTask(null)}
        onSaved={(state) => {
          if (interactionTask) setTaskInteraction(interactionTask.id, state);
          setInteractionTask(null);
        }}
      />

      <CompleteTaskDialog
        task={completeTask}
        existing={completeTask ? taskInteractions[completeTask.id] ?? null : null}
        onClose={() => setCompleteTask(null)}
        onSaveInteraction={(state) => {
          if (completeTask) setTaskInteraction(completeTask.id, state);
        }}
        onDone={() => {
          if (completeTask) setTaskInteraction(completeTask.id, null);
          setCompleteTask(null);
          queryClient.invalidateQueries({ queryKey: ["sf-home-tasks"] });
        }}
      />

    </AppLayout>
  );
}

const INTERACTION_TYPES = ["Ligação", "E-mail", "Reunião", "Visita", "WhatsApp", "Outro"] as const;
const TASK_TYPES = ["Ligação", "E-mail", "Reunião", "Visita", "Follow-up", "Outro"] as const;
const PRIORITIES = ["Alta", "Normal", "Baixa"] as const;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function InteractionQuickDialog({
  task,
  onClose,
  onDone,
}: {
  task: SalesforceTask | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const logInteraction = useServerFn(logSalesforceInteraction);
  const [subject, setSubject] = useState("");
  const [type, setType] = useState<string>("Ligação");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (task) {
      setSubject(`Interação — ${task.what ?? task.who ?? task.subject}`);
      setType("Ligação");
      setDescription("");
    }
  }, [task?.id]);

  const submit = async () => {
    if (!task) return;
    setSaving(true);
    try {
      await logInteraction({
        data: {
          subject,
          type,
          description,
          whatId: task.whatId,
          whoId: task.whoId,
          ownerId: task.ownerId,
        },
      });
      toast.success("Interação registrada no Salesforce.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar interação.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar interação</DialogTitle>
          <DialogDescription>
            {task?.what ?? task?.who ?? "Registrar interação no Salesforce"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Assunto</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INTERACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Comentários</Label>
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !subject.trim()}>
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteTaskDialog({
  task,
  hasInteraction,
  onClose,
  onDone,
}: {
  task: SalesforceTask | null;
  hasInteraction: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const completeFn = useServerFn(completeSalesforceTask);
  const createFn = useServerFn(createSalesforceTask);
  const logFn = useServerFn(logSalesforceInteraction);

  const [logNow, setLogNow] = useState(false);
  const [interactionType, setInteractionType] = useState<string>("Ligação");
  const [interactionNote, setInteractionNote] = useState("");

  const [createNext, setCreateNext] = useState(true);
  const [subject, setSubject] = useState("");
  const [type, setType] = useState<string>("Follow-up");
  const [priority, setPriority] = useState<string>("Normal");
  const [date, setDate] = useState<string>(todayKey());
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (task) {
      setLogNow(!hasInteraction);
      setInteractionType("Ligação");
      setInteractionNote("");
      setCreateNext(true);
      setSubject(`Follow-up — ${task.what ?? task.who ?? task.subject}`);
      setType("Follow-up");
      setPriority(task.priority ?? "Normal");
      const d = new Date();
      d.setDate(d.getDate() + 7);
      setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      setDescription("");
    }
  }, [task?.id]);

  const submit = async () => {
    if (!task) return;
    setSaving(true);
    try {
      if (logNow && interactionNote.trim().length + interactionType.length > 0) {
        await logFn({
          data: {
            subject: `Interação — ${task.what ?? task.who ?? task.subject}`,
            type: interactionType,
            description: interactionNote,
            whatId: task.whatId,
            whoId: task.whoId,
            ownerId: task.ownerId,
          },
        });
      }
      await completeFn({ data: { taskId: task.id } });
      if (createNext && subject.trim()) {
        await createFn({
          data: {
            subject,
            type,
            priority,
            activityDate: date,
            description,
            whatId: task.whatId,
            whoId: task.whoId,
            ownerId: task.ownerId,
          },
        });
      }
      toast.success("Tarefa concluída no Salesforce.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao concluir tarefa.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" /> Concluir tarefa
          </DialogTitle>
          <DialogDescription>
            {task?.subject} — {task?.what ?? task?.who ?? "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-primary" /> Registrar interação
              </div>
              {hasInteraction && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success font-medium flex items-center gap-1">
                  <Check className="h-2.5 w-2.5" /> Já registrada
                </span>
              )}
              <label className="text-xs flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={logNow} onChange={(e) => setLogNow(e.target.checked)} />
                Registrar agora
              </label>
            </div>
            {logNow && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={interactionType} onValueChange={setInteractionType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INTERACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Comentários</Label>
                  <Textarea rows={3} value={interactionNote} onChange={(e) => setInteractionNote(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Plus className="h-3.5 w-3.5 text-primary" /> Nova tarefa
              </div>
              <label className="text-xs flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={createNext} onChange={(e) => setCreateNext(e.target.checked)} />
                Criar próxima
              </label>
            </div>
            {createNext && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Assunto</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TASK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Prioridade</Label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Vencimento</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Comentários</Label>
                  <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Relacionada a: {task?.what ?? task?.who ?? "—"}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Concluir tarefa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
