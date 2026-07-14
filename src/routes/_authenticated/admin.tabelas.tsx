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
  Filter,
  X as XIcon,
  RotateCcw,
  BookmarkCheck,
  Sparkles,
  Repeat,
  ShieldCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getSalesforceOrcamentos,
  getSalesforceVendas,
  getSalesforceVendidoMesAtual,
  getSalesforceClientesNovos,
  getSalesforceRecorrencia,
  getSalesforceRetencao,
  OPP_DATE_LITERALS,
  OPP_DEFAULTS_ORCAMENTOS,
  OPP_DEFAULTS_VENDAS,
  OPP_DEFAULTS_VENDIDO_MES,
  OPP_DEFAULTS_GERADO_MES,
  OPP_DEFAULTS_CLIENTES_NOVOS,
  OPP_DEFAULTS_CARREGADORES_TRI,
  type OppFilters,
  type SalesforceOppRow,
  type RecurrenceAccountRow,
  type RetentionAccountRow,
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
  showFaturamento = false,
  showStatus = false,
}: {
  records: SalesforceOppRow[];
  loading: boolean;
  error: unknown;
  search: string;
  dateField: "createdDate" | "closeDate";
  showFaturamento?: boolean;
  showStatus?: boolean;
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

  const extraCols = (showFaturamento ? 1 : 0) + (showStatus ? 1 : 0);
  const colSpan = 10 + extraCols;
  const totalLabelSpan = 6 + extraCols;

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
              {showStatus && <th className="text-left px-4 py-2.5">Status</th>}
              <th className="text-left px-4 py-2.5">Tipo NF</th>
              <th className="text-left px-4 py-2.5">Data</th>
              {showFaturamento && <th className="text-left px-4 py-2.5">Data Faturamento</th>}
              <th className="text-right px-4 py-2.5">Valor Total</th>
              <th className="text-right px-4 py-2.5">Valor Líquido</th>
              <th className="text-right px-4 py-2.5">Frete</th>
              <th className="text-right px-4 py-2.5">Desconto</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-16 text-center text-muted-foreground text-sm">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2 align-middle" />
                  Carregando do Salesforce…
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.account ?? "—"}
                    {r.classification && (
                      <span
                        className={cn(
                          "ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border",
                          r.classification === "novo" && "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
                          r.classification === "reativacao" && "bg-amber-500/10 text-amber-500 border-amber-500/30",
                          r.classification === "carteira" && "bg-sky-500/10 text-sky-500 border-sky-500/30",
                        )}
                        title={
                          r.classification === "reativacao" && r.lastPurchaseBefore
                            ? `Última compra em ${fmtDate(r.lastPurchaseBefore)}`
                            : undefined
                        }
                      >
                        {r.classification === "novo" ? "Novo" : r.classification === "reativacao" ? "Reativação" : "Carteira"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.owner ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-muted-foreground">
                      {r.stage}
                    </span>
                  </td>
                  {showStatus && (
                    <td className="px-4 py-3">
                      {r.status ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-muted-foreground">
                          {r.status}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-muted-foreground">{r.tipoNf ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(r[dateField])}</td>
                  {showFaturamento && (
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.dataFaturamento)}</td>
                  )}
                  <td className="px-4 py-3 text-right font-mono">{brl(r.total)}</td>
                  <td className="px-4 py-3 text-right font-mono">{brl(r.valorLiq)}</td>
                  <td className="px-4 py-3 text-right font-mono">{brl(r.frete)}</td>
                  <td className="px-4 py-3 text-right font-mono">{brl(r.desconto)}</td>
                </tr>
              ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
          </tbody>
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-surface-2/50 text-sm">
                <td colSpan={totalLabelSpan} className="px-4 py-2.5 text-right text-muted-foreground uppercase tracking-wider text-[11px]">
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
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 ml-auto"
          disabled={qOrc.isFetching || qVen.isFetching}
          onClick={() => { qOrc.refetch(); qVen.refetch(); }}
        >
          {(qOrc.isFetching || qVen.isFetching) ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Atualizar do Salesforce
        </Button>
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

// ============ Projeção - Tri Atual ============
// Copia a Projeções, mas fixa no trimestre atual e usa a taxa de
// conversão real de cada cliente (fechados/gerados no trimestre anterior)
// para calcular a projeção de geração. Adiciona classificação A/B/C/D.

type QuarterProjectionRow = {
  account: string;
  accountOwner: string | null;
  prevSales: number;
  generatedCount: number;
  closedCount: number;
  convRate: number;
  salesMonthly: number;
  salesQuarter: number;
  genMonthly: number;
  genQuarter: number;
  classification: "A" | "B" | "C" | "D";
};

function classifyAccount(prevSales: number): "A" | "B" | "C" | "D" {
  if (prevSales <= 0) return "D";
  if (prevSales < 15000) return "C";
  if (prevSales <= 30000) return "B";
  return "A";
}

function CurrentQuarterProjectionsPanel({ search }: { search: string }) {
  const cur = useMemo(currentQuarter, []);
  const baseRange = useMemo(() => quarterRange(cur.year, cur.q - 1), [cur.year, cur.q]);
  const currentRange = useMemo(() => quarterRange(cur.year, cur.q), [cur.year, cur.q]);
  const targetLabel = currentRange.label;
  const [vendedor, setVendedor] = useState<string>("__all__");

  const fetchOrc = useServerFn(getSalesforceOrcamentos);
  const fetchVen = useServerFn(getSalesforceVendas);

  const qOrc = useQuery({
    queryKey: ["sf-orcamentos", baseRange.start, baseRange.end],
    queryFn: () => fetchOrc({ data: { start: baseRange.start, end: baseRange.end } }),
    staleTime: 60_000,
  });
  const qVen = useQuery({
    queryKey: ["sf-vendas", baseRange.start, baseRange.end],
    queryFn: () => fetchVen({ data: { start: baseRange.start, end: baseRange.end } }),
    staleTime: 60_000,
  });
  // Trimestre atual — usado para atualizar dono do cliente (account owner)
  // e para incluir clientes novos (classificados como D) que não existiam
  // no trimestre-base.
  const qOrcCur = useQuery({
    queryKey: ["sf-orcamentos", currentRange.start, currentRange.end],
    queryFn: () => fetchOrc({ data: { start: currentRange.start, end: currentRange.end } }),
    staleTime: 60_000,
  });
  const qVenCur = useQuery({
    queryKey: ["sf-vendas", currentRange.start, currentRange.end],
    queryFn: () => fetchVen({ data: { start: currentRange.start, end: currentRange.end } }),
    staleTime: 60_000,
  });

  const loading = qOrc.isLoading || qVen.isLoading || qOrcCur.isLoading || qVenCur.isLoading;
  const error = qOrc.error ?? qVen.error ?? qOrcCur.error ?? qVenCur.error;
  const orcRecs = qOrc.data?.records ?? [];
  const venRecs = qVen.data?.records ?? [];
  const orcCurRecs = qOrcCur.data?.records ?? [];
  const venCurRecs = qVenCur.data?.records ?? [];

  const rows: QuarterProjectionRow[] = useMemo(() => {
    // Agregado por Account no trimestre-base
    const generatedByAccount = new Map<string, number>();
    const closedByAccount = new Map<string, number>();
    const salesByAccount = new Map<string, number>();
    const ownerByAccount = new Map<string, string | null>();

    // "Gerados" = orçamentos + vendas (todo pedido nasce como orçamento)
    for (const o of orcRecs) {
      const key = o.account ?? "(sem cliente)";
      generatedByAccount.set(key, (generatedByAccount.get(key) ?? 0) + 1);
      if (!ownerByAccount.has(key)) ownerByAccount.set(key, o.accountOwner ?? null);
    }
    for (const v of venRecs) {
      const key = v.account ?? "(sem cliente)";
      generatedByAccount.set(key, (generatedByAccount.get(key) ?? 0) + 1);
      closedByAccount.set(key, (closedByAccount.get(key) ?? 0) + 1);
      salesByAccount.set(key, (salesByAccount.get(key) ?? 0) + (v.total ?? v.amount ?? 0));
      if (!ownerByAccount.get(key)) ownerByAccount.set(key, v.accountOwner ?? ownerByAccount.get(key) ?? null);
    }

    // Fallback global (para clientes sem orçamentos rastreados)
    const totalGen = orcRecs.length + venRecs.length;
    const totalClosed = venRecs.length;
    const globalConv = totalGen > 0 ? totalClosed / totalGen : 0;

    // Universo de contas = todas com atividade no trimestre anterior
    const accounts = new Set<string>([...generatedByAccount.keys(), ...salesByAccount.keys()]);

    // Atualiza o dono do cliente com o do trimestre atual (Account Owner
    // pode ter mudado) e adiciona clientes novos que só apareceram agora.
    for (const o of orcCurRecs) {
      const key = o.account ?? "(sem cliente)";
      accounts.add(key);
      if (o.accountOwner) ownerByAccount.set(key, o.accountOwner);
    }
    for (const v of venCurRecs) {
      const key = v.account ?? "(sem cliente)";
      accounts.add(key);
      if (v.accountOwner) ownerByAccount.set(key, v.accountOwner);
    }

    const out: QuarterProjectionRow[] = [];
    for (const account of accounts) {
      const prevSales = salesByAccount.get(account) ?? 0;
      const generatedCount = generatedByAccount.get(account) ?? 0;
      const closedCount = closedByAccount.get(account) ?? 0;
      const convRate = generatedCount > 0 ? closedCount / generatedCount : globalConv;
      const salesMonthly = prevSales / 3;
      const salesQuarter = salesMonthly * 3;
      const genMonthly = convRate > 0 ? salesMonthly / convRate : 0;
      const genQuarter = genMonthly * 3;
      out.push({
        account,
        accountOwner: ownerByAccount.get(account) ?? null,
        prevSales,
        generatedCount,
        closedCount,
        convRate,
        salesMonthly,
        salesQuarter,
        genMonthly,
        genQuarter,
        classification: classifyAccount(prevSales),
      });
    }
    return out.sort((a, b) => b.prevSales - a.prevSales);
  }, [orcRecs, venRecs, orcCurRecs, venCurRecs]);

  const vendedores = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.accountOwner) set.add(r.accountOwner);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let base = rows;
    if (vendedor !== "__all__") {
      base = base.filter((r) => (r.accountOwner ?? "") === vendedor);
    }
    if (!s) return base;
    return base.filter(
      (r) =>
        r.account.toLowerCase().includes(s) ||
        (r.accountOwner ?? "").toLowerCase().includes(s),
    );
  }, [rows, search, vendedor]);

  const totals = useMemo(() => {
    const acc = {
      prevSales: 0,
      salesMonthly: 0,
      salesQuarter: 0,
      genMonthly: 0,
      genQuarter: 0,
      A: 0,
      B: 0,
      C: 0,
      D: 0,
    };
    for (const r of filtered) {
      acc.prevSales += r.prevSales;
      acc.salesMonthly += r.salesMonthly;
      acc.salesQuarter += r.salesQuarter;
      acc.genMonthly += r.genMonthly;
      acc.genQuarter += r.genQuarter;
      acc[r.classification] += 1;
    }
    return acc;
  }, [filtered]);

  const classBadge = (c: "A" | "B" | "C" | "D") => {
    const styles: Record<string, string> = {
      A: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
      B: "bg-sky-500/15 text-sky-500 border-sky-500/30",
      C: "bg-amber-500/15 text-amber-500 border-amber-500/30",
      D: "bg-muted text-muted-foreground border-border",
    };
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold border",
          styles[c],
        )}
      >
        {c}
      </span>
    );
  };

  return (
    <div className="space-y-3">
      <div className="glass rounded-2xl p-4 flex flex-wrap items-center gap-4 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Projeção alvo</div>
          <div className="font-medium">{targetLabel} (atual)</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Base (trimestre anterior)</div>
          <div className="font-medium">{baseRange.label}</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div className="flex items-center gap-2">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Vendedor</label>
          <Select value={vendedor} onValueChange={setVendedor}>
            <SelectTrigger className="h-8 w-[220px] text-sm">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {vendedores.map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="h-8 w-px bg-border" />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">{classBadge("A")}<span className="text-xs text-muted-foreground">{totals.A}</span></div>
          <div className="flex items-center gap-1.5">{classBadge("B")}<span className="text-xs text-muted-foreground">{totals.B}</span></div>
          <div className="flex items-center gap-1.5">{classBadge("C")}<span className="text-xs text-muted-foreground">{totals.C}</span></div>
          <div className="flex items-center gap-1.5">{classBadge("D")}<span className="text-xs text-muted-foreground">{totals.D}</span></div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 ml-auto"
          disabled={qOrc.isFetching || qVen.isFetching || qOrcCur.isFetching || qVenCur.isFetching}
          onClick={() => { qOrc.refetch(); qVen.refetch(); qOrcCur.refetch(); qVenCur.refetch(); }}
        >
          {(qOrc.isFetching || qVen.isFetching || qOrcCur.isFetching || qVenCur.isFetching) ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Atualizar do Salesforce
        </Button>
      </div>


      <div className="glass rounded-2xl p-3 text-[11px] text-muted-foreground leading-relaxed">
        Classificação por vendas no trimestre anterior: <b className="text-foreground">A</b> &gt; R$ 30k ·
        {" "}<b className="text-foreground">B</b> R$ 15k–30k ·
        {" "}<b className="text-foreground">C</b> &lt; R$ 15k ·
        {" "}<b className="text-foreground">D</b> sem histórico.
        Geração projetada usa a conversão real de cada cliente (fechados/gerados no trimestre anterior).
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
                <th className="text-left px-4 py-2.5">Vendedor</th>
                <th className="text-center px-2 py-2.5">SEGMENTAÇÃO</th>
                <th className="text-right px-4 py-2.5">Vendas {baseRange.label}</th>
                <th className="text-right px-4 py-2.5">Conversão</th>
                <th className="text-right px-4 py-2.5">Proj. Vendas / mês</th>
                <th className="text-right px-4 py-2.5">Proj. Vendas / trim.</th>
                <th className="text-right px-4 py-2.5">Proj. Geração / mês</th>
                <th className="text-right px-4 py-2.5">Proj. Geração / trim.</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-muted-foreground text-sm">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2 align-middle" />
                    Calculando projeções…
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((r) => (
                  <tr key={r.account} className="border-b border-border/40 hover:bg-surface-2/50">
                    <td className="px-4 py-3 font-medium">{r.account}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.accountOwner ?? "—"}</td>
                    <td className="px-2 py-3 text-center">{classBadge(r.classification)}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">{brl(r.prevSales)}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {(r.convRate * 100).toFixed(1).replace(".", ",")}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{brl(r.salesMonthly)}</td>
                    <td className="px-4 py-3 text-right font-mono">{brl(r.salesQuarter)}</td>
                    <td className="px-4 py-3 text-right font-mono">{brl(r.genMonthly)}</td>
                    <td className="px-4 py-3 text-right font-mono">{brl(r.genQuarter)}</td>
                  </tr>
                ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhum cliente com atividade no trimestre anterior.
                  </td>
                </tr>
              )}
            </tbody>
            {!loading && filtered.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-surface-2/50 text-sm">
                  <td className="px-4 py-2.5 text-right text-muted-foreground uppercase tracking-wider text-[11px]" colSpan={3}>
                    Total ({filtered.length})
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-muted-foreground">{brl(totals.prevSales)}</td>
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


function TagListEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (values.includes(v)) { setDraft(""); return; }
    onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-surface-2 border border-border">
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="hover:text-destructive"
              aria-label={`Remover ${v}`}
            >
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        {values.length === 0 && (
          <span className="text-xs text-muted-foreground italic">nenhum</span>
        )}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
          }}
          placeholder={placeholder ?? "Adicionar valor…"}
          className="h-8 text-sm"
        />
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={add}>Adicionar</Button>
      </div>
    </div>
  );
}

