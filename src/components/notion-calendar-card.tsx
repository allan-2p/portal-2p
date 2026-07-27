import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, ExternalLink, AlertCircle, ChevronLeft, ChevronRight, LayoutGrid, List } from "lucide-react";
import { getNotionCalendar, type NotionCalendarEvent } from "@/lib/notion.functions";
import { cn } from "@/lib/utils";

type Props = {
  start: string;
  end: string;
  unit: "solar" | "carregadores" | "station";
  accent: string;
};

function fmtBR(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function statusColor(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s.includes("public")) return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
  if (s.includes("ativa")) return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
  if (s.includes("entregue") || s.includes("concluíd")) return "bg-blue-500/15 text-blue-500 border-blue-500/30";
  if (s.includes("planejad") || s.includes("andamento") || s.includes("produç")) return "bg-amber-500/15 text-amber-600 border-amber-500/30";
  if (s.includes("não iniciado") || s.includes("nao iniciado")) return "bg-rose-500/15 text-rose-500 border-rose-500/30";
  if (s.includes("cancel")) return "bg-destructive/15 text-destructive border-destructive/30";
  return "bg-surface-2 text-muted-foreground border-border";
}

function statusDot(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s.includes("public") || s.includes("ativa")) return "bg-emerald-500";
  if (s.includes("entregue") || s.includes("concluíd")) return "bg-blue-500";
  if (s.includes("planejad") || s.includes("andamento") || s.includes("produç")) return "bg-amber-500";
  if (s.includes("não iniciado") || s.includes("nao iniciado")) return "bg-rose-500";
  if (s.includes("cancel")) return "bg-destructive";
  return "bg-muted-foreground";
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isoOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function eachDay(startIso: string, endIso: string): string[] {
  const days: string[] = [];
  const s = parseISO(startIso);
  const e = parseISO(endIso);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    days.push(isoOf(d));
  }
  return days;
}

