import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { calendarTasks, type CalendarTask } from "@/lib/mock-data";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Phone, Mail, MapPin, Users as UsersIcon, ListChecks, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tarefas")({
  head: () => ({ meta: [{ title: "Tarefas — Portal 2P" }, { name: "description", content: "Calendário de tarefas integrado ao Salesforce." }] }),
  component: TarefasPage,
});

const TYPE_ICON: Record<CalendarTask["type"], typeof Phone> = {
  "Ligação": Phone,
  "E-mail": Mail,
  "Visita": MapPin,
  "Reunião": UsersIcon,
  "Follow-up": ListChecks,
};
const TYPE_COLOR: Record<CalendarTask["type"], string> = {
  "Ligação": "bg-primary/15 text-primary",
  "E-mail": "bg-[color:var(--atlas)]/15 text-[color:var(--atlas)]",
  "Visita": "bg-success/15 text-success",
  "Reunião": "bg-warning/20 text-[color:var(--warning)]",
  "Follow-up": "bg-surface-2 text-muted-foreground",
};

function fmtKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function TarefasPage() {
  const [cursor, setCursor] = useState(new Date("2026-06-01"));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthName = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0=dom
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date("2026-06-29");

  const cells: Array<{ date: Date; key: string } | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    cells.push({ date, key: fmtKey(date) });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const tasksByDay: Record<string, CalendarTask[]> = {};
  for (const t of calendarTasks) (tasksByDay[t.date] ||= []).push(t);

  const selectedTasks = selectedDay ? (tasksByDay[selectedDay] ?? []) : [];

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Salesforce</div>
            <h1 className="text-3xl font-bold mt-1">Tarefas do mês</h1>
            <p className="text-sm text-muted-foreground mt-1">Visualização de calendário sincronizada com o Salesforce.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-2 rounded-lg bg-surface border border-border hover:bg-surface-2">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="px-4 py-2 rounded-lg bg-surface border border-border font-display font-semibold capitalize min-w-[180px] text-center">
              {monthName}
            </div>
            <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-2 rounded-lg bg-surface border border-border hover:bg-surface-2">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={() => setCursor(new Date(2026, 5, 1))} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
              Hoje
            </button>
          </div>
        </div>

        <div className="glass rounded-2xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border bg-surface-2/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div key={d} className="px-3 py-2 text-center font-semibold">{d}</div>
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
                    <span className={cn(
                      "text-sm font-semibold w-6 h-6 flex items-center justify-center rounded-full",
                      isToday && "bg-primary text-primary-foreground",
                    )}>
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
                      const Icon = TYPE_ICON[t.type];
                      return (
                        <div key={t.id} className={cn("flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded truncate", TYPE_COLOR[t.type])}>
                          <Icon className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{t.time} {t.title}</span>
                        </div>
                      );
                    })}
                    {items.length > 2 && (
                      <div className="text-[10px] text-muted-foreground px-1.5">+{items.length - 2} mais</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detalhes do dia (drawer/modal) */}
      {selectedDay && (
        <>
          <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40" onClick={() => setSelectedDay(null)} />
          <aside className="fixed right-0 top-0 bottom-0 w-full sm:w-[420px] bg-surface border-l border-border z-50 flex flex-col">
            <header className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Tarefas do dia</div>
                <div className="font-display font-semibold capitalize">
                  {new Date(selectedDay).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                </div>
              </div>
              <button onClick={() => setSelectedDay(null)} className="p-2 hover:bg-surface-2 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedTasks.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-12">Nenhuma tarefa nesse dia.</div>
              )}
              {selectedTasks.map((t) => {
                const Icon = TYPE_ICON[t.type];
                return (
                  <div key={t.id} className="rounded-xl border border-border bg-background p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", TYPE_COLOR[t.type])}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn("text-[10px] uppercase tracking-wider font-semibold", TYPE_COLOR[t.type].split(" ").filter(c => c.startsWith("text-")).join(" "))}>
                            {t.type}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" /> {t.time}
                          </span>
                          <span className={cn("ml-auto text-[10px] px-1.5 py-0.5 rounded",
                            t.priority === "high" ? "bg-destructive/15 text-destructive" :
                            t.priority === "medium" ? "bg-warning/20 text-[color:var(--warning)]" :
                            "bg-surface-2 text-muted-foreground")}>
                            {t.priority}
                          </span>
                        </div>
                        <div className="font-semibold text-sm">{t.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{t.client}</div>
                        {t.notes && <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{t.notes}</p>}
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
