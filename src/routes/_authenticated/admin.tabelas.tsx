import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Loader2,
  AlertTriangle,
  Search,
  Table as TableIcon,
  FileText,
  ShoppingCart,
  CalendarIcon,
  TrendingUp,
  CalendarDays,
  ShoppingBag,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getSalesforceOrcamentos,
  getSalesforceVendas,
  getSalesforceVendidoMesAtual,
  getSalesforceReportByName,
  type SalesforceOppRow,
  type SalesforceReportRow,
} from "@/lib/salesforce.functions";
import { useAuth } from "@/hooks/use-auth";




export const Route = createFileRoute("/_authenticated/admin/tabelas")({
  head: () => ({ meta: [{ title: "Tabelas — Portal 2P" }] }),
  component: TabelasPage,
});

const brl = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

function fmtKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type PeriodPreset = "custom" | "week" | "month" | "quarter" | "year";

function presetRange(preset: PeriodPreset): { from: Date; to: Date } | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  if (preset === "week") {
    const day = now.getDay();
    const from = new Date(y, m, d - day);
    const to = new Date(y, m, d - day + 6);
    return { from, to };
  }
  if (preset === "month") {
    return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0) };
  }
  if (preset === "quarter") {
    const q = Math.floor(m / 3);
    return { from: new Date(y, q * 3, 1), to: new Date(y, q * 3 + 3, 0) };
  }
  if (preset === "year") {
    return { from: new Date(y, 0, 1), to: new Date(y, 11, 31) };
  }
  return null;
}

