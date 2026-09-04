import { createFileRoute } from "@tanstack/react-router";
import { useHashAction } from "@/hooks/use-hash-action";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  MapPin,
  Users as UsersIcon,
  ListChecks,
  X,
  Loader2,
  AlertCircle,
  User,
  Building2,
  CalendarDays,
  Rows3,
  CheckCircle2,
  CalendarPlus,
  MessageSquare,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSalesforceTasks, type SalesforceTask } from "@/lib/salesforce.functions";
import { VendedorFilter } from "@/components/vendedor-filter";
import { useScopedOwner } from "@/hooks/use-seller-scope";
import {
  CompleteTaskDialog,
  InteractionQuickDialog,
  NewTaskDialog,
  RescheduleTaskDialog,
  loadTaskInteractions,
  persistTaskInteractions,
  type TaskInteractionState,
} from "@/components/tarefas/task-dialogs";

export const Route = createFileRoute("/_authenticated/solar/tarefas")({
  head: () => ({
    meta: [
      { title: "Tarefas — Portal 2P" },
      {
        name: "description",
        content:
          "Agenda de tarefas sincronizada com o Salesforce: calendário, lista, conclusão e adiamento.",
      },
      { property: "og:title", content: "Tarefas — Portal 2P" },
      {
        property: "og:description",
        content:
          "Agenda de tarefas sincronizada com o Salesforce: calendário, lista, conclusão e adiamento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "/solar/tarefas" },
    ],
    links: [{ rel: "canonical", href: "/solar/tarefas" }],
  }),

  component: TarefasPage,
});

type TaskType = "Ligação" | "E-mail" | "Visita" | "Reunião" | "Follow-up";

const TYPE_ICON: Record<TaskType, typeof Phone> = {
  "Ligação": Phone,
  "E-mail": Mail,
  "Visita": MapPin,
  "Reunião": UsersIcon,
  "Follow-up": ListChecks,
};
const TYPE_COLOR: Record<TaskType, string> = {
  "Ligação": "bg-primary/15 text-primary",
  "E-mail": "bg-[color:var(--atlas)]/15 text-[color:var(--atlas)]",
  "Visita": "bg-success/15 text-success",
  "Reunião": "bg-warning/20 text-[color:var(--warning)]",
  "Follow-up": "bg-surface-2 text-muted-foreground",
};

function inferType(subject: string): TaskType {
  const s = subject.toLowerCase();
  if (/(ligaç|ligar|call|telefon)/.test(s)) return "Ligação";
  if (/(e-?mail|enviar email|responder email)/.test(s)) return "E-mail";
  if (/(visita|visitar)/.test(s)) return "Visita";
  if (/(reuni|meeting|apresent)/.test(s)) return "Reunião";
  return "Follow-up";
}

type Prio = "high" | "medium" | "low";
function mapPriority(p: string | null): Prio {
  const v = (p ?? "").toLowerCase();
  if (v.startsWith("alt") || v === "high") return "high";
  if (v.startsWith("baix") || v === "low") return "low";
  return "medium";
}
const PRIO_CLASS: Record<Prio, string> = {
  high: "bg-destructive/15 text-destructive",
  medium: "bg-warning/20 text-[color:var(--warning)]",
  low: "bg-surface-2 text-muted-foreground",
};

function fmtKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDia(key: string) {
  return new Date(`${key}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function TarefasPage() {
  const qc = useQueryClient();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [view, setView] = useState<"calendario" | "lista">("lista");
  const [busca, setBusca] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const { ownerId, setOwnerId, ownerParam, dataEnabled } = useScopedOwner("all");

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthName = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = new Date(year, month, 1).getDay();
  const today = new Date();

  const range = useMemo(() => {
    const start = fmtKey(new Date(year, month, 1));
    const end = fmtKey(new Date(year, month, daysInMonth));
    return { start, end };
  }, [year, month, daysInMonth]);

  const fetchTasks = useServerFn(getSalesforceTasks);
  const tasksQuery = useQuery({
    queryKey: ["sf-tasks", range.start, range.end, ownerParam],
    queryFn: () => fetchTasks({ data: { ...range, ownerId: ownerParam } }),
    enabled: dataEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const recarregar = () => qc.invalidateQueries({ queryKey: ["sf-tasks"] });

  const tasksByDay = useMemo(() => {
    const map: Record<string, SalesforceTask[]> = {};
    for (const t of tasksQuery.data?.records ?? []) (map[t.date] ||= []).push(t);
    return map;
  }, [tasksQuery.data]);

  const listaFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const arr = [...(tasksQuery.data?.records ?? [])].filter((t) =>
      q
        ? [t.subject, t.who, t.what, t.owner, t.status]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        : true,
    );
    return arr.sort((a, b) => a.date.localeCompare(b.date));
  }, [tasksQuery.data, busca]);

  const gruposLista = useMemo(() => {
    const map = new Map<string, SalesforceTask[]>();
    for (const t of listaFiltrada) {
      const arr = map.get(t.date) ?? [];
      arr.push(t);
      map.set(t.date, arr);
    }
    return [...map.entries()];
  }, [listaFiltrada]);

  const cells: Array<{ date: Date; key: string } | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    cells.push({ date, key: fmtKey(date) });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedTasks = selectedDay ? tasksByDay[selectedDay] ?? [] : [];

  // Ações (mesmos diálogos da home).
  const [taskInteractions, setTaskInteractions] = useState<Record<string, TaskInteractionState>>(
    () => loadTaskInteractions(),
  );
  const setTaskInteraction = (taskId: string, s: TaskInteractionState | null) => {
    setTaskInteractions((prev) => {
      const next = { ...prev };
      if (s) next[taskId] = s;
      else delete next[taskId];
      persistTaskInteractions(next);
      return next;
    });
  };
  const [detalheTask, setDetalheTask] = useState<SalesforceTask | null>(null);
  const [interactionTask, setInteractionTask] = useState<SalesforceTask | null>(null);
  const [completeTask, setCompleteTask] = useState<SalesforceTask | null>(null);
  const [rescheduleTask, setRescheduleTask] = useState<SalesforceTask | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  useHashAction("novo", () => setNewTaskOpen(true));

  const AcoesTarefa = ({ t, compact }: { t: SalesforceTask; compact?: boolean }) => (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDetalheTask(t)}>
        <ListChecks className="h-3.5 w-3.5" /> {compact ? "Abrir" : "Abrir tarefa"}
      </Button>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setInteractionTask(t)}>
        <MessageSquare className="h-3.5 w-3.5" /> Interação
      </Button>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRescheduleTask(t)}>
        <CalendarPlus className="h-3.5 w-3.5" /> Adiar
      </Button>
      <Button size="sm" className="gap-1.5" onClick={() => setCompleteTask(t)}>
        <CheckCircle2 className="h-3.5 w-3.5" /> Concluir
      </Button>
    </div>
  );

  const CardTarefa = ({ t }: { t: SalesforceTask }) => {
    const type = inferType(t.subject);
    const Icon = TYPE_ICON[type];
    const prio = mapPriority(t.priority);
    const jaInteragiu = !!taskInteractions[t.id];
    return (
      <div className="rounded-xl border border-border bg-background p-4 hover:border-primary/40 transition-colors">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
              TYPE_COLOR[type],
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                {type}
              </span>
              {t.status && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-muted-foreground">
                  {t.status}
                </span>
              )}
              {jaInteragiu && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success">
                  Interação registrada
                </span>
              )}
              <span className={cn("ml-auto text-[10px] px-1.5 py-0.5 rounded", PRIO_CLASS[prio])}>
                {t.priority ?? "—"}
              </span>
            </div>
            <button
              onClick={() => setDetalheTask(t)}
              className="font-semibold text-sm text-left hover:text-primary"
            >
              {t.subject}
            </button>
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {t.who && (
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3" /> {t.who}
                </div>
              )}
              {t.what && (
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" /> {t.what}
                </div>
              )}
              {t.owner && <div className="opacity-70">Responsável: {t.owner}</div>}
            </div>
            <div className="mt-3">
              <AcoesTarefa t={t} compact />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              Salesforce
              {tasksQuery.isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>
            <h1 className="text-3xl font-bold mt-1">Tarefas do mês</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {tasksQuery.data
                ? `${tasksQuery.data.totalSize} tarefa(s) sincronizada(s) para ${monthName}.`
                : "Carregando tarefas sincronizadas do Salesforce…"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setView("lista")}
                className={cn(
                  "px-3 py-2 text-sm flex items-center gap-1.5",
                  view === "lista" ? "bg-primary text-primary-foreground" : "bg-surface hover:bg-surface-2",
                )}
              >
                <Rows3 className="h-4 w-4" /> Lista
              </button>
              <button
                onClick={() => setView("calendario")}
                className={cn(
                  "px-3 py-2 text-sm flex items-center gap-1.5",
                  view === "calendario"
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface hover:bg-surface-2",
                )}
              >
                <CalendarDays className="h-4 w-4" /> Calendário
              </button>
            </div>
            <VendedorFilter value={ownerId} onChange={setOwnerId} />
            <button
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              aria-label="Mês anterior"
              className="p-2 rounded-lg bg-surface border border-border hover:bg-surface-2"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="px-4 py-2 rounded-lg bg-surface border border-border font-display font-semibold capitalize min-w-[180px] text-center">
              {monthName}
            </div>
            <button
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              aria-label="Próximo mês"
              className="p-2 rounded-lg bg-surface border border-border hover:bg-surface-2"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="px-3 py-2 rounded-lg bg-surface border border-border text-sm font-medium hover:bg-surface-2"
            >
              Hoje
            </button>
            <Button className="gap-2" onClick={() => setNewTaskOpen(true)}>
              <Plus className="h-4 w-4" /> Nova tarefa
            </Button>
          </div>
        </div>

        {tasksQuery.isError && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-sm px-4 py-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">Não foi possível carregar as tarefas.</div>
              <div className="opacity-80">
                {tasksQuery.error instanceof Error ? tasksQuery.error.message : "Erro desconhecido."}
              </div>
            </div>
          </div>
        )}

        {view === "lista" ? (
          <div className="glass rounded-2xl p-4 space-y-4">
            <div className="relative max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por assunto, cliente, contato ou responsável…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            {tasksQuery.isLoading && (
              <div className="text-sm text-muted-foreground py-10 text-center">
                Carregando tarefas…
              </div>
            )}
            {!tasksQuery.isLoading && gruposLista.length === 0 && (
              <div className="text-sm text-muted-foreground py-10 text-center">
                Nenhuma tarefa encontrada para {monthName}.
              </div>
            )}

            {gruposLista.map(([dia, itens]) => (
              <section key={dia} className="space-y-2">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <span
                    className={cn(
                      "font-semibold",
                      dia === fmtKey(today) && "text-primary",
                    )}
                  >
                    {fmtDia(dia)}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                  <span>{itens.length} tarefa(s)</span>
                </div>
                <div className="grid gap-2 lg:grid-cols-2">
                  {itens.map((t) => (
                    <CardTarefa key={t.id} t={t} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="glass rounded-2xl overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border bg-surface-2/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                <div key={d} className="px-3 py-2 text-center font-semibold">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 auto-rows-[110px]">
              {cells.map((c, i) => {
                if (!c)
                  return (
                    <div key={i} className="border-r border-b border-border/50 bg-surface-2/30" />
                  );
                const items = tasksByDay[c.key] ?? [];
                const isToday = fmtKey(today) === c.key;
                const isWeekend = c.date.getDay() === 0 || c.date.getDay() === 6;
                return (
                  <button
                    key={c.key}
                    onClick={() => setSelectedDay(c.key)}
                    className={cn(
                      "text-left p-2 border-r border-b border-border/50 hover:bg-primary/5 transition-colors relative flex flex-col gap-1",
                      isWeekend && "bg-surface-2/20",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-sm font-semibold w-6 h-6 flex items-center justify-center rounded-full",
                          isToday && "bg-primary text-primary-foreground",
                        )}
                      >
                        {c.date.getDate()}
                      </span>
                      {items.length > 0 && (
                        <span className="text-[10px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded-full">
                          {items.length}
                        </span>
                      )}
                    </div>
                    <div className="space-y-0.5 overflow-hidden">
                      {items.slice(0, 2).map((t) => {
                        const type = inferType(t.subject);
                        const Icon = TYPE_ICON[type];
                        return (
                          <div
                            key={t.id}
                            className={cn(
                              "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded truncate",
                              TYPE_COLOR[type],
                            )}
                          >
                            <Icon className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{t.subject}</span>
                          </div>
                        );
                      })}
                      {items.length > 2 && (
                        <div className="text-[10px] text-muted-foreground px-1.5">
                          +{items.length - 2} mais
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {selectedDay && (
        <>
          <div
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
            onClick={() => setSelectedDay(null)}
            aria-label="Fechar detalhes do dia"
          />
          <aside className="fixed right-0 top-0 bottom-0 w-full sm:w-[460px] bg-surface border-l border-border z-50 flex flex-col">
            <header className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Tarefas do dia · Salesforce
                </div>
                <div className="font-display font-semibold capitalize">
                  {new Date(selectedDay + "T00:00:00").toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                  })}
                </div>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-2 hover:bg-surface-2 rounded-lg"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedTasks.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-12">
                  Nenhuma tarefa nesse dia.
                </div>
              )}
              {selectedTasks.map((t) => (
                <CardTarefa key={t.id} t={t} />
              ))}
            </div>
          </aside>
        </>
      )}

      {/* Detalhe da tarefa */}
      {detalheTask && (
        <>
          <div
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[60]"
            onClick={() => setDetalheTask(null)}
            aria-label="Fechar tarefa"
          />
          <aside className="fixed right-0 top-0 bottom-0 w-full sm:w-[460px] bg-surface border-l border-border z-[61] flex flex-col">
            <header className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Tarefa · Salesforce
                </div>
                <div className="font-display font-semibold truncate">{detalheTask.subject}</div>
              </div>
              <button
                onClick={() => setDetalheTask(null)}
                className="p-2 hover:bg-surface-2 rounded-lg"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Vencimento" value={fmtDia(detalheTask.date)} />
                <Campo label="Prioridade" value={detalheTask.priority ?? "—"} />
                <Campo label="Status" value={detalheTask.status ?? "—"} />
                <Campo label="Responsável" value={detalheTask.owner ?? "—"} />
                <Campo label="Cliente" value={detalheTask.what ?? "—"} />
                <Campo label="Contato" value={detalheTask.who ?? "—"} />
              </div>
              {detalheTask.description && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                    Descrição
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {detalheTask.description}
                  </p>
                </div>
              )}
            </div>
            <footer className="px-5 py-4 border-t border-border">
              <AcoesTarefa t={detalheTask} />
            </footer>
          </aside>
        </>
      )}

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
          setDetalheTask(null);
          setCompleteTask(null);
          recarregar();
        }}
      />

      <RescheduleTaskDialog
        task={rescheduleTask}
        onClose={() => setRescheduleTask(null)}
        onDone={() => {
          setRescheduleTask(null);
          setDetalheTask(null);
          recarregar();
        }}
      />

      <NewTaskDialog
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        onDone={() => {
          setNewTaskOpen(false);
          recarregar();
        }}
      />
    </AppLayout>
  );
}

function Campo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5 break-words">{value}</div>
    </div>
  );
}
