import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { ViewSlot } from "@/components/view-slot";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

// Lazy-load recharts (~90KB gz) so it doesn't block the home dashboard's initial paint.
const HomeAreaChart = lazy(() => import("@/components/home-area-chart"));
import {
  ArrowDownRight, ArrowUpRight, Sparkles, Target, AlertTriangle, Clock,
  TrendingUp, CheckCircle2, Calendar, Info, ChevronDown,
  FileText, CalendarClock, Gift, Lock, Users as UsersIcon, Loader2,
  CalendarIcon, MessageSquare, Check, Plus, ArrowUpDown, CalendarPlus,
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
import { VendedorFilter } from "@/components/vendedor-filter";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useScopedOwner } from "@/hooks/use-seller-scope";
import {
  getSalesforceTasks,
  getSalesforceSalespeople,
  getSalesforceOpportunities,
  getSalesforceForecasts,
  getSalesforceVendas,
  getSalesforceVendidoMesAtual,
  getSalesforceOrcamentos,
  getSalesforceAccounts,
  OPP_DEFAULTS_VENDIDO_MES,
  OPP_DEFAULTS_GERADO_MES,
  completeSalesforceTask,
  createSalesforceTask,
  logSalesforceInteraction,
  rescheduleSalesforceTask,
  opportunityStages,
  type OpportunityStage,
  type SalesforceOpportunity,
  type SalesforceTask,
  type SalesforceAccount,
} from "@/lib/salesforce.functions";

import { getMonthGoalTotal } from "@/lib/admin.functions";
import { listRetentionGoals } from "@/lib/goals.functions";
import { CARTEIRA_OWNER_IDS } from "@/lib/salespeople";
import { businessDaysOfMonth } from "@/lib/business-days";

type TaskInteractionState = { contacted: "yes" | "no"; type?: string; note?: string; ts: number };
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

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const META_YEARS = [2025, 2026, 2027];

function fmtKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function buildAtlasSuggestion(
  _t: SalesforceTask,
  _inter: TaskInteractionState | null,
  _todayStart: Date,
): string | null {
  return null;
}





