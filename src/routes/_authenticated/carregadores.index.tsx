import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { VendedorNamesFilter } from "@/components/vendedor-names-filter";
import { useCpoVendedores } from "@/hooks/use-cpo-vendedores";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL } from "@/lib/cpo";
import { cn } from "@/lib/utils";
import { PermissionGate } from "@/components/permission-gate";
import {
  Zap,
  Users,
  CalendarClock,
  Plus,
  Building2,
  ShoppingCart,
  BookOpen,
  Calendar,
  CalendarIcon,
  ArrowUpDown,
  Check,
  FileText,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/carregadores/")({
  head: () => ({
    meta: [
      { title: "Home — Portal 2P Carregadores" },
      { name: "description", content: "Visão geral das propostas, clientes e tarefas da unidade de carregadores." },
      { property: "og:title", content: "Home — Portal 2P Carregadores" },
      { property: "og:description", content: "Indicadores da operação de carregadores veiculares." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CarregadoresHome,
});

type Prop = {
  id: string;
  numero: string | null;
  cliente_nome: string;
  uf: string;
  status: string;
  totais: Record<string, number> | null;
  created_at: string;
};

type Task = {
  id: string;
  titulo: string;
  descricao: string | null;
  cliente_nome: string | null;
  due_date: string | null;
  prioridade: string;
  status: string;
};

const PRIO_RANK: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
const PRIO_CLS: Record<string, string> = {
  alta: "bg-destructive/15 text-destructive",
  media: "bg-amber-500/15 text-amber-600",
  baixa: "bg-surface-2 text-muted-foreground",
};
const STATUS_CLS: Record<string, string> = {
  Salvo: "bg-surface-2 text-muted-foreground",
  Enviada: "bg-primary/15 text-primary",
  Aprovada: "bg-emerald-500/15 text-emerald-600",
  Perdida: "bg-destructive/15 text-destructive",
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function fmtKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function CarregadoresHome() {
  const today = new Date();
  const todayStart = startOfDay(today);

  const [agendaDate, setAgendaDate] = useState<Date>(todayStart);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [agendaSortOpen, setAgendaSortOpen] = useState(false);
  const [agendaSort, setAgendaSort] = useState<"date" | "priority">("date");
  const [agendaSortDir, setAgendaSortDir] = useState<"asc" | "desc">("asc");
  const [vendedor, setVendedor] = useState("__all__");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ageFilter, setAgeFilter] = useState<"all" | "7d" | "15-30" | "30-60" | "60+">("all");
  const [forecastFilter, setForecastFilter] = useState<"all" | "7d" | "15-30" | "30-60" | "60+" | "atrasados">("all");

  const propsQ = useQuery({
    queryKey: ["cpo-home-propostas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cpo_proposals")
        .select("id,numero,cliente_nome,uf,status,totais,created_at,created_by")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Prop[];
    },
  });
  const vend = useCpoVendedores();
  const props = (propsQ.data ?? []).filter((p) => vend.matches(vendedor, (p as { created_by?: string | null }).created_by));
  const isLoading = propsQ.isLoading;

  const tasksQ = useQuery({
    queryKey: ["cpo-home-agenda"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cpo_tasks")
        .select("id,titulo,descricao,cliente_nome,due_date,prioridade,status,owner_id")
        .eq("status", "aberta")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Task[];
    },
  });

  const agendaTasks = useMemo(() => {
    const limit = fmtKey(agendaDate);
    const list = (tasksQ.data ?? [])
      .filter((t) => !t.due_date || t.due_date <= limit)
      .filter((t) => vend.matches(vendedor, (t as { owner_id?: string | null }).owner_id));
    const dir = agendaSortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (agendaSort === "priority") {
        const ra = PRIO_RANK[a.prioridade] ?? 1;
        const rb = PRIO_RANK[b.prioridade] ?? 1;
        if (ra !== rb) return (ra - rb) * dir;
      }
      const da = a.due_date ?? "9999-12-31";
      const db = b.due_date ?? "9999-12-31";
      return da === db ? 0 : (da < db ? -1 : 1) * dir;
    });
  }, [tasksQ.data, agendaDate, agendaSort, agendaSortDir, vendedor, vend]);

  const valorProposta = (p: Prop) =>
    Number(p.totais?.["valorTotal"] ?? p.totais?.["total"] ?? p.totais?.["valor"] ?? 0);

  const kpis = useMemo(() => {
    const total = props.length;
    const valor = props.reduce((s, p) => s + valorProposta(p), 0);
    const clientes = new Set(props.map((p) => p.cliente_nome.trim().toUpperCase())).size;
    const aprovadas = props.filter((p) => p.status === "Aprovada").length;
    return { total, valor, clientes, aprovadas };
  }, [props]);

  const statusList = useMemo(
    () => Array.from(new Set(props.map((p) => p.status))).sort(),
    [props],
  );

  const ageDays = (p: Prop) =>
    Math.round((todayStart.getTime() - startOfDay(new Date(p.created_at)).getTime()) / 86400000);

  const filteredProps = useMemo(() => {
    return props.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      const d = ageDays(p);
      if (ageFilter === "7d") return d <= 7;
      if (ageFilter === "15-30") return d >= 15 && d <= 30;
      if (ageFilter === "30-60") return d > 30 && d <= 60;
      if (ageFilter === "60+") return d > 60;
      return true;
    });
  }, [props, statusFilter, ageFilter]);

  const filteredTotal = filteredProps.reduce((s, p) => s + valorProposta(p), 0);

  // Previsão de fechamento: propostas em aberto, previsão = 30 dias após a emissão.
  const forecasts = useMemo(() => {
    const open = props.filter((p) => p.status === "Salvo" || p.status === "Enviada");
    const withDate = open.map((p) => {
      const d = startOfDay(new Date(p.created_at));
      d.setDate(d.getDate() + 30);
      const diff = Math.round((d.getTime() - todayStart.getTime()) / 86400000);
      return { p, date: d, diff };
    });
    return withDate
      .filter(({ diff }) => {
        if (forecastFilter === "atrasados") return diff < 0;
        if (forecastFilter === "7d") return diff >= 0 && diff <= 7;
        if (forecastFilter === "15-30") return diff >= 15 && diff <= 30;
        if (forecastFilter === "30-60") return diff > 30 && diff <= 60;
        if (forecastFilter === "60+") return diff > 60;
        return true;
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [props, forecastFilter]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">Portal 2P Carregadores</h1>
            <p className="text-sm text-muted-foreground">Operação CPO — propostas, clientes e tarefas da unidade.</p>
          </div>
          <div className="flex items-center gap-2">
            <VendedorNamesFilter
              value={vendedor}
              onChange={setVendedor}
              options={vend.names}
              allLabel="Todos os vendedores"
            />
          </div>
          <PermissionGate feature="cpo.propostas" action="editar">
            <Button asChild>
              <Link to="/carregadores/propostas/nova">
                <Plus className="h-4 w-4 mr-1.5" /> Nova proposta
              </Link>
            </Button>
          </PermissionGate>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Propostas" value={String(kpis.total)} icon={<Zap className="h-4 w-4" />} />
          <Kpi label="Aprovadas" value={String(kpis.aprovadas)} icon={<Zap className="h-4 w-4" />} />
          <Kpi label="Valor em propostas" value={fmtBRL(kpis.valor)} icon={<Zap className="h-4 w-4" />} />
          <Kpi label="Clientes" value={String(kpis.clientes)} icon={<Users className="h-4 w-4" />} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/carregadores/clientes/cadastros"><Building2 className="h-4 w-4" /> Cadastrar cliente</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/carregadores/propostas"><Zap className="h-4 w-4" /> Minhas propostas</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/carregadores/pedidos"><ShoppingCart className="h-4 w-4" /> Pedidos em curso</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/carregadores/regras"><BookOpen className="h-4 w-4" /> Regras comerciais</Link>
          </Button>
        </div>

        {/* Seção: Operação */}
        <div>
          <h2 className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-semibold">Operação do dia</h2>
          <h3 className="font-display font-bold text-xl mt-1">Agenda de hoje</h3>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="glass rounded-2xl p-5 border border-border">
            <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
              <div>
                <h3 className="font-display font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" /> Agenda de hoje
                  {tasksQ.isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Tarefas em aberto da unidade de carregadores</p>
              </div>
              <div className="flex items-center gap-2">
                <Popover open={agendaSortOpen} onOpenChange={setAgendaSortOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2" title="Ordenar">
                      <ArrowUpDown className="h-3.5 w-3.5" />
                      {agendaSort === "priority" ? "Prioridade" : "Data"}
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {agendaSortDir}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-56 p-1">
                    <div className="px-2 pt-1 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Data</div>
                    <SortOpt label="Data (mais antiga)" active={agendaSort === "date" && agendaSortDir === "asc"}
                      onClick={() => { setAgendaSort("date"); setAgendaSortDir("asc"); setAgendaSortOpen(false); }} />
                    <SortOpt label="Data (mais recente)" active={agendaSort === "date" && agendaSortDir === "desc"}
                      onClick={() => { setAgendaSort("date"); setAgendaSortDir("desc"); setAgendaSortOpen(false); }} />
                    <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Prioridade</div>
                    <SortOpt label="Prioridade (alta → baixa)" active={agendaSort === "priority" && agendaSortDir === "asc"}
                      onClick={() => { setAgendaSort("priority"); setAgendaSortDir("asc"); setAgendaSortOpen(false); }} />
                    <SortOpt label="Prioridade (baixa → alta)" active={agendaSort === "priority" && agendaSortDir === "desc"}
                      onClick={() => { setAgendaSort("priority"); setAgendaSortDir("desc"); setAgendaSortOpen(false); }} />
                  </PopoverContent>
                </Popover>
                <Popover open={agendaOpen} onOpenChange={setAgendaOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {fmtKey(agendaDate) === fmtKey(todayStart)
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
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="divide-y divide-border rounded-xl border border-border overflow-hidden max-h-[520px] overflow-y-auto">
              {tasksQ.isLoading && <div className="text-center text-sm text-muted-foreground py-8">Carregando…</div>}
              {!tasksQ.isLoading && agendaTasks.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">Nenhuma tarefa em aberto no período.</div>
              )}
              {agendaTasks.map((t) => {
                const overdue = !!t.due_date && t.due_date < fmtKey(todayStart);
                return (
                  <div key={t.id} className={cn("px-3 py-2.5", overdue ? "bg-destructive/5" : "bg-surface")}>
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{t.titulo}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {t.cliente_nome ?? "Sem cliente vinculado"}
                        </div>
                      </div>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0", PRIO_CLS[t.prioridade] ?? PRIO_CLS["media"])}>
                        {t.prioridade}
                      </span>
                      <div className={cn("text-xs shrink-0", overdue ? "text-destructive font-semibold" : "text-muted-foreground")}>
                        {t.due_date ? new Date(t.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Button asChild variant="ghost" size="sm" className="w-full mt-2">
              <Link to="/carregadores/tarefas">Ver todas as tarefas</Link>
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Últimas propostas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
              {!isLoading && props.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma proposta emitida ainda.</p>
              )}
              {props.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 border-b border-border last:border-0 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.cliente_nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.numero ?? "—"} • {p.uf} • {p.status}
                    </div>
                  </div>
                  <div className="text-sm font-semibold shrink-0">{fmtBRL(valorProposta(p))}</div>
                </div>
              ))}
              <Button asChild variant="ghost" size="sm" className="w-full mt-1">
                <Link to="/carregadores/propostas">Ver todas</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Seção: Pipeline */}
        <div>
          <h2 className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-semibold">Pipeline comercial</h2>
          <h3 className="font-display font-bold text-xl mt-1">Orçamentos &amp; Previsões de Fechamento</h3>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Orçamentos */}
          <div className="glass rounded-2xl p-5 border border-border">
            <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
              <div>
                <h3 className="font-display font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Orçamentos
                  {propsQ.isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filteredProps.length} proposta(s) · {fmtBRL(filteredTotal)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3 text-xs">
              <Chip label="Todas" active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
              {statusList.map((s) => (
                <Chip key={s} label={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
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
                <Chip key={o.k} label={o.l} active={ageFilter === o.k} onClick={() => setAgeFilter(o.k)} />
              ))}
            </div>

            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {isLoading && <div className="text-center text-sm text-muted-foreground py-8">Carregando…</div>}
              {!isLoading && filteredProps.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">Nenhuma proposta no filtro.</div>
              )}
              {filteredProps.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface hover:border-primary/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", STATUS_CLS[p.status] ?? "bg-surface-2 text-muted-foreground")}>
                        {p.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground">· {p.uf}</span>
                    </div>
                    <div className="text-sm font-medium truncate mt-0.5">{p.cliente_nome}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{p.numero ?? "—"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display font-bold text-sm">{fmtBRL(valorProposta(p))}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Previsão de fechamento */}
          <div className="glass rounded-2xl p-5 border border-border">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 className="font-display font-semibold flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-primary" /> Previsão de fechamento
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Propostas em aberto — previsão de 30 dias a partir da emissão
                </p>
              </div>
              <div className="flex flex-wrap bg-surface-2 rounded-lg p-0.5 border border-border text-xs gap-0.5">
                {([
                  { k: "all", l: "Todos" },
                  { k: "7d", l: "≤ 7d" },
                  { k: "15-30", l: "15–30d" },
                  { k: "30-60", l: "30–60d" },
                  { k: "60+", l: "+60d" },
                  { k: "atrasados", l: "Atrasados" },
                ] as const).map((o) => (
                  <button
                    key={o.k}
                    onClick={() => setForecastFilter(o.k)}
                    className={cn(
                      "px-2.5 py-1 rounded-md",
                      forecastFilter === o.k ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {isLoading && <div className="text-center text-sm text-muted-foreground py-8">Carregando…</div>}
              {!isLoading && forecasts.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">Nenhuma previsão nesse período.</div>
              )}
              {forecasts.map(({ p, date, diff }) => {
                const late = diff < 0;
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "p-3 rounded-xl border bg-surface transition-colors",
                      late ? "border-destructive/40 bg-destructive/5" : "border-border hover:border-primary/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{p.cliente_nome}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{p.numero ?? "—"} · {p.uf}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-1 flex-wrap">
                          <CalendarClock className="h-3 w-3" />
                          {date.toLocaleDateString("pt-BR")}
                          {late ? (
                            <span className="text-destructive font-semibold">· atrasado {Math.abs(diff)}d</span>
                          ) : (
                            <span>· em {diff}d</span>
                          )}
                          <span className={cn("px-1.5 py-0.5 rounded", STATUS_CLS[p.status] ?? "bg-surface-2")}>{p.status}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-display font-bold text-sm">{fmtBRL(valorProposta(p))}</div>
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

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-md border",
        active ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 border-border text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}

function SortOpt({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left text-sm px-2 py-1.5 rounded hover:bg-surface-2 flex items-center justify-between",
        active && "font-semibold text-primary",
      )}
    >
      {label} {active && <Check className="h-3.5 w-3.5" />}
    </button>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-display font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
