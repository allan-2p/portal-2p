import { cn } from "@/lib/utils";
import { useMemo } from "react";

export type PeriodPreset = "day" | "week" | "month" | "quarter" | "year";

export type PeriodRange = {
  preset: PeriodPreset;
  start: string; // YYYY-MM-DD
  end: string;
  label: string;
};

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function computeRange(preset: PeriodPreset, ref = new Date()): PeriodRange {
  const now = new Date(ref);
  if (preset === "day") {
    const s = ymd(now);
    return { preset, start: s, end: s, label: "Hoje" };
  }
  if (preset === "week") {
    const start = new Date(now); start.setDate(now.getDate() - 6);
    return { preset, start: ymd(start), end: ymd(now), label: "Últimos 7 dias" };
  }
  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { preset, start: ymd(start), end: ymd(now), label: "Mês atual" };
  }
  if (preset === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    return { preset, start: ymd(start), end: ymd(now), label: `T${q + 1} · ${now.getFullYear()}` };
  }
  // year → 2026 completo (ou ano atual se depois)
  const year = Math.max(2026, now.getFullYear());
  const start = new Date(year, 0, 1);
  const end = year === now.getFullYear() ? now : new Date(year, 11, 31);
  return { preset, start: ymd(start), end: ymd(end), label: `${year}` };
}

export function PeriodPicker({
  value,
  onChange,
  className,
}: {
  value: PeriodPreset;
  onChange: (p: PeriodPreset) => void;
  className?: string;
}) {
  const items: Array<{ k: PeriodPreset; l: string }> = useMemo(
    () => [
      { k: "day", l: "Dia" },
      { k: "week", l: "Semana" },
      { k: "month", l: "Mês" },
      { k: "quarter", l: "Trimestre" },
      { k: "year", l: "2026" },
    ],
    [],
  );
  return (
    <div className={cn("flex bg-surface-2 rounded-lg p-0.5 border border-border text-xs", className)}>
      {items.map((it) => (
        <button
          key={it.k}
          onClick={() => onChange(it.k)}
          className={cn(
            "px-2.5 py-1.5 rounded-md font-medium transition-colors",
            value === it.k
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {it.l}
        </button>
      ))}
    </div>
  );
}
