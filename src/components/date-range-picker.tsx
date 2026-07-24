import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const YEAR = 2026;
const YEAR_START = new Date(YEAR, 0, 1);
const YEAR_END = new Date(YEAR, 11, 31);

const pad = (n: number) => String(n).padStart(2, "0");
export function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fromYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtBR(d: Date) { return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; }

function clampToYear(d: Date): Date {
  if (d < YEAR_START) return YEAR_START;
  if (d > YEAR_END) return YEAR_END;
  return d;
}

export type DateRangeValue = { start: string; end: string; label: string };

export function todayOr2026End(): Date {
  const now = new Date();
  return now.getFullYear() === YEAR ? now : (now.getFullYear() > YEAR ? YEAR_END : YEAR_START);
}

export function defaultRange(): DateRangeValue {
  const now = todayOr2026End();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: ymd(start), end: ymd(now), label: "Mês atual" };
}

type Preset = { k: string; label: string; make: () => { from: Date; to: Date } };
const PRESETS: Preset[] = [
  { k: "7d", label: "Últimos 7 dias", make: () => { const to = todayOr2026End(); const from = new Date(to); from.setDate(to.getDate() - 6); return { from: clampToYear(from), to }; } },
  { k: "30d", label: "Últimos 30 dias", make: () => { const to = todayOr2026End(); const from = new Date(to); from.setDate(to.getDate() - 29); return { from: clampToYear(from), to }; } },
  { k: "month", label: "Mês atual", make: () => { const to = todayOr2026End(); return { from: new Date(to.getFullYear(), to.getMonth(), 1), to }; } },
  { k: "prevmonth", label: "Mês anterior", make: () => { const now = todayOr2026End(); const from = new Date(now.getFullYear(), now.getMonth() - 1, 1); const to = new Date(now.getFullYear(), now.getMonth(), 0); return { from: clampToYear(from), to: clampToYear(to) }; } },
  { k: "quarter", label: "Trimestre atual", make: () => { const now = todayOr2026End(); const q = Math.floor(now.getMonth() / 3); return { from: new Date(now.getFullYear(), q * 3, 1), to: now }; } },
  { k: "year", label: "2026 completo", make: () => ({ from: YEAR_START, to: YEAR_END }) },
];

export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DateRange | undefined>({
    from: fromYmd(value.start),
    to: fromYmd(value.end),
  });

  React.useEffect(() => {
    setDraft({ from: fromYmd(value.start), to: fromYmd(value.end) });
  }, [value.start, value.end]);

  const apply = (from: Date, to: Date, label?: string) => {
    const f = clampToYear(from);
    const t = clampToYear(to);
    onChange({ start: ymd(f), end: ymd(t), label: label ?? `${fmtBR(f)} → ${fmtBR(t)}` });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 gap-2 font-normal text-xs", className)}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          <span className="tabular-nums">
            {fmtBR(fromYmd(value.start))} → {fmtBR(fromYmd(value.end))}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 flex" align="end">
        <div className="border-r border-border p-2 flex flex-col gap-1 min-w-[150px]">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">Períodos</div>
          {PRESETS.map((p) => (
            <button
              key={p.k}
              onClick={() => { const { from, to } = p.make(); apply(from, to, p.label); }}
              className="text-left text-xs px-2 py-1.5 rounded hover:bg-surface-2 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="p-2">
          <Calendar
            mode="range"
            selected={draft}
            onSelect={(r) => {
              setDraft(r);
              if (r?.from && r?.to) apply(r.from, r.to);
            }}
            numberOfMonths={2}
            defaultMonth={draft?.from ?? YEAR_START}
            startMonth={YEAR_START}
            endMonth={YEAR_END}
            disabled={{ before: YEAR_START, after: YEAR_END }}
            className={cn("p-3 pointer-events-auto")}
          />
          <div className="text-[10px] text-muted-foreground px-3 pb-2">
            Datas limitadas ao ano de 2026.
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
