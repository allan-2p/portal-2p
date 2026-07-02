import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSalesforceTasks, type SalesforceTask } from "@/lib/salesforce.functions";
import { VendedorFilter } from "@/components/vendedor-filter";

export const Route = createFileRoute("/_authenticated/tarefas")({
  head: () => ({
    meta: [
      { title: "Tarefas — Portal 2P" },
      { name: "description", content: "Calendário de tarefas sincronizado com o Salesforce." },
    ],
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

function fmtKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function TarefasPage() {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string>("all");
  const ownerParam = ownerId === "all" ? null : ownerId;

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
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const tasksByDay = useMemo(() => {
    const map: Record<string, SalesforceTask[]> = {};
    for (const t of tasksQuery.data?.records ?? []) (map[t.date] ||= []).push(t);
    return map;
  }, [tasksQuery.data]);

  const cells: Array<{ date: Date; key: string } | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    cells.push({ date, key: fmtKey(date) });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedTasks = selectedDay ? tasksByDay[selectedDay] ?? [] : [];

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="p-2 rounded-lg bg-surface border border-border hover:bg-surface-2"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="px-4 py-2 rounded-lg bg-surface border border-border font-display font-semibold capitalize min-w-[180px] text-center">
              {monthName}
            </div>
            <button
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="p-2 rounded-lg bg-surface border border-border hover:bg-surface-2"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            >
              Hoje
            </button>
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
              if (!c) return <div key={i} className="border-r border-b border-border/50 bg-surface-2/30" />;
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
      </div>

      {selectedDay && (
        <>
          <div
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
            onClick={() => setSelectedDay(null)}
          />
          <aside className="fixed right-0 top-0 bottom-0 w-full sm:w-[440px] bg-surface border-l border-border z-50 flex flex-col">
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
              {selectedTasks.map((t) => {
                const type = inferType(t.subject);
                const Icon = TYPE_ICON[type];
                const prio = mapPriority(t.priority);
                return (
                  <div key={t.id} className="rounded-xl border border-border bg-background p-4">
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
                          <span
                            className={cn(
                              "text-[10px] uppercase tracking-wider font-semibold",
                              TYPE_COLOR[type]
                                .split(" ")
                                .filter((c) => c.startsWith("text-"))
                                .join(" "),
                            )}
                          >
                            {type}
                          </span>
                          {t.status && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-muted-foreground">
                              {t.status}
                            </span>
                          )}
                          <span
                            className={cn(
                              "ml-auto text-[10px] px-1.5 py-0.5 rounded",
                              prio === "high"
                                ? "bg-destructive/15 text-destructive"
                                : prio === "medium"
                                  ? "bg-warning/20 text-[color:var(--warning)]"
                                  : "bg-surface-2 text-muted-foreground",
                            )}
                          >
                            {t.priority ?? "—"}
                          </span>
                        </div>
                        <div className="font-semibold text-sm">{t.subject}</div>
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
                          {t.owner && (
                            <div className="opacity-70">Responsável: {t.owner}</div>
                          )}
                        </div>
                        {t.description && (
                          <p className="text-xs text-muted-foreground mt-2 leading-relaxed whitespace-pre-wrap">
                            {t.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </>
      )}
    </AppLayout>
  );
}