function DateRangeFilter({
  from,
  to,
  preset,
  onChange,
}: {
  from: Date;
  to: Date;
  preset: PeriodPreset;
  onChange: (v: { from: Date; to: Date; preset: PeriodPreset }) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = `${from.toLocaleDateString("pt-BR")} — ${to.toLocaleDateString("pt-BR")}`;

  const setPreset = (p: PeriodPreset) => {
    const r = presetRange(p);
    if (r) onChange({ ...r, preset: p });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-xs">
        {(
          [
            { k: "week", l: "Semana" },
            { k: "month", l: "Mês" },
            { k: "quarter", l: "Trimestre" },
            { k: "year", l: "Ano" },
          ] as const
        ).map((o) => (
          <button
            key={o.k}
            onClick={() => setPreset(o.k)}
            className={cn(
              "px-2.5 py-1 rounded-md transition-colors",
              preset === o.k
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.l}
          </button>
        ))}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "justify-start text-left font-normal",
              preset === "custom" && "border-primary/50",
            )}
          >
            <CalendarIcon className="h-4 w-4" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            defaultMonth={from}
            selected={{ from, to }}
            onSelect={(r) => {
              if (r?.from && r?.to) {
                onChange({ from: r.from, to: r.to, preset: "custom" });
                setOpen(false);
              }
            }}
            numberOfMonths={2}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function OppTable({
  records,
  loading,
  error,
  search,
  dateField,
}: {
  records: SalesforceOppRow[];
  loading: boolean;
  error: unknown;
  search: string;
  dateField: "createdDate" | "closeDate";
}) {
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return records;
    return records.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        (r.account ?? "").toLowerCase().includes(s) ||
        (r.owner ?? "").toLowerCase().includes(s) ||
        (r.stage ?? "").toLowerCase().includes(s),
    );
  }, [records, search]);

  const totals = useMemo(() => {
    const acc = { total: 0, liq: 0, frete: 0, desc: 0 };
    for (const r of filtered) {
      acc.total += r.total ?? 0;
      acc.liq += r.valorLiq ?? 0;
      acc.frete += r.frete ?? 0;
      acc.desc += r.desconto ?? 0;
    }
    return acc;
  }, [filtered]);

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {!!error && (
        <div className="border-b border-destructive/40 bg-destructive/10 text-destructive text-sm px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <div>{error instanceof Error ? error.message : "Erro ao carregar dados"}</div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
              <th className="text-left px-4 py-2.5">Oportunidade</th>
              <th className="text-left px-4 py-2.5">Cliente</th>
              <th className="text-left px-4 py-2.5">Vendedor</th>
              <th className="text-left px-4 py-2.5">Etapa</th>
              <th className="text-left px-4 py-2.5">Tipo NF</th>
              <th className="text-left px-4 py-2.5">Data</th>
              <th className="text-right px-4 py-2.5">Valor Total</th>
              <th className="text-right px-4 py-2.5">Valor Líquido</th>
              <th className="text-right px-4 py-2.5">Frete</th>
              <th className="text-right px-4 py-2.5">Desconto</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="px-4 py-16 text-center text-muted-foreground text-sm">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2 align-middle" />
                  Carregando do Salesforce…
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.account ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.owner ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-muted-foreground">
                      {r.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.tipoNf ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(r[dateField])}</td>
                  <td className="px-4 py-3 text-right font-mono">{brl(r.total)}</td>
                  <td className="px-4 py-3 text-right font-mono">{brl(r.valorLiq)}</td>
                  <td className="px-4 py-3 text-right font-mono">{brl(r.frete)}</td>
                  <td className="px-4 py-3 text-right font-mono">{brl(r.desconto)}</td>
                </tr>
              ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
          </tbody>
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-surface-2/50 text-sm">
                <td colSpan={6} className="px-4 py-2.5 text-right text-muted-foreground uppercase tracking-wider text-[11px]">
                  Total ({filtered.length} {filtered.length === 1 ? "registro" : "registros"})
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold">{brl(totals.total)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold">{brl(totals.liq)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold">{brl(totals.frete)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold">{brl(totals.desc)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function quarterRange(year: number, q: number): { start: string; end: string; label: string } {
  // q is 1..4; wrap to previous year if 0
  let yy = year;
  let qq = q;
  if (qq < 1) { qq = 4; yy = year - 1; }
  if (qq > 4) { qq = 1; yy = year + 1; }
  const start = new Date(yy, (qq - 1) * 3, 1);
  const end = new Date(yy, qq * 3, 0);
  return { start: fmtKey(start), end: fmtKey(end), label: `Q${qq}/${yy}` };
}

function currentQuarter(): { year: number; q: number } {
  const now = new Date();
  return { year: now.getFullYear(), q: Math.floor(now.getMonth() / 3) + 1 };
}

type ProjectionRow = {
  account: string;
  prevSales: number;
  salesMonthly: number;
  salesQuarter: number;
  genMonthly: number;
  genQuarter: number;
};

function ProjectionsPanel({ search }: { search: string }) {
  const cur = useMemo(currentQuarter, []);
  const [selYear, setSelYear] = useState<number>(cur.year);
  const [selQ, setSelQ] = useState<number>(cur.q);

  // Base = trimestre anterior ao selecionado
  const baseRange = useMemo(() => quarterRange(selYear, selQ - 1), [selYear, selQ]);
  const targetLabel = useMemo(() => quarterRange(selYear, selQ).label, [selYear, selQ]);
  const range = baseRange;
  const fetchOrc = useServerFn(getSalesforceOrcamentos);
  const fetchVen = useServerFn(getSalesforceVendas);

  const qOrc = useQuery({
    queryKey: ["sf-orcamentos", range.start, range.end],
    queryFn: () => fetchOrc({ data: { start: range.start, end: range.end } }),
    staleTime: 60_000,
  });
  const qVen = useQuery({
    queryKey: ["sf-vendas", range.start, range.end],
    queryFn: () => fetchVen({ data: { start: range.start, end: range.end } }),
    staleTime: 60_000,
  });

  const loading = qOrc.isLoading || qVen.isLoading;
  const error = qOrc.error ?? qVen.error;
  const orcRecs = qOrc.data?.records ?? [];
  const venRecs = qVen.data?.records ?? [];

  // Taxa de conversão média (por contagem): fechados / gerados totais
  const generatedCount = orcRecs.length + venRecs.length;
  const closedCount = venRecs.length;
  const convRate = generatedCount > 0 ? closedCount / generatedCount : 0;

  const rows: ProjectionRow[] = useMemo(() => {
    const byAccount = new Map<string, number>();
    for (const v of venRecs) {
      const key = v.account ?? "(sem cliente)";
      byAccount.set(key, (byAccount.get(key) ?? 0) + (v.total ?? v.amount ?? 0));
    }
    const out: ProjectionRow[] = [];
    for (const [account, prevSales] of byAccount) {
      const salesMonthly = prevSales / 3;
      const salesQuarter = salesMonthly * 3;
      const genMonthly = convRate > 0 ? salesMonthly / convRate : 0;
      const genQuarter = genMonthly * 3;
      out.push({ account, prevSales, salesMonthly, salesQuarter, genMonthly, genQuarter });
    }
    return out.sort((a, b) => b.salesMonthly - a.salesMonthly);
  }, [venRecs, convRate]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => r.account.toLowerCase().includes(s));
  }, [rows, search]);

  const totals = useMemo(() => {
    const acc = { salesMonthly: 0, salesQuarter: 0, genMonthly: 0, genQuarter: 0 };
    for (const r of filtered) {
      acc.salesMonthly += r.salesMonthly;
      acc.salesQuarter += r.salesQuarter;
      acc.genMonthly += r.genMonthly;
      acc.genQuarter += r.genQuarter;
    }
    return acc;
  }, [filtered]);

  const quarters2026 = [1, 2, 3, 4];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">Projetar</span>
        <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-xs">
          {quarters2026.map((q) => {
            const active = selYear === 2026 && selQ === q;
            const isCurrent = cur.year === 2026 && cur.q === q;
            return (
              <button
                key={q}
                onClick={() => { setSelYear(2026); setSelQ(q); }}
                className={cn(
                  "px-3 py-1 rounded-md transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Q{q}/2026{isCurrent ? " • atual" : ""}
              </button>
            );
          })}
        </div>
      </div>

      <div className="glass rounded-2xl p-4 flex flex-wrap items-center gap-4 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Projeção alvo</div>
          <div className="font-medium">{targetLabel}</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Base (trimestre anterior)</div>
          <div className="font-medium">{range.label}</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Orçamentos gerados</div>
          <div className="font-medium">{generatedCount}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Fechados</div>
          <div className="font-medium">{closedCount}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Taxa de conversão</div>
          <div className="font-medium">
            {(convRate * 100).toFixed(1).replace(".", ",")}%
          </div>
        </div>
      </div>


      <div className="glass rounded-2xl overflow-hidden">
        {!!error && (
          <div className="border-b border-destructive/40 bg-destructive/10 text-destructive text-sm px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div>{error instanceof Error ? error.message : "Erro ao carregar dados"}</div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
                <th className="text-left px-4 py-2.5">Cliente</th>
                <th className="text-right px-4 py-2.5">Vendas {range.label}</th>
                <th className="text-right px-4 py-2.5">Projeção Vendas / mês</th>
                <th className="text-right px-4 py-2.5">Projeção Vendas / trim.</th>
                <th className="text-right px-4 py-2.5">Projeção Geração / mês</th>
                <th className="text-right px-4 py-2.5">Projeção Geração / trim.</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground text-sm">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2 align-middle" />
                    Calculando projeções…
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((r) => (
                  <tr key={r.account} className="border-b border-border/40 hover:bg-surface-2/50">
                    <td className="px-4 py-3 font-medium">{r.account}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">{brl(r.prevSales)}</td>
                    <td className="px-4 py-3 text-right font-mono">{brl(r.salesMonthly)}</td>
                    <td className="px-4 py-3 text-right font-mono">{brl(r.salesQuarter)}</td>
                    <td className="px-4 py-3 text-right font-mono">{brl(r.genMonthly)}</td>
                    <td className="px-4 py-3 text-right font-mono">{brl(r.genQuarter)}</td>
                  </tr>
                ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhum cliente com vendas no trimestre anterior.
                  </td>
                </tr>
              )}
            </tbody>
            {!loading && filtered.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-surface-2/50 text-sm">
                  <td className="px-4 py-2.5 text-right text-muted-foreground uppercase tracking-wider text-[11px]">
                    Total ({filtered.length})
                  </td>
                  <td />
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{brl(totals.salesMonthly)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{brl(totals.salesQuarter)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{brl(totals.genMonthly)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{brl(totals.genQuarter)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

// ----- Concentração de fechamentos por semana do mês ----- //

function weekOfMonth(dateStr: string): number {
  // Retorna 0..3 dividindo o mês em 4 partes proporcionais.
  const [y, m, d] = dateStr.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const idx = Math.floor(((d - 1) * 4) / lastDay);
  return Math.max(0, Math.min(3, idx));
}

function weekLabelRange(monthLen: number, i: number): string {
  const step = monthLen / 4;
  const startD = Math.floor(i * step) + 1;
  const endD = i === 3 ? monthLen : Math.floor((i + 1) * step);
  return `dia ${startD} a ${endD}`;
}

function WeeksPanel({
  records,
  loading,
  error,
}: {
  records: SalesforceOppRow[];
  loading: boolean;
  error: unknown;
}) {
  const stats = useMemo(() => {
    const buckets = [0, 0, 0, 0];
    const counts = [0, 0, 0, 0];
    let total = 0;
    for (const r of records) {
      if (!r.closeDate) continue;
      const v = r.total ?? r.valorLiq ?? r.amount ?? 0;
      const w = weekOfMonth(r.closeDate);
      buckets[w] += v;
      counts[w] += 1;
      total += v;
    }
    return { buckets, counts, total };
  }, [records]);

  const maxBucket = Math.max(...stats.buckets, 1);
  // Usa o mês atual como referência dos rótulos de dias
  const now = new Date();
  const monthLen = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {!!error && (
        <div className="border-b border-destructive/40 bg-destructive/10 text-destructive text-sm px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <div>{error instanceof Error ? error.message : "Erro ao carregar dados"}</div>
        </div>
      )}
      <div className="p-4 border-b border-border text-sm text-muted-foreground">
        Distribuição de fechamentos por semana do mês no período selecionado. Cada mês é dividido
        em 4 semanas proporcionais — a primeira ou a última é esticada quando necessário.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
              <th className="text-left px-4 py-2.5 w-32">Semana</th>
              <th className="text-left px-4 py-2.5">Faixa (mês típico)</th>
              <th className="text-right px-4 py-2.5 w-28">Fechamentos</th>
              <th className="text-right px-4 py-2.5 w-40">Valor total</th>
              <th className="text-right px-4 py-2.5 w-24">% do valor</th>
              <th className="px-4 py-2.5 w-[280px]">Participação</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground text-sm">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2 align-middle" />
                  Carregando do Salesforce…
                </td>
              </tr>
            )}
            {!loading && stats.total === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nenhum fechamento no período.
                </td>
              </tr>
            )}
            {!loading && stats.total > 0 &&
              stats.buckets.map((val, i) => {
                const pct = (val / stats.total) * 100;
                const rel = (val / maxBucket) * 100;
                return (
                  <tr key={i} className="border-b border-border/40 hover:bg-surface-2/50">
                    <td className="px-4 py-3 font-medium">Semana {i + 1}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {weekLabelRange(monthLen, i)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{stats.counts[i]}</td>
                    <td className="px-4 py-3 text-right font-mono">{brl(val)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {pct.toFixed(1).replace(".", ",")}%
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${rel}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
          {!loading && stats.total > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-surface-2/50 text-sm">
                <td colSpan={2} className="px-4 py-2.5 text-right text-muted-foreground uppercase tracking-wider text-[11px]">
                  Total
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold">
                  {stats.counts.reduce((a, b) => a + b, 0)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold">{brl(stats.total)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold">100%</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function FixedRangeWeeksPanel({ start, end }: { start: string; end: string }) {
  const fetchVen = useServerFn(getSalesforceVendas);
  const q = useQuery({
    queryKey: ["sf-vendas", start, end],
    queryFn: () => fetchVen({ data: { start, end } }),
    staleTime: 60_000,
  });
  return (
    <WeeksPanel
      records={q.data?.records ?? []}
      loading={q.isLoading}
      error={q.error}
    />
  );
}

const COMPRAS_REPORT_ID = "00ODn0000081BYoMAM";
const COMPRAS_REPORT_NAME = "Compras Efetuadas [A-WF]";


// Heurísticas de mapeamento de colunas do relatório Salesforce
type ColMap = {
  date?: string;
  account?: string;
  order?: string;
  product?: string;
  owner?: string;
  status?: string;
  qty?: string;
  amount?: string;
};

function pickColumn(
  columns: { apiName: string; label: string }[],
  patterns: RegExp[],
): string | undefined {
  for (const p of patterns) {
    const hit = columns.find(
      (c) => p.test(c.apiName) || p.test(c.label),
    );
    if (hit) return hit.apiName;
  }
  return undefined;
}

function buildColMap(columns: { apiName: string; label: string }[]): ColMap {
  return {
    date: pickColumn(columns, [/close.?date/i, /^data/i, /data.*fech/i]),
    account: pickColumn(columns, [/account/i, /cliente/i, /conta/i]),
    order: pickColumn(columns, [/opportunity\.?name/i, /^name$/i, /pedido/i, /oportunidade/i]),
    product: pickColumn(columns, [/product/i, /produto/i, /item/i]),
    owner: pickColumn(columns, [/owner/i, /vendedor/i, /propriet/i]),
    status: pickColumn(columns, [/stage/i, /status/i, /etapa/i]),
    qty: pickColumn(columns, [/quantity/i, /qtd/i, /quant/i]),
    amount: pickColumn(columns, [/totalprice/i, /amount/i, /total__c/i, /valor.*total/i, /^valor$/i, /total/i]),
  };
}

function ComprasEfetuadasTable({ search }: { search: string }) {
  const fetchReport = useServerFn(getSalesforceReportByName);
  const q = useQuery({
    queryKey: ["sf-report", COMPRAS_REPORT_ID],
    queryFn: () => fetchReport({ data: { reportId: COMPRAS_REPORT_ID, name: COMPRAS_REPORT_NAME } }),

    staleTime: 60_000,
  });

  const columns = q.data?.columns ?? [];
  const rows = q.data?.rows ?? [];
  const map = useMemo(() => buildColMap(columns), [columns]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const bag = [
        map.account && r[map.account],
        map.order && r[map.order],
        map.owner && r[map.owner],
        map.product && r[map.product],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return bag.includes(s);
    });
  }, [rows, search, map]);

  const totalAmount = useMemo(() => {
    if (!map.amount) return 0;
    let sum = 0;
    for (const r of filtered) {
      const v = r[map.amount];
      if (typeof v === "number") sum += v;
    }
    return sum;
  }, [filtered, map.amount]);

  const cell = (r: SalesforceReportRow, key?: string) => {
    if (!key) return "—";
    const v = r[key];
    if (v == null || v === "") return "—";
    return String(v);
  };
  const cellNum = (r: SalesforceReportRow, key?: string) => {
    if (!key) return "—";
    const v = r[key];
    if (typeof v === "number") return brl(v);
    if (v == null || v === "") return "—";
    return String(v);
  };

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {!!q.error && (
        <div className="border-b border-destructive/40 bg-destructive/10 text-destructive text-sm px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <div>{q.error instanceof Error ? q.error.message : "Erro ao carregar relatório"}</div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
              <th className="text-left px-4 py-2.5">Data</th>
              <th className="text-left px-4 py-2.5">Cliente</th>
              <th className="text-left px-4 py-2.5">Pedido</th>
              <th className="text-left px-4 py-2.5">Produto</th>
              <th className="text-left px-4 py-2.5">Vendedor</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-right px-4 py-2.5">Qtd.</th>
              <th className="text-right px-4 py-2.5">Valor Total</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-muted-foreground text-sm">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2 align-middle" />
                  Carregando relatório do Salesforce…
                </td>
              </tr>
            )}
            {!q.isLoading && filtered.map((r, i) => (
              <tr key={i} className="border-b border-border/40 hover:bg-surface-2/50">
                <td className="px-4 py-3 text-muted-foreground">{cell(r, map.date)}</td>
                <td className="px-4 py-3 font-medium">{cell(r, map.account)}</td>
                <td className="px-4 py-3 text-muted-foreground">{cell(r, map.order)}</td>
                <td className="px-4 py-3 text-muted-foreground">{cell(r, map.product)}</td>
                <td className="px-4 py-3 text-muted-foreground">{cell(r, map.owner)}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-muted-foreground">
                    {cell(r, map.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono">{cell(r, map.qty)}</td>
                <td className="px-4 py-3 text-right font-mono">{cellNum(r, map.amount)}</td>
              </tr>
            ))}
            {!q.isLoading && filtered.length === 0 && !q.error && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nenhum registro no relatório.
                </td>
              </tr>
            )}
          </tbody>
          {!q.isLoading && filtered.length > 0 && map.amount && (
            <tfoot>
              <tr className="border-t border-border bg-surface-2/50 text-sm">
                <td colSpan={7} className="px-4 py-2.5 text-right text-muted-foreground uppercase tracking-wider text-[11px]">
                  Total ({filtered.length} {filtered.length === 1 ? "registro" : "registros"})
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold">{brl(totalAmount)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function TabelasPage() {
  const { hasRole } = useAuth();
  const [tab, setTab] = useState<"orcamentos" | "vendas" | "projecoes" | "semanas" | "compras-efetuadas" | "vendido-mes">("orcamentos");

  const [search, setSearch] = useState("");

  const initial = presetRange("month")!;
  const [from, setFrom] = useState<Date>(initial.from);
  const [to, setTo] = useState<Date>(initial.to);
  const [preset, setPreset] = useState<PeriodPreset>("month");

  const range = useMemo(
    () => ({ start: fmtKey(from), end: fmtKey(to) }),
    [from, to],
  );

  const fetchOrc = useServerFn(getSalesforceOrcamentos);
  const fetchVen = useServerFn(getSalesforceVendas);
  const fetchVendidoMes = useServerFn(getSalesforceVendidoMesAtual);

  const qOrc = useQuery({
    queryKey: ["sf-orcamentos", range.start, range.end],
    queryFn: () => fetchOrc({ data: range }),
    staleTime: 60_000,
    enabled: hasRole("admin") && tab === "orcamentos",
  });
  const qVen = useQuery({
    queryKey: ["sf-vendas", range.start, range.end],
    queryFn: () => fetchVen({ data: range }),
    staleTime: 60_000,
    enabled: hasRole("admin") && (tab === "vendas" || tab === "semanas"),
  });
  const qVendidoMes = useQuery({
    queryKey: ["sf-vendido-mes-atual"],
    queryFn: () => fetchVendidoMes({ data: {} }),
    staleTime: 60_000,
    enabled: hasRole("admin") && tab === "vendido-mes",
  });


  if (!hasRole("admin")) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <TableIcon className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <h1 className="font-display font-bold text-xl">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Somente administradores podem visualizar as tabelas.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-[1400px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Administrador</div>
            <h1 className="text-3xl font-bold mt-1">Tabelas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Dados de oportunidades sincronizados diretamente do Salesforce.
            </p>
          </div>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por oportunidade, cliente, vendedor…"
              className="pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-sm w-80 focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "orcamentos" | "vendas" | "projecoes" | "semanas" | "compras-efetuadas")}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <TabsList>
              <TabsTrigger value="orcamentos" className="gap-2">
                <FileText className="h-4 w-4" /> Orçamento
              </TabsTrigger>
              <TabsTrigger value="vendas" className="gap-2">
                <ShoppingCart className="h-4 w-4" /> Vendas
              </TabsTrigger>
              <TabsTrigger value="projecoes" className="gap-2">
                <TrendingUp className="h-4 w-4" /> Projeções
              </TabsTrigger>
              <TabsTrigger value="semanas" className="gap-2">
                <CalendarDays className="h-4 w-4" /> Semanas
              </TabsTrigger>
              <TabsTrigger value="compras-efetuadas" className="gap-2">
                <ShoppingBag className="h-4 w-4" /> Compras Efetuadas [A-WF]
              </TabsTrigger>
            </TabsList>
            {tab !== "projecoes" && tab !== "compras-efetuadas" && (
              <DateRangeFilter
                from={from}
                to={to}
                preset={preset}
                onChange={(v) => {
                  setFrom(v.from);
                  setTo(v.to);
                  setPreset(v.preset);
                }}
              />
            )}
          </div>

          <TabsContent value="orcamentos" className="mt-4">
            <OppTable
              records={qOrc.data?.records ?? []}
              loading={qOrc.isLoading}
              error={qOrc.error}
              search={search}
              dateField="createdDate"
            />
          </TabsContent>
          <TabsContent value="vendas" className="mt-4">
            <OppTable
              records={qVen.data?.records ?? []}
              loading={qVen.isLoading}
              error={qVen.error}
              search={search}
              dateField="closeDate"
            />
          </TabsContent>
          <TabsContent value="projecoes" className="mt-4">
            <ProjectionsPanel search={search} />
          </TabsContent>
          <TabsContent value="semanas" className="mt-4 space-y-6">
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Período selecionado
              </h2>
              <WeeksPanel
                records={qVen.data?.records ?? []}
                loading={qVen.isLoading}
                error={qVen.error}
              />
            </section>
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                2026 — Janeiro a Junho
              </h2>
              <FixedRangeWeeksPanel start="2026-01-01" end="2026-06-30" />
            </section>

          </TabsContent>
          <TabsContent value="compras-efetuadas" className="mt-4">
            <ComprasEfetuadasTable search={search} />
          </TabsContent>
        </Tabs>

      </div>
    </AppLayout>

  );
}