export function NotionCalendarCard({ start, end, unit, accent }: Props) {
  const fetchCal = useServerFn(getNotionCalendar);
  const q = useQuery({
    queryKey: ["notion-calendar", unit, start, end],
    queryFn: () => fetchCal({ data: { start, end, unit } }),
    staleTime: 5 * 60_000,
  });

  const events = q.data?.events ?? [];
  const [view, setView] = useState<"grid" | "list">("grid");

  // Cursor month (defaults to the month of the range start)
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const d = parseISO(start);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const monthTitle = new Date(cursor.y, cursor.m, 1)
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  // Build month grid (Sun..Sat weeks)
  const weeks = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const startGrid = new Date(first);
    startGrid.setDate(first.getDate() - first.getDay()); // back to Sunday
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(startGrid);
      d.setDate(startGrid.getDate() + i);
      cells.push(d);
    }
    const out: Date[][] = [];
    for (let i = 0; i < 6; i++) out.push(cells.slice(i * 7, i * 7 + 7));
    return out;
  }, [cursor]);

  // Map ISO day -> events overlapping that day
  const eventsByDay = useMemo(() => {
    const map = new Map<string, NotionCalendarEvent[]>();
    for (const e of events) {
      if (!e.start) continue;
      const days = eachDay(e.start, e.end ?? e.start);
      for (const d of days) {
        const arr = map.get(d) ?? [];
        arr.push(e);
        map.set(d, arr);
      }
    }
    return map;
  }, [events]);

  const grouped = useMemo(() => {
    const map = new Map<string, NotionCalendarEvent[]>();
    for (const e of events) {
      const k = (e.start ?? "").slice(0, 7);
      const arr = map.get(k) ?? [];
      arr.push(e);
      map.set(k, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  const monthLabel = (yyyymm: string) => {
    if (!yyyymm) return "Sem data";
    const [y, m] = yyyymm.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  };

  const today = isoOf(new Date());
  const goPrev = () => setCursor(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }));
  const goNext = () => setCursor(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }));
  const goToday = () => {
    const d = new Date();
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4" style={{ color: accent }} />
          <div>
            <div className="font-display font-semibold text-lg">Calendário editorial</div>
            <div className="text-xs text-muted-foreground">Notion · Campanhas & Promoções</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {view === "grid" && (
            <div className="flex items-center gap-1 mr-1">
              <button onClick={goPrev} className="h-7 w-7 grid place-items-center rounded-md border border-border hover:bg-surface-2" aria-label="Mês anterior">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button onClick={goToday} className="h-7 px-2 rounded-md border border-border text-xs hover:bg-surface-2">
                Hoje
              </button>
              <button onClick={goNext} className="h-7 w-7 grid place-items-center rounded-md border border-border hover:bg-surface-2" aria-label="Próximo mês">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <div className="ml-2 text-sm font-medium capitalize min-w-[140px]">{monthTitle}</div>
            </div>
          )}
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setView("grid")}
              className={cn("h-7 px-2 text-xs inline-flex items-center gap-1", view === "grid" ? "bg-surface-2" : "hover:bg-surface-2/60")}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Grade
            </button>
            <button
              onClick={() => setView("list")}
              className={cn("h-7 px-2 text-xs inline-flex items-center gap-1 border-l border-border", view === "list" ? "bg-surface-2" : "hover:bg-surface-2/60")}
            >
              <List className="h-3.5 w-3.5" /> Lista
            </button>
          </div>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {q.isLoading ? "Carregando…" : `${events.length} eventos`}
          </div>
        </div>
      </div>

      {q.error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium">Erro ao carregar Notion</div>
            <div className="opacity-80 break-all">{(q.error as Error).message}</div>
          </div>
        </div>
      )}

      {!q.error && !q.isLoading && events.length === 0 && (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Nenhum evento no período. Verifique se o database do Notion está compartilhado com a integração e se tem propriedade de data.
        </div>
      )}

      {events.length > 0 && view === "grid" && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="grid grid-cols-7 bg-surface-2/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            {weekdays.map((w) => (
              <div key={w} className="px-2 py-1.5 text-center border-r border-border last:border-r-0">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 grid-rows-6">
            {weeks.flat().map((d, idx) => {
              const iso = isoOf(d);
              const inMonth = d.getMonth() === cursor.m;
              const isToday = iso === today;
              const dayEvents = eventsByDay.get(iso) ?? [];
              const shown = dayEvents.slice(0, 3);
              const overflow = dayEvents.length - shown.length;
              return (
                <div
                  key={idx}
                  className={cn(
                    "min-h-[110px] border-r border-b border-border p-1.5 last:border-r-0 flex flex-col gap-1",
                    !inMonth && "bg-surface-2/20 text-muted-foreground/60",
                    (idx + 1) % 7 === 0 && "border-r-0",
                    idx >= 35 && "border-b-0",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "text-[11px] tabular-nums h-5 w-5 grid place-items-center rounded-full",
                        isToday && "text-white font-semibold",
                      )}
                      style={isToday ? { backgroundColor: accent } : undefined}
                    >
                      {d.getDate()}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 min-h-0">
                    {shown.map((e) => (
                      <a
                        key={`${iso}-${e.id}`}
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        title={e.title}
                        className={cn(
                          "group flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] leading-tight truncate hover:brightness-125",
                          statusColor(e.status),
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDot(e.status))} />
                        <span className="truncate">{e.title}</span>
                      </a>
                    ))}
                    {overflow > 0 && (
                      <span className="text-[10px] text-muted-foreground px-1">+{overflow} mais</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {events.length > 0 && view === "list" && (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left px-3 py-2 font-medium">Campanha</th>
                <th className="text-left px-3 py-2 font-medium w-32">Início</th>
                <th className="text-left px-3 py-2 font-medium w-32">Término</th>
                <th className="text-left px-3 py-2 font-medium w-32">Status</th>
                <th className="text-left px-3 py-2 font-medium">Unidades</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {grouped.map(([month, rows]) => (
                <>
                  <tr key={`h-${month}`} className="bg-surface-2/40">
                    <td colSpan={6} className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {monthLabel(month)}
                    </td>
                  </tr>
                  {rows.map((e) => (
                    <tr key={e.id} className="border-b border-border/40 hover:bg-surface-2/30">
                      <td className="px-3 py-2 font-medium">{e.title}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{fmtBR(e.start)}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{fmtBR(e.end)}</td>
                      <td className="px-3 py-2">
                        {e.status ? (
                          <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px]", statusColor(e.status))}>
                            {e.status}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {e.units.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            e.units.map((u) => (
                              <span key={u} className="rounded-md bg-surface-2 text-[10px] px-1.5 py-0.5 border border-border">
                                {u}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <a href={e.url} target="_blank" rel="noreferrer" className="inline-flex text-muted-foreground hover:text-foreground">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