function OppFiltersPanel({
  value,
  defaults,
  onApply,
  onSaveAsDefault,
}: {
  value: OppFilters;
  defaults: OppFilters;
  onApply: (next: OppFilters) => void;
  onSaveAsDefault?: (next: OppFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<OppFilters>(value);

  // Sync draft when applied value changes externally (e.g. reset).
  useMemo(() => setDraft(value), [value]);

  const set = <K extends keyof OppFilters>(k: K, v: OppFilters[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const literal = draft.dateLiteral ?? defaults.dateLiteral ?? "";
  const df = draft.dateField ?? defaults.dateField ?? "CloseDate";

  return (
    <div className="glass rounded-2xl border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2/50 transition"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Filter className="h-4 w-4" />
          Filtros do Salesforce
        </span>
        <span className="text-xs text-muted-foreground">
          {open ? "Recolher" : "Expandir para editar"}
        </span>
      </button>
      {open && (
        <div className="border-t border-border p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              StageName (igual a)
            </div>
            <Input
              className="h-8 text-sm"
              value={draft.stageEquals ?? ""}
              onChange={(e) => set("stageEquals", e.target.value)}
              placeholder="Pedido Concluído"
            />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              StageName (diferente de)
            </div>
            <Input
              className="h-8 text-sm"
              value={draft.stageNotEquals ?? ""}
              onChange={(e) => set("stageNotEquals", e.target.value)}
              placeholder="Ex.: Pedido Concluído"
            />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Campo de data
            </div>
            <Select
              value={df}
              onValueChange={(v) => set("dateField", v as "CloseDate" | "CreatedDate" | "Data_de_Faturamento__c")}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CloseDate">CloseDate</SelectItem>
                <SelectItem value="CreatedDate">CreatedDate</SelectItem>
                <SelectItem value="Data_de_Faturamento__c">Data de Faturamento</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Período ({df})
            </div>
            <Select
              value={literal || "THIS_MONTH"}
              onValueChange={(v) => set("dateLiteral", v)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPP_DATE_LITERALS.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
                <SelectItem value="CUSTOM">Personalizado…</SelectItem>
              </SelectContent>
            </Select>
            {literal === "CUSTOM" && (
              <div className="flex gap-2 pt-1">
                <Input
                  type="date"
                  className="h-8 text-sm"
                  value={draft.dateFrom ?? ""}
                  onChange={(e) => set("dateFrom", e.target.value)}
                />
                <Input
                  type="date"
                  className="h-8 text-sm"
                  value={draft.dateTo ?? ""}
                  onChange={(e) => set("dateTo", e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Campo de data (secundário)
            </div>
            <Select
              value={draft.dateField2 ?? "__none__"}
              onValueChange={(v) =>
                set("dateField2", v === "__none__" ? undefined : (v as "CloseDate" | "CreatedDate" | "Data_de_Faturamento__c"))
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">(nenhum)</SelectItem>
                <SelectItem value="CloseDate">CloseDate</SelectItem>
                <SelectItem value="CreatedDate">CreatedDate</SelectItem>
                <SelectItem value="Data_de_Faturamento__c">Data de Faturamento</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {draft.dateField2 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">
                Período ({draft.dateField2})
              </div>
              <Select
                value={(draft.dateLiteral2 ?? "THIS_MONTH") || "THIS_MONTH"}
                onValueChange={(v) => set("dateLiteral2", v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPP_DATE_LITERALS.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                  <SelectItem value="CUSTOM">Personalizado…</SelectItem>
                </SelectContent>
              </Select>
              {draft.dateLiteral2 === "CUSTOM" && (
                <div className="flex gap-2 pt-1">
                  <Input
                    type="date"
                    className="h-8 text-sm"
                    value={draft.dateFrom2 ?? ""}
                    onChange={(e) => set("dateFrom2", e.target.value)}
                  />
                  <Input
                    type="date"
                    className="h-8 text-sm"
                    value={draft.dateTo2 ?? ""}
                    onChange={(e) => set("dateTo2", e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <TagListEditor
            label="Status_do_Pedido__c (IN)"
            values={draft.statusIn ?? []}
            onChange={(v) => set("statusIn", v)}
            placeholder="Ex.: Faturado"
          />

          <TagListEditor
            label="Org_Oportunidade__c (IN)"
            values={draft.orgIn ?? []}
            onChange={(v) => set("orgIn", v)}
            placeholder="Ex.: Acessórios 2P"
          />

          <TagListEditor
            label="Tipo_de_NF__c (diferente de)"
            values={draft.tipoNfNotIn ?? []}
            onChange={(v) => set("tipoNfNotIn", v)}
            placeholder="Ex.: Bonificação"
          />

          <TagListEditor
            label="Account.Name (diferente de)"
            values={draft.accountNameNotIn ?? []}
            onChange={(v) => set("accountNameNotIn", v)}
            placeholder="Ex.: 2P ACESSORIOS LTDA"
          />

          <TagListEditor
            label="Owner.Name (diferente de)"
            values={draft.ownerNameNotIn ?? []}
            onChange={(v) => set("ownerNameNotIn", v)}
            placeholder="Ex.: Caroline Gimenez"
          />

          <TagListEditor
            label="Motivo de Perda (igual a)"
            values={draft.lossReasonIn ?? []}
            onChange={(v) => set("lossReasonIn", v)}
            placeholder="Ex.: Preço"
          />

          <TagListEditor
            label="Motivo de Perda (diferente de)"
            values={draft.lossReasonNotIn ?? []}
            onChange={(v) => set("lossReasonNotIn", v)}
            placeholder="Ex.: Sem interesse"
          />

          <div className="md:col-span-2 flex items-center justify-end gap-2 pt-1 flex-wrap">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => {
                setDraft({ ...defaults });
                onApply({ ...defaults });
              }}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Restaurar padrões
            </Button>
            {onSaveAsDefault && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => {
                  onSaveAsDefault(draft);
                  onApply(draft);
                }}
                title="Salva os filtros atuais como padrão para esta tabela neste navegador"
              >
                <BookmarkCheck className="h-3.5 w-3.5 mr-1.5" /> Definir como padrão
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className="h-8"
              onClick={() => onApply(draft)}
            >
              Aplicar filtros
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Reusable panel wrapping OppTable with filters + vendedor dropdown. */
function OppTabPanel({
  filters,
  defaults,
  onFiltersChange,
  onSaveAsDefault,
  vendedor,
  onVendedorChange,
  records,
  loading,
  error,
  search,
  dateField,
  showFaturamento = false,
  showStatus = false,
}: {
  filters: OppFilters;
  defaults: OppFilters;
  onFiltersChange: (next: OppFilters) => void;
  onSaveAsDefault?: (next: OppFilters) => void;
  vendedor: string;
  onVendedorChange: (next: string) => void;
  records: SalesforceOppRow[];
  loading: boolean;
  error: unknown;
  search: string;
  dateField: "createdDate" | "closeDate";
  showFaturamento?: boolean;
  showStatus?: boolean;
}) {
  const vendedores = useMemo(
    () => Array.from(new Set(records.map((r) => r.owner).filter((v): v is string => !!v)))
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [records],
  );
  const filteredByVendedor =
    vendedor === "__all__" ? records : records.filter((r) => (r.owner ?? "") === vendedor);

  return (
    <div className="space-y-3">
      <OppFiltersPanel value={filters} defaults={defaults} onApply={onFiltersChange} onSaveAsDefault={onSaveAsDefault} />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Vendedor</span>
        <Select value={vendedor} onValueChange={onVendedorChange}>
          <SelectTrigger className="w-[260px] h-9">
            <SelectValue placeholder="Todos os vendedores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os vendedores</SelectItem>
            {vendedores.map((v) => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {vendedor !== "__all__" && (
          <button
            type="button"
            onClick={() => onVendedorChange("__all__")}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            limpar
          </button>
        )}
      </div>
      <OppTable
        records={filteredByVendedor}
        loading={loading}
        error={error}
        search={search}
        dateField={dateField}
        showFaturamento={showFaturamento}
        showStatus={showStatus}
      />
    </div>
  );
}


function QuarterPicker({
  year, quarter, onChange,
}: { year: number; quarter: number; onChange: (v: { year: number; quarter: number }) => void }) {
  const cur = useMemo(currentQuarter, []);
  const years = Array.from(new Set([cur.year - 1, cur.year, cur.year + 1, year])).sort((a, b) => a - b);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">Trimestre</span>
      <Select value={String(year)} onValueChange={(v) => onChange({ year: parseInt(v, 10), quarter })}>
        <SelectTrigger className="w-[100px] h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-xs">
        {[1, 2, 3, 4].map((q) => {
          const active = q === quarter;
          const isCurrent = year === cur.year && q === cur.q;
          return (
            <button
              key={q}
              onClick={() => onChange({ year, quarter: q })}
              className={cn(
                "px-3 py-1 rounded-md transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >Q{q}{isCurrent ? " • atual" : ""}</button>
          );
        })}
      </div>
    </div>
  );
}

function RecorrenciaPanel({ search }: { search: string }) {
  const cur = useMemo(currentQuarter, []);
  const [{ year, quarter }, setYQ] = useState({ year: cur.year, quarter: cur.q });
  const [vendedor, setVendedor] = useState<string>("__all__");
  const fetchFn = useServerFn(getSalesforceRecorrencia);
  const q = useQuery({
    queryKey: ["sf-recorrencia", year, quarter],
    queryFn: () => fetchFn({ data: { year, quarter } }),
    staleTime: 60_000,
  });
  const records: RecurrenceAccountRow[] = q.data?.records ?? [];
  const vendedores = useMemo(
    () => Array.from(new Set(records.map((r) => r.owner).filter((v): v is string => !!v)))
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [records],
  );
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let out = vendedor === "__all__" ? records : records.filter((r) => (r.owner ?? "") === vendedor);
    if (s) out = out.filter((r) => (r.accountName ?? "").toLowerCase().includes(s) || (r.owner ?? "").toLowerCase().includes(s));
    return out;
  }, [records, vendedor, search]);
  const totalSum = filtered.reduce((a, b) => a + b.total, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <QuarterPicker year={year} quarter={quarter} onChange={setYQ} />
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Vendedor</span>
          <Select value={vendedor} onValueChange={setVendedor}>
            <SelectTrigger className="w-[240px] h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os vendedores</SelectItem>
              {vendedores.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="glass rounded-2xl p-3 text-[11px] text-muted-foreground leading-relaxed">
        Contas com faturamento acima de <b className="text-foreground">{brl(q.data?.threshold ?? 15000)}</b> no
        trimestre selecionado (Pedido Concluído, excluindo Bonificação).
      </div>
      <AccountTotalsTable
        records={filtered}
        totalSum={totalSum}
        loading={q.isLoading}
        error={q.error}
      />
    </div>
  );
}

function RetencaoPanel({ search }: { search: string }) {
  const cur = useMemo(currentQuarter, []);
  const [{ year, quarter }, setYQ] = useState({ year: cur.year, quarter: cur.q });
  const [vendedor, setVendedor] = useState<string>("__all__");
  const fetchFn = useServerFn(getSalesforceRetencao);
  const q = useQuery({
    queryKey: ["sf-retencao", year, quarter],
    queryFn: () => fetchFn({ data: { year, quarter } }),
    staleTime: 60_000,
  });
  const records: RetentionAccountRow[] = q.data?.records ?? [];
  const vendedores = useMemo(
    () => Array.from(new Set(records.map((r) => r.owner).filter((v): v is string => !!v)))
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [records],
  );
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let out = vendedor === "__all__" ? records : records.filter((r) => (r.owner ?? "") === vendedor);
    if (s) out = out.filter((r) => (r.accountName ?? "").toLowerCase().includes(s) || (r.owner ?? "").toLowerCase().includes(s));
    return out;
  }, [records, vendedor, search]);
  const totalSum = filtered.reduce((a, b) => a + b.total, 0);
  const rate = q.data?.retentionRate ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <QuarterPicker year={year} quarter={quarter} onChange={setYQ} />
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Vendedor</span>
          <Select value={vendedor} onValueChange={setVendedor}>
            <SelectTrigger className="w-[240px] h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os vendedores</SelectItem>
              {vendedores.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="glass rounded-2xl p-4 flex flex-wrap items-center gap-6 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Qualificados no trimestre anterior</div>
          <div className="font-medium">{q.data?.previousQualifiedCount ?? 0}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Retidos neste trimestre</div>
          <div className="font-medium">{records.length}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Taxa de retenção</div>
          <div className="font-medium">{(rate * 100).toFixed(1).replace(".", ",")}%</div>
        </div>
      </div>
      <div className="glass rounded-2xl p-3 text-[11px] text-muted-foreground leading-relaxed">
        Contas que faturaram acima de <b className="text-foreground">{brl(q.data?.threshold ?? 15000)}</b> no
        trimestre anterior <b>e também</b> no trimestre atual selecionado.
      </div>
      <AccountTotalsTable
        records={filtered}
        totalSum={totalSum}
        loading={q.isLoading}
        error={q.error}
        showPrevious
      />
    </div>
  );
}

function AccountTotalsTable({
  records, totalSum, loading, error, showPrevious = false,
}: {
  records: (RecurrenceAccountRow & { previousTotal?: number })[];
  totalSum: number;
  loading: boolean;
  error: unknown;
  showPrevious?: boolean;
}) {
  const colSpan = showPrevious ? 5 : 4;
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
              <th className="text-left px-4 py-2.5">Cliente</th>
              <th className="text-left px-4 py-2.5">Vendedor</th>
              <th className="text-right px-4 py-2.5">Pedidos</th>
              {showPrevious && <th className="text-right px-4 py-2.5">Total (tri. anterior)</th>}
              <th className="text-right px-4 py-2.5">Total (tri. atual)</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={colSpan} className="px-4 py-16 text-center text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 animate-spin inline mr-2 align-middle" />Carregando do Salesforce…
              </td></tr>
            )}
            {!loading && records.map((r) => (
              <tr key={r.accountId} className="border-b border-border/40 hover:bg-surface-2/50">
                <td className="px-4 py-3 font-medium">{r.accountName ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.owner ?? "—"}</td>
                <td className="px-4 py-3 text-right font-mono">{r.orders}</td>
                {showPrevious && <td className="px-4 py-3 text-right font-mono text-muted-foreground">{brl(r.previousTotal ?? 0)}</td>}
                <td className="px-4 py-3 text-right font-mono">{brl(r.total)}</td>
              </tr>
            ))}
            {!loading && records.length === 0 && (
              <tr><td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhum registro encontrado.
              </td></tr>
            )}
          </tbody>
          {!loading && records.length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-surface-2/50 text-sm">
                <td colSpan={colSpan - 1} className="px-4 py-2.5 text-right text-muted-foreground uppercase tracking-wider text-[11px]">
                  Total ({records.length} {records.length === 1 ? "conta" : "contas"})
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold">{brl(totalSum)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}


const FILTER_STORAGE_PREFIX = "tabelas:opp-filters:";
function loadStoredFilters(key: string, fallback: OppFilters): OppFilters {
  if (typeof window === "undefined") return { ...fallback };
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_PREFIX + key);
    if (!raw) return { ...fallback };
    const parsed = JSON.parse(raw) as OppFilters;
    return { ...fallback, ...parsed };
  } catch {
    return { ...fallback };
  }
}
function saveStoredFilters(key: string, filters: OppFilters) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FILTER_STORAGE_PREFIX + key, JSON.stringify(filters));
  } catch {
    // ignore quota / privacy errors
  }
}

function TabelasPage() {
  const { hasRole } = useAuth();
  type TabId = "orcamentos" | "vendas" | "projecoes" | "projecao-tri" | "semanas" | "vendido-mes" | "gerado-mes" | "carregadores" | "clientes-novos" | "recorrencia" | "retencao";
  const [tab, setTab] = useState<TabId>("orcamentos");

  const [orcDefaults, setOrcDefaults] = useState<OppFilters>(() => loadStoredFilters("orcamentos", OPP_DEFAULTS_ORCAMENTOS));
  const [venDefaults, setVenDefaults] = useState<OppFilters>(() => loadStoredFilters("vendas", OPP_DEFAULTS_VENDAS));
  const [vendidoDefaults, setVendidoDefaults] = useState<OppFilters>(() => loadStoredFilters("vendido-mes", OPP_DEFAULTS_VENDIDO_MES));
  const [geradoDefaults, setGeradoDefaults] = useState<OppFilters>(() => loadStoredFilters("gerado-mes", OPP_DEFAULTS_GERADO_MES));
  const [novosDefaults, setNovosDefaults] = useState<OppFilters>(() => loadStoredFilters("clientes-novos", OPP_DEFAULTS_CLIENTES_NOVOS));
  const [carregDefaults, setCarregDefaults] = useState<OppFilters>(() => loadStoredFilters("carregadores-tri", OPP_DEFAULTS_CARREGADORES_TRI));

  const [orcFilters, setOrcFilters] = useState<OppFilters>(() => ({ ...orcDefaults }));
  const [venFilters, setVenFilters] = useState<OppFilters>(() => ({ ...venDefaults }));
  const [vendidoFilters, setVendidoFilters] = useState<OppFilters>(() => ({ ...vendidoDefaults }));
  const [geradoFilters, setGeradoFilters] = useState<OppFilters>(() => ({ ...geradoDefaults }));
  const [novosFilters, setNovosFilters] = useState<OppFilters>(() => ({ ...novosDefaults }));
  const [carregFilters, setCarregFilters] = useState<OppFilters>(() => ({ ...carregDefaults }));

  const saveOrcAsDefault = (f: OppFilters) => { saveStoredFilters("orcamentos", f); setOrcDefaults(f); };
  const saveVenAsDefault = (f: OppFilters) => { saveStoredFilters("vendas", f); setVenDefaults(f); };
  const saveVendidoAsDefault = (f: OppFilters) => { saveStoredFilters("vendido-mes", f); setVendidoDefaults(f); };
  const saveGeradoAsDefault = (f: OppFilters) => { saveStoredFilters("gerado-mes", f); setGeradoDefaults(f); };
  const saveNovosAsDefault = (f: OppFilters) => { saveStoredFilters("clientes-novos", f); setNovosDefaults(f); };
  const saveCarregAsDefault = (f: OppFilters) => { saveStoredFilters("carregadores-tri", f); setCarregDefaults(f); };


  const [vendedorOrc, setVendedorOrc] = useState<string>("__all__");
  const [vendedorVen, setVendedorVen] = useState<string>("__all__");
  const [vendedorMes, setVendedorMes] = useState<string>("__all__");
  const [vendedorGer, setVendedorGer] = useState<string>("__all__");
  const [vendedorNov, setVendedorNov] = useState<string>("__all__");
  const [vendedorCarreg, setVendedorCarreg] = useState<string>("__all__");
  const [classifNov, setClassifNov] = useState<"all" | "novo" | "reativacao" | "carteira">("all");

  const [search, setSearch] = useState("");

  const fetchOrc = useServerFn(getSalesforceOrcamentos);
  const fetchVen = useServerFn(getSalesforceVendas);
  const fetchVendidoMes = useServerFn(getSalesforceVendidoMesAtual);
  const fetchClientesNovos = useServerFn(getSalesforceClientesNovos);

  const qOrc = useQuery({
    queryKey: ["sf-orcamentos-flt", orcFilters],
    queryFn: () => fetchVendidoMes({ data: orcFilters }),
    staleTime: 60_000,
    enabled: hasRole("admin") && tab === "orcamentos",
  });
  const qVen = useQuery({
    queryKey: ["sf-vendas-flt", venFilters],
    queryFn: () => fetchVendidoMes({ data: venFilters }),
    staleTime: 60_000,
    enabled: hasRole("admin") && (tab === "vendas" || tab === "semanas"),
  });
  const qVendidoMes = useQuery({
    queryKey: ["sf-vendido-mes-atual", vendidoFilters],
    queryFn: () => fetchVendidoMes({ data: vendidoFilters }),
    staleTime: 60_000,
    enabled: hasRole("admin") && tab === "vendido-mes",
  });
  const qGeradoMes = useQuery({
    queryKey: ["sf-gerado-mes-atual", geradoFilters],
    queryFn: () => fetchVendidoMes({ data: geradoFilters }),
    staleTime: 60_000,
    enabled: hasRole("admin") && tab === "gerado-mes",
  });
  const qClientesNovos = useQuery({
    queryKey: ["sf-clientes-novos", novosFilters],
    queryFn: () => fetchClientesNovos({ data: novosFilters }),
    staleTime: 60_000,
    enabled: hasRole("admin") && tab === "clientes-novos",
  });
  const qCarreg = useQuery({
    queryKey: ["sf-carregadores-tri", carregFilters],
    queryFn: () => fetchVendidoMes({ data: carregFilters }),
    staleTime: 60_000,
    enabled: hasRole("admin") && tab === "carregadores",
  });

  // Silence unused-imports guard; kept for potential future direct calls.
  void fetchOrc; void fetchVen;


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

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
          <TabsList>
            <TabsTrigger value="orcamentos" className="gap-2">
              <FileText className="h-4 w-4" /> Orçamento
            </TabsTrigger>
            <TabsTrigger value="vendas" className="gap-2">
              <ShoppingCart className="h-4 w-4" /> Faturamento - Mês Atual
            </TabsTrigger>
            <TabsTrigger value="vendido-mes" className="gap-2">
              <ShoppingCart className="h-4 w-4" /> Vendido - Mês Atual
            </TabsTrigger>
            <TabsTrigger value="gerado-mes" className="gap-2">
              <ShoppingCart className="h-4 w-4" /> Gerado - Mês Atual
            </TabsTrigger>
            <TabsTrigger value="carregadores" className="gap-2">
              <ShoppingCart className="h-4 w-4" /> Vendido - Mês [Carregadores]
            </TabsTrigger>
            <TabsTrigger value="projecoes" className="gap-2">
              <TrendingUp className="h-4 w-4" /> Projeções
            </TabsTrigger>
            <TabsTrigger value="projecao-tri" className="gap-2">
              <TrendingUp className="h-4 w-4" /> Projeção - Tri Atual
            </TabsTrigger>
            <TabsTrigger value="semanas" className="gap-2">
              <CalendarDays className="h-4 w-4" /> Semanas
            </TabsTrigger>
            <TabsTrigger value="clientes-novos" className="gap-2">
              <Sparkles className="h-4 w-4" /> Clientes Novos
            </TabsTrigger>
            <TabsTrigger value="recorrencia" className="gap-2">
              <Repeat className="h-4 w-4" /> Recorrência
            </TabsTrigger>
            <TabsTrigger value="retencao" className="gap-2">
              <ShieldCheck className="h-4 w-4" /> Retenção
            </TabsTrigger>
          </TabsList>


          <TabsContent value="orcamentos" className="mt-4">
            <OppTabPanel
              filters={orcFilters}
              defaults={orcDefaults}
              onFiltersChange={setOrcFilters}
              onSaveAsDefault={saveOrcAsDefault}
              vendedor={vendedorOrc}
              onVendedorChange={setVendedorOrc}
              records={qOrc.data?.records ?? []}
              loading={qOrc.isLoading}
              error={qOrc.error}
              search={search}
              dateField={orcFilters.dateField === "CreatedDate" ? "createdDate" : "closeDate"}
            />
          </TabsContent>
          <TabsContent value="vendas" className="mt-4">
            <OppTabPanel
              filters={venFilters}
              defaults={venDefaults}
              onFiltersChange={setVenFilters}
              onSaveAsDefault={saveVenAsDefault}
              vendedor={vendedorVen}
              onVendedorChange={setVendedorVen}
              records={qVen.data?.records ?? []}
              loading={qVen.isLoading}
              error={qVen.error}
              search={search}
              dateField={venFilters.dateField === "CreatedDate" ? "createdDate" : "closeDate"}
              showFaturamento
              showStatus
            />
          </TabsContent>
          <TabsContent value="vendido-mes" className="mt-4">
            <OppTabPanel
              filters={vendidoFilters}
              defaults={vendidoDefaults}
              onFiltersChange={setVendidoFilters}
              onSaveAsDefault={saveVendidoAsDefault}
              vendedor={vendedorMes}
              onVendedorChange={setVendedorMes}
              records={qVendidoMes.data?.records ?? []}
              loading={qVendidoMes.isLoading}
              error={qVendidoMes.error}
              search={search}
              dateField={vendidoFilters.dateField === "CreatedDate" ? "createdDate" : "closeDate"}
            />
          </TabsContent>
          <TabsContent value="gerado-mes" className="mt-4">
            <OppTabPanel
              filters={geradoFilters}
              defaults={geradoDefaults}
              onFiltersChange={setGeradoFilters}
              onSaveAsDefault={saveGeradoAsDefault}
              vendedor={vendedorGer}
              onVendedorChange={setVendedorGer}
              records={qGeradoMes.data?.records ?? []}
              loading={qGeradoMes.isLoading}
              error={qGeradoMes.error}
              search={search}
              dateField={geradoFilters.dateField === "CreatedDate" ? "createdDate" : "closeDate"}
            />
          </TabsContent>
          <TabsContent value="carregadores" className="mt-4">
            <OppTabPanel
              filters={carregFilters}
              defaults={carregDefaults}
              onFiltersChange={setCarregFilters}
              onSaveAsDefault={saveCarregAsDefault}
              vendedor={vendedorCarreg}
              onVendedorChange={setVendedorCarreg}
              records={qCarreg.data?.records ?? []}
              loading={qCarreg.isLoading}
              error={qCarreg.error}
              search={search}
              dateField={carregFilters.dateField === "CreatedDate" ? "createdDate" : "closeDate"}
            />
          </TabsContent>
          <TabsContent value="projecoes" className="mt-4">
            <ProjectionsPanel search={search} />
          </TabsContent>
          <TabsContent value="projecao-tri" className="mt-4">
            <CurrentQuarterProjectionsPanel search={search} />
          </TabsContent>
          <TabsContent value="semanas" className="mt-4 space-y-6">
            <section className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Período selecionado (usa filtros de Vendas)
                </h2>
              </div>
              <WeeksPanel
                records={
                  vendedorVen === "__all__"
                    ? (qVen.data?.records ?? [])
                    : (qVen.data?.records ?? []).filter((r) => (r.owner ?? "") === vendedorVen)
                }
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
          <TabsContent value="clientes-novos" className="mt-4 space-y-3">
            <div className="glass rounded-2xl p-3 text-[11px] text-muted-foreground leading-relaxed">
              Classifica cada conta que teve venda concluída no período:
              {" "}<span className="text-emerald-500 font-semibold">Novo</span> (nunca comprou antes),
              {" "}<span className="text-amber-500 font-semibold">Reativação</span> (última compra há mais de 3 meses do início do período)
              {" "}e <span className="text-sky-500 font-semibold">Carteira</span> (comprou nos últimos 3 meses).
              {qClientesNovos.data && (
                <span className="ml-1">
                  {" "}<b className="text-foreground">{qClientesNovos.data.newAccountsCount ?? 0}</b> novo(s),
                  {" "}<b className="text-foreground">{qClientesNovos.data.reactivationCount ?? 0}</b> reativação(ões),
                  {" "}<b className="text-foreground">{qClientesNovos.data.carteiraCount ?? 0}</b> carteira.
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Classificação</span>
              <Select value={classifNov} onValueChange={(v) => setClassifNov(v as typeof classifNov)}>
                <SelectTrigger className="h-8 w-[200px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="novo">Novos</SelectItem>
                  <SelectItem value="reativacao">Reativações</SelectItem>
                  <SelectItem value="carteira">Recorrente (Carteira)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <OppTabPanel
              filters={novosFilters}
              defaults={novosDefaults}
              onFiltersChange={setNovosFilters}
              onSaveAsDefault={saveNovosAsDefault}
              vendedor={vendedorNov}
              onVendedorChange={setVendedorNov}
              records={
                classifNov === "all"
                  ? (qClientesNovos.data?.records ?? [])
                  : (qClientesNovos.data?.records ?? []).filter((r) => r.classification === classifNov)
              }
              loading={qClientesNovos.isLoading}
              error={qClientesNovos.error}
              search={search}
              dateField="closeDate"
              showStatus
            />
          </TabsContent>
          <TabsContent value="recorrencia" className="mt-4">
            <RecorrenciaPanel search={search} />
          </TabsContent>
          <TabsContent value="retencao" className="mt-4">
            <RetencaoPanel search={search} />
          </TabsContent>
        </Tabs>

      </div>
    </AppLayout>
  );
}