function HomePage() {
  const { profile, user } = useAuth();
  const displayName = (profile?.full_name?.trim().split(/\s+/)[0]) || (user?.email?.split("@")[0]) || "";
  const [metaOpen, setMetaOpen] = useState(false);
  type AgeKey = "all" | "7d" | "15-30" | "30-60" | "60+";
  type ForecastKey = AgeKey | "semana" | "atrasados";
  const [forecastFilter, setForecastFilter] = useState<ForecastKey>("all");
  const [oppsAgeFilter, setOppsAgeFilter] = useState<AgeKey>("all");

  const { ownerId, setOwnerId, ownerParam, dataEnabled } = useScopedOwner("all");
  const [agendaDate, setAgendaDate] = useState<Date>(() => startOfDay(new Date()));
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [agendaSort, setAgendaSort] = useState<"priority" | "date">("date");
  const [agendaSortDir, setAgendaSortDir] = useState<"asc" | "desc">("asc");
  const [agendaSortOpen, setAgendaSortOpen] = useState(false);

  const [stageFilter, setStageFilter] = useState<"all" | OpportunityStage>("all");

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

  // ---- Filtro de meses das metas (múltipla seleção, mês + ano juntos) ----
  const monthKey = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;
  const [metaMonths, setMetaMonths] = useState<string[]>(() => {
    const n = new Date();
    return [`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`];
  });
  const metaMonthParts = useMemo(
    () =>
      [...metaMonths].sort().map((k) => {
        const [y, m] = k.split("-").map(Number);
        return { key: k, y, m: m - 1 };
      }),
    [metaMonths],
  );
  const currentMonthKey = monthKey(today.getFullYear(), today.getMonth());
  const isCurrentMetaMonth = metaMonthParts.length === 1 && metaMonthParts[0].key === currentMonthKey;
  const metaLabel = metaMonthParts.length
    ? metaMonthParts.map((p) => `${MONTH_NAMES[p.m].slice(0, 3)}/${p.y}`).join(", ")
    : "Selecionar meses";
  const toggleMetaMonth = (k: string) =>
    setMetaMonths((prev) =>
      prev.includes(k) ? (prev.length > 1 ? prev.filter((x) => x !== k) : prev) : [...prev, k],
    );
  const metaRange = useMemo(() => {
    const first = metaMonthParts[0] ?? { y: today.getFullYear(), m: today.getMonth() };
    const last = metaMonthParts[metaMonthParts.length - 1] ?? first;
    return {
      dateLiteral: "CUSTOM" as const,
      dateFrom: fmtKey(new Date(first.y, first.m, 1)),
      dateTo: fmtKey(new Date(last.y, last.m + 1, 0)),
    };
  }, [metaMonthParts, today]);
  /** Último dia considerado "decorrido" em um mês */
  const elapsedDayFor = (y: number, m: number) => {
    if (y === today.getFullYear() && m === today.getMonth()) return today.getDate();
    if (y > today.getFullYear() || (y === today.getFullYear() && m > today.getMonth())) return 0;
    return new Date(y, m + 1, 0).getDate();
  };

  const agendaRangeParams = useMemo(() => {
    const key = fmtKey(agendaDate);
    const isToday = key === fmtKey(today);
    // Quando "Hoje" está selecionado, incluir também tarefas atrasadas (em aberto e vencidas).
    return { start: isToday ? "1970-01-01" : key, end: key };
  }, [agendaDate, today]);


  const tasksQ = useQuery({
    queryKey: ["sf-home-tasks", agendaRangeParams.start, agendaRangeParams.end, ownerParam],
    queryFn: () => fetchTasks({ data: { ...agendaRangeParams, ownerId: ownerParam } }),
    enabled: dataEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const sfTasksRaw = tasksQ.data?.records ?? [];
  const sfTasks = useMemo(() => {
    const prioRank = (p: string | null | undefined) => {
      const v = (p ?? "").toLowerCase();
      if (v.startsWith("alt")) return 0;
      if (v.startsWith("baix")) return 2;
      return 1;
    };
    const arr = [...sfTasksRaw];
    if (agendaSort === "priority") {
      arr.sort((a, b) => prioRank(a.priority) - prioRank(b.priority) || a.date.localeCompare(b.date));
    } else {
      arr.sort((a, b) => a.date.localeCompare(b.date) || prioRank(a.priority) - prioRank(b.priority));
    }
    if (agendaSortDir === "desc") arr.reverse();
    return arr;
  }, [sfTasksRaw, agendaSort, agendaSortDir]);

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
  const [rescheduleTask, setRescheduleTask] = useState<SalesforceTask | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);



  const fetchOpps = useServerFn(getSalesforceOpportunities);
  const oppsQ = useQuery({
    queryKey: ["sf-home-opps", ownerParam],
    queryFn: () => fetchOpps({ data: { ownerId: ownerParam } }),
    enabled: dataEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const opps: SalesforceOpportunity[] = oppsQ.data?.records ?? [];
  const ageMatches = (createdISO: string | null, key: AgeKey) => {
    if (key === "all") return true;
    if (!createdISO) return false;
    const created = new Date(createdISO + "T00:00:00");
    const ageDays = Math.floor((todayStartRef.getTime() - created.getTime()) / 86400000);
    if (key === "7d") return ageDays <= 7;
    if (key === "15-30") return ageDays >= 15 && ageDays <= 30;
    if (key === "30-60") return ageDays > 30 && ageDays <= 60;
    if (key === "60+") return ageDays > 60;
    return true;
  };
  const todayStartRef = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const filteredOpps = (stageFilter === "all" ? opps : opps.filter((o) => o.stage === stageFilter))
    .filter((o) => ageMatches(o.createdDate, oppsAgeFilter))
    .slice()
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  const oppsTotal = filteredOpps.reduce((a, b) => a + (b.amount ?? 0), 0);

  const fetchForecasts = useServerFn(getSalesforceForecasts);
  const forecastsQ = useQuery({
    queryKey: ["sf-home-forecasts", ownerParam],
    queryFn: () => fetchForecasts({ data: { ownerId: ownerParam } }),
    enabled: dataEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const forecasts: SalesforceOpportunity[] = forecastsQ.data?.records ?? [];
  const todayStart = todayStartRef;
  // Início da semana atual (segunda) e fim (domingo)
  const weekStart = new Date(todayStart);
  const dow = (weekStart.getDay() + 6) % 7; // 0 = segunda
  weekStart.setDate(weekStart.getDate() - dow);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const filteredForecasts = forecasts
    .filter((f) => {
      if (forecastFilter === "semana") {
        if (!f.forecastDate) return false;
        const d = new Date(f.forecastDate + "T00:00:00");
        return d.getTime() >= weekStart.getTime() && d.getTime() <= weekEnd.getTime();
      }
      if (forecastFilter === "atrasados") {
        if (!f.forecastDate) return false;
        const d = new Date(f.forecastDate + "T00:00:00");
        return d.getTime() < todayStart.getTime();
      }
      return ageMatches(f.createdDate, forecastFilter);
    })
    .slice()
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));


  // ---- Meta dos meses selecionados (do banco) ----
  const fetchMonthGoal = useServerFn(getMonthGoalTotal);
  const monthGoalQs = useQueries({
    queries: metaMonthParts.map((p) => ({
      queryKey: ["month-goal", p.y, p.m + 1, ownerParam],
      queryFn: () =>
        fetchMonthGoal({ data: { year: p.y, month: p.m + 1, ownerId: ownerParam } }),
      enabled: dataEnabled,
      staleTime: 60_000,
    })),
  });
  const goalByMonth: Record<string, number> = {};
  metaMonthParts.forEach((p, i) => {
    goalByMonth[p.key] = monthGoalQs[i]?.data?.total ?? 0;
  });
  const dbGoal = metaMonthParts.reduce((a, p) => a + (goalByMonth[p.key] ?? 0), 0);

  // ---- Vendido do mês (mesma lógica de Administrador > Tabelas > "Vendido - Mês Atual") ----
  const monthRange = useMemo(
    () => ({ start: metaRange.dateFrom, end: metaRange.dateTo }),
    [metaRange],
  );
  const fetchVendas = useServerFn(getSalesforceVendas);
  const fetchVendidoMes = useServerFn(getSalesforceVendidoMesAtual);
  const vendidoMesQ = useQuery({
    queryKey: ["sf-home-vendido-mes", ownerParam, metaRange.dateFrom, metaRange.dateTo],
    queryFn: () =>
      fetchVendidoMes({
        data: { ...OPP_DEFAULTS_VENDIDO_MES, ...metaRange, ownerId: ownerParam },
      }),
    enabled: dataEnabled,
    staleTime: 60_000,
  });
  const geradoMesQ = useQuery({
    queryKey: ["sf-home-gerado-mes", ownerParam, metaRange.dateFrom, metaRange.dateTo],
    queryFn: () =>
      fetchVendidoMes({
        data: { ...OPP_DEFAULTS_GERADO_MES, ...metaRange, ownerId: ownerParam },
      }),
    enabled: dataEnabled,
    staleTime: 60_000,
  });

  const sold = useMemo(() => {
    const recs = vendidoMesQ.data?.records ?? [];
    return recs
      .filter((r) => ownerParam == null || r.ownerId === ownerParam)
      .reduce((a, r) => a + (r.total ?? r.amount ?? 0), 0);
  }, [vendidoMesQ.data, ownerParam]);
  const generated = useMemo(() => {
    const recs = geradoMesQ.data?.records ?? [];
    return recs
      .filter((r) => ownerParam == null || r.ownerId === ownerParam)
      .reduce((a, r) => a + (r.total ?? r.amount ?? 0), 0);
  }, [geradoMesQ.data, ownerParam]);

  const goal = dbGoal;
  const achieved = sold;
  // Projetado = soma, por mês selecionado, da meta diária × dias úteis decorridos
  const projected = Math.round(
    metaMonthParts.reduce((acc, p) => {
      const bizDays = businessDaysOfMonth(p.y, p.m);
      if (!bizDays.length) return acc;
      const dailyGoal = (goalByMonth[p.key] ?? 0) / bizDays.length;
      const elapsed = bizDays.filter((d) => d <= elapsedDayFor(p.y, p.m)).length;
      return acc + dailyGoal * elapsed;
    }, 0),
  );
  const goalPct = goal > 0 ? (sold / goal) * 100 : 0;
  const projectedPct = goal > 0 ? (projected / goal) * 100 : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  // Identifica o vendedor SF do usuário logado via email
  const currentUserSfId = useMemo(() => {
    const email = user?.email?.toLowerCase();
    if (!email) return null;
    return salespeople.find((p) => p.email?.toLowerCase() === email)?.id ?? null;
  }, [salespeople, user?.email]);

  const goalSubject = useMemo(() => {
    if (ownerId === "all") return "O time está";
    if (currentUserSfId && ownerId === currentUserSfId) return "Você está";
    const sp = salespeople.find((p) => p.id === ownerId);
    return `${sp?.name ?? "Vendedor"} está`;
  }, [ownerId, currentUserSfId, salespeople]);


  // ---- Série diária: Vendas — Projetado × Realizado (meses selecionados) ----
  // Meta diária = meta do mês / dias úteis do mês (exclui sáb, dom e feriados nacionais).
  const salesChartSeries = useMemo(() => {
    const soldByKey = new Map<string, number>();
    const recs = vendidoMesQ.data?.records ?? [];
    for (const r of recs) {
      if (!r.closeDate) continue;
      if (ownerParam && r.ownerId !== ownerParam) continue;
      const [yr, mo, dd] = r.closeDate.split("-").map(Number);
      const k = `${yr}-${mo}-${dd}`;
      soldByKey.set(k, (soldByKey.get(k) ?? 0) + (r.total ?? r.amount ?? 0));
    }

    let cumProjected = 0;
    let cumSold = 0;
    const out: Array<{ day: string; projected: number; sold: number | null }> = [];
    for (const p of metaMonthParts) {
      const daysInMonth = new Date(p.y, p.m + 1, 0).getDate();
      const bizDays = businessDaysOfMonth(p.y, p.m);
      const bizSet = new Set(bizDays);
      const dailyGoal = bizDays.length ? (goalByMonth[p.key] ?? 0) / bizDays.length : 0;
      const todayDay = elapsedDayFor(p.y, p.m);
      for (let d = 1; d <= daysInMonth; d++) {
        if (bizSet.has(d)) cumProjected += dailyGoal;
        cumSold += soldByKey.get(`${p.y}-${p.m + 1}-${d}`) ?? 0;
        out.push({
          day: `${String(d).padStart(2, "0")}/${String(p.m + 1).padStart(2, "0")}`,
          projected: Math.round(cumProjected),
          sold: d <= todayDay ? Math.round(cumSold) : null,
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendidoMesQ.data, ownerParam, metaMonthParts, JSON.stringify(goalByMonth)]);

  // ---- Conversão / Ticket médio (mês atual x média 3M) ----
  const rangeMulti = useMemo(() => {
    const y = today.getFullYear();
    const m = today.getMonth();
    return {
      start: fmtKey(new Date(y, m - 3, 1)),
      end: fmtKey(new Date(y, m + 1, 0)),
    };
  }, [today]);

  const fetchOrcamentos = useServerFn(getSalesforceOrcamentos);
  const orcQ = useQuery({
    queryKey: ["sf-home-orc-4m", rangeMulti.start, rangeMulti.end, ownerParam],
    queryFn: () => fetchOrcamentos({ data: { ...rangeMulti, ownerId: ownerParam } }),
    enabled: dataEnabled,
    staleTime: 60_000,
  });
  const vendas4Q = useQuery({
    queryKey: ["sf-home-vendas-4m", rangeMulti.start, rangeMulti.end, ownerParam],
    queryFn: () => fetchVendas({ data: { ...rangeMulti, ownerId: ownerParam } }),
    enabled: dataEnabled,
    staleTime: 60_000,
  });

  const conversionKpis = useMemo(() => {
    const y = today.getFullYear();
    const m = today.getMonth();
    type Bkt = { orcVal: number; orcIds: Set<string>; venVal: number; venIds: Set<string> };
    const buckets = new Map<string, Bkt>();
    const bkey = (yy: number, mm: number) => `${yy}-${mm}`;
    for (let i = -3; i <= 0; i++) {
      const d = new Date(y, m + i, 1);
      buckets.set(bkey(d.getFullYear(), d.getMonth()), {
        orcVal: 0, orcIds: new Set(), venVal: 0, venIds: new Set(),
      });
    }
    for (const r of orcQ.data?.records ?? []) {
      if (ownerParam && r.ownerId !== ownerParam) continue;
      if (!r.createdDate) continue;
      const [yr, mo] = r.createdDate.split("-").map(Number);
      const b = buckets.get(bkey(yr, mo - 1));
      if (!b) continue;
      b.orcVal += r.total ?? r.amount ?? 0;
      b.orcIds.add(r.id);
    }
    for (const r of vendas4Q.data?.records ?? []) {
      if (ownerParam && r.ownerId !== ownerParam) continue;
      if (!r.closeDate) continue;
      const [yr, mo] = r.closeDate.split("-").map(Number);
      const b = buckets.get(bkey(yr, mo - 1));
      if (!b) continue;
      b.venVal += r.total ?? r.amount ?? 0;
      b.venIds.add(r.id);
    }
    const cur = buckets.get(bkey(y, m))!;
    const prevs = [-3, -2, -1].map((i) => {
      const d = new Date(y, m + i, 1);
      return buckets.get(bkey(d.getFullYear(), d.getMonth()))!;
    });
    const safeDiv = (n: number, d: number) => (d > 0 ? n / d : 0);
    const avg = (fn: (b: Bkt) => number) => {
      const vs = prevs.map(fn);
      return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
    };
    return {
      convRCur: safeDiv(sold, generated),
      convR3: avg((b) => safeDiv(b.venVal, b.orcVal)),
      convQCur: safeDiv(cur.venIds.size, cur.orcIds.size),
      convQ3: avg((b) => safeDiv(b.venIds.size, b.orcIds.size)),
      ticketCur: safeDiv(cur.venVal, cur.venIds.size),
      ticket3: avg((b) => safeDiv(b.venVal, b.venIds.size)),
    };
  }, [orcQ.data, vendas4Q.data, ownerParam, today, sold, generated]);

  // ---- Retenção / Recorrência / Novos recorrentes (por trimestre calendário) ----
  const quarterRange = useMemo(() => {
    const y = today.getFullYear();
    const m = today.getMonth();
    const qStartMonth = Math.floor(m / 3) * 3; // 0,3,6,9
    const curStart = new Date(y, qStartMonth, 1);
    const curEnd = new Date(y, qStartMonth + 3, 0);
    const prevStart = new Date(y, qStartMonth - 3, 1);
    const prevEnd = new Date(y, qStartMonth, 0);
    return {
      prevStart, prevEnd, curStart, curEnd,
      start: fmtKey(prevStart),
      end: fmtKey(curEnd),
    };
  }, [today]);

  const vendasQuarterQ = useQuery({
    queryKey: ["sf-home-vendas-quarters", quarterRange.start, quarterRange.end, ownerParam],
    queryFn: () => fetchVendas({ data: { start: quarterRange.start, end: quarterRange.end, ownerId: ownerParam } }),
    enabled: dataEnabled,
    staleTime: 60_000,
  });

  // Meta trimestral de Retenção (Regras de Metas)
  const currentQuarter = Math.floor(today.getMonth() / 3) + 1;
  const retentionOwners = ownerParam ? [ownerParam] : [...CARTEIRA_OWNER_IDS];
  const fetchRetentionGoals = useServerFn(listRetentionGoals);
  const retentionGoalsQ = useQuery({
    queryKey: ["home-retention-goals", today.getFullYear(), currentQuarter, retentionOwners.join(",")],
    queryFn: () =>
      fetchRetentionGoals({
        data: {
          year: today.getFullYear(),
          quarter: currentQuarter,
          sfUserIds: retentionOwners,
        },
      }),
    enabled: dataEnabled && retentionOwners.length > 0,
    staleTime: 60_000,
  });
  const configuredRetentionGoal = useMemo(() => {
    return (retentionGoalsQ.data?.records ?? []).reduce((a, r) => a + (r.goal ?? 0), 0);
  }, [retentionGoalsQ.data]);

  const retentionKpis = useMemo(() => {
    const AB_THRESHOLD = 15000;
    const prevStartT = quarterRange.prevStart.getTime();
    const prevEndT = quarterRange.prevEnd.getTime();
    const curStartT = quarterRange.curStart.getTime();
    const curEndT = quarterRange.curEnd.getTime();
    const prevTotals = new Map<string, number>();
    const curTotals = new Map<string, number>();
    for (const r of vendasQuarterQ.data?.records ?? []) {
      if (ownerParam && r.ownerId !== ownerParam) continue;
      const acc = r.accountId;
      if (!acc) continue;
      if (!r.closeDate) continue;
      const [yr, mo, dd] = r.closeDate.split("-").map(Number);
      const t = new Date(yr, mo - 1, dd).getTime();
      const val = r.total ?? r.amount ?? 0;
      if (t >= prevStartT && t <= prevEndT) {
        prevTotals.set(acc, (prevTotals.get(acc) ?? 0) + val);
      } else if (t >= curStartT && t <= curEndT) {
        curTotals.set(acc, (curTotals.get(acc) ?? 0) + val);
      }
    }
    const prevAB = new Set<string>();
    for (const [id, v] of prevTotals) if (v >= AB_THRESHOLD) prevAB.add(id);
    const curAB = new Set<string>();
    for (const [id, v] of curTotals) if (v >= AB_THRESHOLD) curAB.add(id);
    let retained = 0;
    for (const id of prevAB) if (curAB.has(id)) retained++;
    let newRecurring = 0;
    for (const id of curAB) if (!prevAB.has(id)) newRecurring++;
    const retentionBase = prevAB.size;
    const retentionGoal =
      configuredRetentionGoal > 0 ? configuredRetentionGoal : Math.round(retentionBase * 0.9);
    const retentionPct = retentionGoal > 0 ? (retained / retentionGoal) * 100 : 0;
    return {
      retentionBase,
      retentionGoal,
      retentionActive: retained,
      retentionPct,
      newRecurring,
    };
  }, [vendasQuarterQ.data, ownerParam, quarterRange, configuredRetentionGoal]);

  const fmtPct = (n: number) =>
    `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  const trendPct = (cur: number, base: number) =>
    base > 0 ? ((cur - base) / base) * 100 : undefined;

  // ---- Meta / Projetado de Geração — deriva da meta de vendas via taxa de conversão R$ (3M). ----
  const conversionRate = conversionKpis.convR3 || conversionKpis.convRCur || 0;
  const generationGoal = conversionRate > 0 ? Math.round(dbGoal / conversionRate) : 0;
  const generationProjected = conversionRate > 0 ? Math.round(projected / conversionRate) : 0;
  const generationPct = generationGoal > 0 ? (generated / generationGoal) * 100 : 0;
  const generationProjectedPct =
    generationGoal > 0 ? (generationProjected / generationGoal) * 100 : 0;

  // ---- Série diária: Geração — Projetado × Realizado (mês atual, usa "Gerado - Mês Atual") ----
  const genChartSeries = useMemo(() => {
    const y = today.getFullYear();
    const m = today.getMonth();
    const genByDay = new Map<number, number>();
    for (const r of geradoMesQ.data?.records ?? []) {
      if (ownerParam && r.ownerId !== ownerParam) continue;
      if (!r.createdDate) continue;
      const [yr, mo, dd] = r.createdDate.split("-").map(Number);
      if (yr !== y || mo !== m + 1) continue;
      genByDay.set(dd, (genByDay.get(dd) ?? 0) + (r.total ?? r.amount ?? 0));
    }
    const todayDay = today.getDate();
    let cumGen = 0;
    return salesChartSeries.map((row, idx) => {
      const d = idx + 1;
      cumGen += genByDay.get(d) ?? 0;
      return {
        day: row.day,
        projected: conversionRate > 0 ? Math.round(row.projected / conversionRate) : 0,
        generated: d <= todayDay ? Math.round(cumGen) : null,
      };
    });
  }, [salesChartSeries, geradoMesQ.data, ownerParam, conversionRate, today]);

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-6">
        {/* Hero + filtro global de vendedor */}
        <div className="flex items-end justify-between flex-wrap gap-4">
          <ViewSlot
            screen="home"
            variants={{
              default: (
                <div>
                  <div className="text-sm text-muted-foreground">{greeting}{displayName ? `, ${displayName}` : ""}</div>
                  <h1 className="text-3xl md:text-4xl font-bold mt-1">
                    {goalSubject} em <span className="text-foreground">{goalPct.toFixed(1)}%</span> da meta do mês
                  </h1>
                  <p className="text-sm text-muted-foreground mt-2">
                    Visão geral da carteira selecionada.
                  </p>
                </div>
              ),
              "vendedor.closer": (
                <div>
                  <div className="text-sm text-muted-foreground">{greeting}{displayName ? `, ${displayName}` : ""} · Closer</div>
                  <h1 className="text-3xl md:text-4xl font-bold mt-1">
                    Foco no fechamento: <span className="text-foreground">{goalPct.toFixed(1)}%</span> da meta
                  </h1>
                  <p className="text-sm text-muted-foreground mt-2">
                    {filteredOpps.filter((o) => o.stage === "Em Negociação").length} oportunidade(s) em negociação.
                  </p>
                </div>
              ),
              "vendedor.farmer": (
                <div>
                  <div className="text-sm text-muted-foreground">{greeting}{displayName ? `, ${displayName}` : ""} · Farmer</div>
                  <h1 className="text-3xl md:text-4xl font-bold mt-1">
                    Sua carteira: <span className="text-foreground">{fmt(sold)}</span> no mês
                  </h1>
                  <p className="text-sm text-muted-foreground mt-2">
                    Priorize recompra e relacionamento com a base ativa.
                  </p>
                </div>
              ),
              "vendedor.sdr": (
                <div>
                  <div className="text-sm text-muted-foreground">{greeting}{displayName ? `, ${displayName}` : ""} · SDR</div>
                  <h1 className="text-3xl md:text-4xl font-bold mt-1">
                    Prospecção do dia: <span className="text-foreground">{sfTasks.length}</span> tarefa(s)
                  </h1>
                  <p className="text-sm text-muted-foreground mt-2">Qualifique e passe para o Closer o quanto antes.</p>
                </div>
              ),
              gerente: (
                <div>
                  <div className="text-sm text-muted-foreground">{greeting}{displayName ? `, ${displayName}` : ""} · Gerente</div>
                  <h1 className="text-3xl md:text-4xl font-bold mt-1">
                    Time em <span className="text-foreground">{goalPct.toFixed(1)}%</span> da meta consolidada
                  </h1>
                  <p className="text-sm text-muted-foreground mt-2">
                    Use o filtro de vendedor para drill-down por representante.
                  </p>
                </div>
              ),
              diretor: (
                <div>
                  <div className="text-sm text-muted-foreground">{greeting}{displayName ? `, ${displayName}` : ""} · Diretoria</div>
                  <h1 className="text-3xl md:text-4xl font-bold mt-1">
                    Consolidado: <span className="text-foreground">{fmt(sold)}</span> · {goalPct.toFixed(1)}% da meta
                  </h1>
                  <p className="text-sm text-muted-foreground mt-2">
                    Forecast e ranking de equipes disponíveis nos dashboards.
                  </p>
                </div>
              ),
              marketing: (
                <div>
                  <div className="text-sm text-muted-foreground">{greeting}{displayName ? `, ${displayName}` : ""} · Marketing</div>
                  <h1 className="text-3xl md:text-4xl font-bold mt-1">
                    Impacto comercial das campanhas
                  </h1>
                  <p className="text-sm text-muted-foreground mt-2">
                    Visão consolidada de funil e leads gerados — abra o módulo Marketing para detalhar.
                  </p>
                </div>
              ),
              admin: (
                <div>
                  <div className="text-sm text-muted-foreground">{greeting}{displayName ? `, ${displayName}` : ""} · Administrador</div>
                  <h1 className="text-3xl md:text-4xl font-bold mt-1">
                    Portal 2P — visão geral
                  </h1>
                  <p className="text-sm text-muted-foreground mt-2">
                    {sfTasks.length} tarefa(s) na agenda selecionada.
                  </p>
                </div>
              ),
            }}
          />

          <div className="flex items-center gap-2">
            <VendedorFilter value={ownerId} onChange={setOwnerId} />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border text-sm font-medium hover:bg-surface-2 transition-colors"
                  aria-label="Meses das metas"
                >
                  <CalendarIcon className="h-4 w-4 text-primary" />
                  <span className="max-w-[220px] truncate">{metaLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[300px] p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Selecione um ou mais meses</span>
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => setMetaMonths([currentMonthKey])}
                  >
                    Mês atual
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="flex-1 text-xs px-2 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-surface-2 transition-colors"
                    onClick={() =>
                      setMetaMonths(
                        META_YEARS.flatMap((y) =>
                          MONTH_NAMES.map((_, i) => `${y}-${String(i + 1).padStart(2, "0")}`),
                        ),
                      )
                    }
                  >
                    Selecionar tudo
                  </button>
                  <button
                    className="flex-1 text-xs px-2 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-surface-2 transition-colors"
                    onClick={() => setMetaMonths([])}
                  >
                    Limpar tudo
                  </button>
                </div>
                {META_YEARS.map((y) => {
                  const yearKeys = MONTH_NAMES.map(
                    (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`,
                  );
                  const allOn = yearKeys.every((k) => metaMonths.includes(k));
                  return (
                    <div key={y}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-xs font-semibold text-muted-foreground">{y}</div>
                        <button
                          className="text-xs text-primary hover:underline"
                          onClick={() =>
                            setMetaMonths((prev) =>
                              allOn
                                ? prev.filter((k) => !yearKeys.includes(k))
                                : Array.from(new Set([...prev, ...yearKeys])),
                            )
                          }
                        >
                          {allOn ? "Limpar ano" : "Ano inteiro"}
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {MONTH_NAMES.map((n, i) => {
                          const k = `${y}-${String(i + 1).padStart(2, "0")}`;
                          const on = metaMonths.includes(k);
                          return (
                            <button
                              key={k}
                              onClick={() => toggleMetaMonth(k)}
                              className={cn(
                                "text-xs px-2 py-1.5 rounded-md border transition-colors",
                                on
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-border text-muted-foreground hover:bg-surface-2",
                              )}
                            >
                              {n.slice(0, 3)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Meta */}
        <div className="glass rounded-2xl p-5 space-y-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="font-display font-semibold">
                  Meta do mês{!isCurrentMetaMonth ? ` · ${metaLabel}` : ""}
                </div>
                <div className="text-sm flex items-center gap-3">
                  <span><span className="text-muted-foreground">Vendido </span><span className="text-primary font-bold">{fmt(sold)}</span></span>
                  <span className="text-muted-foreground">·</span>
                  <span><span className="text-muted-foreground">Projetado/Dia{"\u00a0"}</span><span className="font-semibold">{fmt(projected)}</span></span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 text-xs">
                <span className="font-semibold text-foreground">{goalPct.toFixed(1)}% alcançado</span>
                <span className="text-muted-foreground tabular-nums">{fmt(achieved)} / {fmt(goal)}</span>
              </div>
              <div className="relative h-3 mt-1.5 rounded-full bg-surface-2 overflow-hidden border border-border">
                <div
                  className="absolute inset-y-0 left-0 bg-primary/25 rounded-full"
                  style={{ width: `${Math.min(projectedPct, 100)}%` }}
                  title={`Projetado: ${projectedPct.toFixed(1)}%`}
                />
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-[oklch(0.78_0.19_60)] rounded-full transition-all"
                  style={{ width: `${Math.min(goalPct, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Geração do mês */}
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-[oklch(0.55_0.2_250)]/15 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-[oklch(0.55_0.2_250)]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="font-display font-semibold">
                  Geração do mês{!isCurrentMetaMonth ? ` · ${metaLabel}` : ""}
                </div>
                <div className="text-sm flex items-center gap-3">
                  <span><span className="text-muted-foreground">Gerado </span><span className="text-[oklch(0.55_0.2_250)] font-bold">{fmt(generated)}</span></span>
                  <span className="text-muted-foreground">·</span>
                  <span><span className="text-muted-foreground">Projetado/Dia{"\u00a0"}</span><span className="font-semibold">{fmt(generationProjected)}</span></span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 text-xs">
                <span className="font-semibold text-foreground">{generationPct.toFixed(1)}% alcançado</span>
                <span className="text-muted-foreground tabular-nums">{fmt(generated)} / {fmt(generationGoal)}</span>
              </div>
              <div className="relative h-3 mt-1.5 rounded-full bg-surface-2 overflow-hidden border border-border">
                <div
                  className="absolute inset-y-0 left-0 bg-[oklch(0.55_0.2_250)]/25 rounded-full"
                  style={{ width: `${Math.min(generationProjectedPct, 100)}%` }}
                  title={`Projetado: ${generationProjectedPct.toFixed(1)}%`}
                />
                <div
                  className="absolute inset-y-0 left-0 bg-[oklch(0.55_0.2_250)] rounded-full transition-all"
                  style={{ width: `${Math.min(generationPct, 100)}%` }}
                />
              </div>
            </div>
          </div>

          <button onClick={() => setMetaOpen(!metaOpen)} className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
            {metaOpen ? "Ocultar detalhes" : "Detalhar"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", metaOpen && "rotate-180")} />
          </button>

          {metaOpen && (
            <div className="pt-5 border-t border-border space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <MiniKpi
                  label="Retenção"
                  value={`${retentionKpis.retentionActive} / ${retentionKpis.retentionGoal}`}
                  sub={`${retentionKpis.retentionPct.toFixed(1)}% · base A/B tri anterior: ${retentionKpis.retentionBase}`}
                />
                <MiniKpi
                  label="Novos recorrentes"
                  value={`${retentionKpis.newRecurring}`}
                  sub="A/B no tri atual e não no anterior"
                />
                <MiniKpi
                  label="Ticket médio"
                  value={fmt(conversionKpis.ticketCur)}
                  sub={`3M: ${fmt(conversionKpis.ticket3)}`}
                  trend={trendPct(conversionKpis.ticketCur, conversionKpis.ticket3)}
                />
                <MiniKpi
                  label="Conversão R$"
                  value={fmtPct(conversionKpis.convRCur)}
                  sub={`3M: ${fmtPct(conversionKpis.convR3)}`}
                  trend={trendPct(conversionKpis.convRCur, conversionKpis.convR3)}
                />
                <MiniKpi
                  label="Conversão Qtd"
                  value={fmtPct(conversionKpis.convQCur)}
                  sub={`3M: ${fmtPct(conversionKpis.convQ3)}`}
                  trend={trendPct(conversionKpis.convQCur, conversionKpis.convQ3)}
                />
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                <ChartCard title="Geração — Projetado × Realizado" series={genChartSeries} valueKey="generated" valueColor={C.generation} valueLabel="Gerado" />
                <ChartCard title="Vendas — Projetado × Realizado" series={salesChartSeries} valueKey="sold" valueColor={C.sales} valueLabel="Vendido" />
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
              <div className="flex items-center gap-2">
                <Popover open={agendaSortOpen} onOpenChange={setAgendaSortOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2" title="Ordenar">
                      <ArrowUpDown className="h-3.5 w-3.5" />
                      {agendaSort === "priority" ? "Prioridade" : "Data"}
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {agendaSortDir === "asc" ? "asc" : "desc"}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-56 p-1">
                    <div className="px-2 pt-1 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Data</div>
                    <button
                      onClick={() => { setAgendaSort("date"); setAgendaSortDir("asc"); setAgendaSortOpen(false); }}
                      className={cn(
                        "w-full text-left text-sm px-2 py-1.5 rounded hover:bg-surface-2 flex items-center justify-between",
                        agendaSort === "date" && agendaSortDir === "asc" && "font-semibold text-primary",
                      )}
                    >
                      Data (mais antiga) {agendaSort === "date" && agendaSortDir === "asc" && <Check className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => { setAgendaSort("date"); setAgendaSortDir("desc"); setAgendaSortOpen(false); }}
                      className={cn(
                        "w-full text-left text-sm px-2 py-1.5 rounded hover:bg-surface-2 flex items-center justify-between",
                        agendaSort === "date" && agendaSortDir === "desc" && "font-semibold text-primary",
                      )}
                    >
                      Data (mais recente) {agendaSort === "date" && agendaSortDir === "desc" && <Check className="h-3.5 w-3.5" />}
                    </button>
                    <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Prioridade</div>
                    <button
                      onClick={() => { setAgendaSort("priority"); setAgendaSortDir("asc"); setAgendaSortOpen(false); }}
                      className={cn(
                        "w-full text-left text-sm px-2 py-1.5 rounded hover:bg-surface-2 flex items-center justify-between",
                        agendaSort === "priority" && agendaSortDir === "asc" && "font-semibold text-primary",
                      )}
                    >
                      Prioridade (alta → baixa) {agendaSort === "priority" && agendaSortDir === "asc" && <Check className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => { setAgendaSort("priority"); setAgendaSortDir("desc"); setAgendaSortOpen(false); }}
                      className={cn(
                        "w-full text-left text-sm px-2 py-1.5 rounded hover:bg-surface-2 flex items-center justify-between",
                        agendaSort === "priority" && agendaSortDir === "desc" && "font-semibold text-primary",
                      )}
                    >
                      Prioridade (baixa → alta) {agendaSort === "priority" && agendaSortDir === "desc" && <Check className="h-3.5 w-3.5" />}
                    </button>
                  </PopoverContent>
                </Popover>
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
                
                const dueDate = new Date(t.date + "T00:00:00");
                const overdueDays = Math.round((todayStart.getTime() - dueDate.getTime()) / 86400000);
                const isOverdue = overdueDays > 0;
                return (
                <div key={t.id} className={cn(
                  "rounded-xl border p-3.5 transition-colors",
                  isOverdue
                    ? "border-destructive/50 bg-destructive/5 hover:border-destructive"
                    : "border-border bg-surface hover:border-primary/40",
                )}>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => setCompleteTask(t)}
                      title="Concluir tarefa"
                      className={cn(
                        "mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 group",
                        isOverdue ? "border-destructive/60 hover:border-destructive" : "border-border hover:border-primary",
                      )}
                    >
                      <CheckCircle2 className={cn("h-3 w-3 opacity-0 group-hover:opacity-80", isOverdue ? "text-destructive" : "text-primary")} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {t.what && (
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <FileText className="h-3 w-3 text-[color:var(--atlas)] shrink-0" />
                              <span className="text-[11px] uppercase tracking-wider font-semibold text-[color:var(--atlas)] truncate">
                                {t.what}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <UsersIcon className="h-3 w-3 text-primary shrink-0" />
                            <span className="text-sm font-bold text-foreground truncate">
                              {t.who ?? (t.what ? "—" : "Sem cliente vinculado")}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                            {t.subject}
                            {isOverdue && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-destructive/15 text-destructive">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                Atrasada {overdueDays}d
                              </span>
                            )}
                            {inter && (
                              <span
                                title={`${inter.type ?? "Interação"} — ${inter.contacted === "yes" ? "Falou com o cliente" : "Não conseguiu falar"}`}
                                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-success/15 text-success"
                              >
                                <Check className="h-2.5 w-2.5" />
                                {inter.type ? `${inter.type} · ` : ""}{inter.contacted === "yes" ? "Falou" : "Não falou"}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded shrink-0 flex items-center gap-1",
                          isOverdue ? "bg-destructive/15 text-destructive font-semibold" :
                          t.priority?.toLowerCase().startsWith("alt") ? "bg-destructive/15 text-destructive" :
                          t.priority?.toLowerCase().startsWith("baix") ? "bg-surface-2 text-muted-foreground" :
                          "bg-warning/20 text-[color:var(--warning)]",
                        )}>
                          <Clock className="h-2.5 w-2.5" />
                          {dueDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                        </span>
                      </div>
                      {t.owner && (
                        <div className="text-[11px] text-muted-foreground mt-1">Responsável: {t.owner}</div>
                      )}
                      
                      <div className="flex gap-1.5 mt-2.5">
                        <button
                          onClick={() => setInteractionTask(t)}
                          className={cn(
                            "text-[11px] px-2 py-1 rounded flex items-center gap-1",
                            inter
                              ? "bg-success/15 text-success hover:bg-success/25"
                              : "bg-surface-2 hover:bg-primary/15 hover:text-primary text-muted-foreground",
                          )}
                        >
                          {inter ? <Check className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                          {inter ? "Nova interação" : "Interação"}
                        </button>
                        <button
                          onClick={() => setRescheduleTask(t)}
                          title="Adiar tarefa (mudar data)"
                          className="text-[11px] px-2 py-1 rounded bg-surface-2 hover:bg-warning/15 hover:text-[color:var(--warning)] text-muted-foreground flex items-center gap-1"
                        >
                          <CalendarPlus className="h-3 w-3" /> Adiar
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

          <div className="relative glass rounded-2xl p-5 overflow-hidden min-h-[280px]">
            <div aria-hidden className="absolute inset-0 blur-sm pointer-events-none select-none opacity-40 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-display font-semibold">Atlas radar</span>
              </div>
              <div className="space-y-2 text-sm">
                <div>• Cliente X abaixo da projeção do trimestre</div>
                <div>• 3 oportunidades em aberto — Cliente Y</div>
                <div>• Observação registrada — Cliente Z</div>
              </div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center px-4">
              <div className="glass rounded-2xl px-6 py-5 max-w-sm text-center shadow-xl border border-primary/20">
                <div className="mx-auto h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-[oklch(0.65_0.2_30)] flex items-center justify-center mb-3 shadow-md shadow-primary/30">
                  <Clock className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="text-[11px] uppercase tracking-wider text-primary font-semibold">Em breve</div>
                <h3 className="font-display font-bold text-lg mt-1">Atlas radar</h3>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Estamos ligando o Atlas às suas contas para gerar sinais automáticos de oportunidade e risco.
                </p>
              </div>
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
            <div className="flex flex-wrap gap-1.5 mb-3 text-xs">
              {([
                { k: "all", l: "Todos" },
                { k: "7d", l: "≤ 7 dias" },
                { k: "15-30", l: "15–30 dias" },
                { k: "30-60", l: "30–60 dias" },
                { k: "60+", l: "+60 dias" },
              ] as const).map((o) => (
                <button
                  key={o.k}
                  onClick={() => setOppsAgeFilter(o.k)}
                  className={cn(
                    "px-2.5 py-1 rounded-md border",
                    oppsAgeFilter === o.k ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 border-border text-muted-foreground",
                  )}
                >
                  {o.l}
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
              <div className="flex flex-wrap bg-surface-2 rounded-lg p-0.5 border border-border text-xs gap-0.5">
                {([
                  { k: "all", l: "Todos" },
                  { k: "7d", l: "≤ 7d" },
                  { k: "15-30", l: "15–30d" },
                  { k: "30-60", l: "30–60d" },
                  { k: "60+", l: "+60d" },
                  { k: "semana", l: "Semana atual" },
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

      <RescheduleTaskDialog
        task={rescheduleTask}
        onClose={() => setRescheduleTask(null)}
        onDone={() => {
          setRescheduleTask(null);
          queryClient.invalidateQueries({ queryKey: ["sf-home-tasks"] });
        }}
      />

    </AppLayout>
  );
}

const TASK_TYPES = ["Ligação", "E-mail", "Reunião", "Visita", "Follow-up", "Outro"] as const;
const PRIORITIES = ["Alta", "Normal", "Baixa"] as const;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ContactedToggle({
  value,
  onChange,
}: {
  value: "yes" | "no" | null;
  onChange: (v: "yes" | "no") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => onChange("yes")}
        className={cn(
          "px-3 py-2 rounded-lg border-2 text-sm font-medium flex items-center justify-center gap-2 transition-all",
          value === "yes"
            ? "border-success bg-success/25 text-success ring-2 ring-success/40 shadow-sm"
            : "border-success/40 bg-success/10 text-success/80 hover:bg-success/15",
        )}
      >
        <Check className="h-3.5 w-3.5" /> Falei com o cliente
      </button>
      <button
        type="button"
        onClick={() => onChange("no")}
        className={cn(
          "px-3 py-2 rounded-lg border-2 text-sm font-medium flex items-center justify-center gap-2 transition-all",
          value === "no"
            ? "border-[color:var(--warning)] bg-warning/30 text-[color:var(--warning)] ring-2 ring-warning/40 shadow-sm"
            : "border-warning/40 bg-warning/10 text-[color:var(--warning)]/80 hover:bg-warning/20",
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5" /> Não consegui falar
      </button>
    </div>
  );
}

const INTERACTION_TYPES = ["Ligação", "Mensagem", "E-mail", "Reunião", "Visita", "Outro"] as const;

function InteractionQuickDialog({
  task,
  existing,
  onClose,
  onSaved,
}: {
  task: SalesforceTask | null;
  existing: TaskInteractionState | null;
  onClose: () => void;
  onSaved: (state: TaskInteractionState) => void;
}) {
  const logInteraction = useServerFn(logSalesforceInteraction);
  const [contacted, setContacted] = useState<"yes" | "no" | null>(null);
  const [interactionType, setInteractionType] = useState<string>("Ligação");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (task) {
      setContacted(existing?.contacted ?? null);
      setInteractionType(existing?.type ?? "Ligação");
      setNote(existing?.note ?? "");
    }
  }, [task?.id]);

  const submit = async () => {
    if (!task || !contacted) return;
    setSaving(true);
    try {
      await logInteraction({
        data: {
          subject: `${interactionType} — ${contacted === "yes" ? "Falei" : "Sem contato"}: ${task.subject}`,
          description: note,
          whatId: task.whatId,
          whoId: task.whoId,
          ownerId: task.ownerId,
          tipoInteracao: interactionType,
          conseguiuFalar: contacted === "yes" ? "Sim" : "Não",
          comments: note,
        },
      });
      toast.success("Interação registrada no Salesforce.");
      onSaved({ contacted, type: interactionType, note, ts: Date.now() });
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
            {task?.subject} — {task?.what ?? task?.who ?? "—"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Conseguiu falar com o cliente?</Label>
            <ContactedToggle value={contacted} onChange={setContacted} />
          </div>
          <div>
            <Label className="mb-1.5 block">Tipo de interação</Label>
            <Select value={interactionType} onValueChange={setInteractionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INTERACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Comentários</Label>
            <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Detalhes da conversa, próximos passos…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !contacted}>
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
  existing,
  onClose,
  onSaveInteraction,
  onDone,
}: {
  task: SalesforceTask | null;
  existing: TaskInteractionState | null;
  onClose: () => void;
  onSaveInteraction: (state: TaskInteractionState) => void;
  onDone: () => void;
}) {
  const completeFn = useServerFn(completeSalesforceTask);
  const createFn = useServerFn(createSalesforceTask);
  const logFn = useServerFn(logSalesforceInteraction);

  const [contacted, setContacted] = useState<"yes" | "no" | null>(null);
  const [interactionType, setInteractionType] = useState<string>("Ligação");
  const [interactionNote, setInteractionNote] = useState("");
  const [interactionAlreadyLogged, setInteractionAlreadyLogged] = useState(false);

  const [createNext, setCreateNext] = useState(true);
  const [subject, setSubject] = useState("");
  const [type, setType] = useState<string>("Follow-up");
  const [priority, setPriority] = useState<string>("Normal");
  const [date, setDate] = useState<string>(todayKey());
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (task) {
      setContacted(existing?.contacted ?? null);
      setInteractionType(existing?.type ?? "Ligação");
      setInteractionNote(existing?.note ?? "");
      setInteractionAlreadyLogged(!!existing);
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
    if (!interactionAlreadyLogged) {
      if (!contacted) {
        toast.error("Selecione se conseguiu falar com o cliente.");
        return;
      }
      if (!interactionType) {
        toast.error("Selecione o tipo de interação.");
        return;
      }
    }
    if (createNext) {
      if (!subject.trim()) { toast.error("Assunto da nova tarefa é obrigatório."); return; }
      if (!type) { toast.error("Tipo da nova tarefa é obrigatório."); return; }
      if (!priority) { toast.error("Prioridade da nova tarefa é obrigatória."); return; }
      if (!date) { toast.error("Vencimento da nova tarefa é obrigatório."); return; }
    }
    setSaving(true);
    try {
      if (!interactionAlreadyLogged) {
        await logFn({
          data: {
            subject: `${interactionType} — ${contacted === "yes" ? "Falei" : "Sem contato"}: ${task.subject}`,
            description: interactionNote,
            whatId: task.whatId,
            whoId: task.whoId,
            ownerId: task.ownerId,
            tipoInteracao: interactionType,
            conseguiuFalar: contacted === "yes" ? "Sim" : "Não",
            comments: interactionNote,
          },
        });
        onSaveInteraction({ contacted: contacted!, type: interactionType, note: interactionNote, ts: Date.now() });
      }
      await completeFn({ data: { taskId: task.id } });
      if (createNext) {
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
                <MessageSquare className="h-3.5 w-3.5 text-primary" /> Interação
              </div>
              {interactionAlreadyLogged ? (
                <button
                  type="button"
                  onClick={() => {
                    setInteractionAlreadyLogged(false);
                    setContacted(null);
                    setInteractionType("Ligação");
                    setInteractionNote("");
                  }}
                  className="text-[11px] px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Nova interação
                </button>
              ) : null}
            </div>
            {interactionAlreadyLogged ? (
              <div className="text-xs text-success flex items-center gap-1.5">
                <Check className="h-3 w-3" /> Interação já registrada para esta tarefa.
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-xs mb-1.5 block">Conseguiu falar com o cliente? <span className="text-destructive">*</span></Label>
                  <ContactedToggle value={contacted} onChange={setContacted} />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Tipo de interação <span className="text-destructive">*</span></Label>
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
              </>
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
                  <Label className="text-xs">Assunto <span className="text-destructive">*</span></Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Tipo <span className="text-destructive">*</span></Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TASK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Prioridade <span className="text-destructive">*</span></Label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Vencimento <span className="text-destructive">*</span></Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
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
          <Button onClick={submit} disabled={saving || !contacted}>
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
        <Suspense fallback={<div className="h-full w-full" />}>
          <HomeAreaChart
            series={series}
            valueKey={valueKey}
            valueColor={valueColor}
            valueLabel={valueLabel}
            axisColor={C.axis}
            gridColor={C.grid}
            projectedColor={C.projected}
          />
        </Suspense>
      </div>
    </div>
  );
}

function RescheduleTaskDialog({
  task, onClose, onDone,
}: { task: SalesforceTask | null; onClose: () => void; onDone: () => void }) {
  const rescheduleFn = useServerFn(rescheduleSalesforceTask);
  const [date, setDate] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
      const d = new Date(); d.setDate(d.getDate() + 1);
      setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      setReason("");
    }
  }, [task?.id]);

  const REASONS = [
    "Cliente pediu para retornar depois",
    "Sem contato — tentar novamente",
    "Aguardando material/proposta",
    "Cliente em viagem/férias",
    "Reagendado a pedido do cliente",
    "Outro",
  ];

  const submit = async () => {
    if (!task) return;
    if (!date) { toast.error("Selecione a nova data."); return; }
    setSaving(true);
    try {
      await rescheduleFn({ data: { taskId: task.id, newDate: date, reason: reason || null } });
      toast.success("Tarefa adiada no Salesforce.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adiar tarefa.");
    } finally {
      setSaving(false);
    }
  };

  const todayStr = todayKey();

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-[color:var(--warning)]" /> Adiar tarefa
          </DialogTitle>
          <DialogDescription>
            {task?.subject} — {task?.what ?? task?.who ?? "—"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Nova data</Label>
            <Input type="date" min={todayStr} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">Motivo (opcional)</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Selecione um motivo…" /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block">Observação (opcional)</Label>
            <Textarea rows={3} placeholder="Detalhes adicionais…" onChange={(e) => setReason((prev) => prev && !e.target.value ? prev : (prev && e.target.value ? `${prev} — ${e.target.value}` : e.target.value))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !date}>
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Adiar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
