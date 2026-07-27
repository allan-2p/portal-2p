import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, ExternalLink, AlertCircle } from "lucide-react";
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
  if (s.includes("ativa")) return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
  if (s.includes("entregue") || s.includes("concluíd")) return "bg-blue-500/15 text-blue-500 border-blue-500/30";
  if (s.includes("planejad") || s.includes("planejada")) return "bg-amber-500/15 text-amber-600 border-amber-500/30";
  if (s.includes("cancel")) return "bg-destructive/15 text-destructive border-destructive/30";
  return "bg-surface-2 text-muted-foreground border-border";
}

export function NotionCalendarCard({ start, end, unit, accent }: Props) {
  const fetchCal = useServerFn(getNotionCalendar);
  const q = useQuery({
    queryKey: ["notion-calendar", unit, start, end],
    queryFn: () => fetchCal({ data: { start, end, unit } }),
    staleTime: 5 * 60_000,
  });

  const events = q.data?.events ?? [];
  const grouped = useMemo(() => {
    const map = new Map<string, NotionCalendarEvent[]>();
    for (const e of events) {
      const k = (e.start ?? "").slice(0, 7); // yyyy-mm
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

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4" style={{ color: accent }} />
          <div>
            <div className="font-display font-semibold text-lg">Calendário editorial</div>
            <div className="text-xs text-muted-foreground">Notion · Campanhas & Promoções</div>
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {q.isLoading ? "Carregando…" : `${events.length} eventos`}
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

      {events.length > 0 && (
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
