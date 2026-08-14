import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Megaphone, Users, Target, TrendingUp, Loader2, Clock, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMarketingSalesforceData, MARKETING_OWNER_NAMES } from "@/lib/salesforce.functions";
import { cn } from "@/lib/utils";
import { AtlasSoonCard } from "@/components/marketing/atlas-soon-card";
import { DateRangePicker, defaultRange, ymd, type DateRangeValue } from "@/components/date-range-picker";


export const Route = createFileRoute("/_authenticated/marketing/")({
  head: () => ({ meta: [{ title: "Marketing — Portal 2P" }] }),
  component: MarketingHome,
});

const fmt = (n: number) => n.toLocaleString("pt-BR");
const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function pad(n: number) { return String(n).padStart(2, "0"); }

function previousRange(range: { start: string; end: string }): { start: string; end: string } {
  const s = new Date(range.start + "T00:00:00");
  const e = new Date(range.end + "T00:00:00");
  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
  const prevEnd = new Date(s); prevEnd.setDate(s.getDate() - 1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate() - (days - 1));
  return { start: ymd(prevStart), end: ymd(prevEnd) };
}

function MarketingHome() {
  const [range, setRange] = useState<DateRangeValue>(() => defaultRange());
  const prev = useMemo(() => previousRange(range), [range.start, range.end]);

  const fetchData = useServerFn(getMarketingSalesforceData);
  const q = useQuery({
    queryKey: ["marketing-sf", range.start, range.end],
    queryFn: () => fetchData({ data: { start: range.start, end: range.end } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const qPrev = useQuery({
    queryKey: ["marketing-sf", prev.start, prev.end],
    queryFn: () => fetchData({ data: prev }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });



  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Marketing</div>
            <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-primary" /> Home
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Leads, conversões, origens e novos clientes — dados do Salesforce da equipe de marketing.
            </p>
          </div>
          <DateRangePicker value={range} onChange={setRange} />

        </div>

        <OwnersBadge />

        {q.isLoading ? (
          <div className="glass rounded-2xl p-10 flex items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando dados do Salesforce…
          </div>
        ) : q.isError ? (
          <div className="glass rounded-2xl p-6 text-sm text-destructive">
            Erro ao carregar Salesforce: {q.error instanceof Error ? q.error.message : "desconhecido"}
          </div>
        ) : q.data ? (
          <>
            <PeriodCompareStrip current={q.data} previous={qPrev.data ?? null} prevRange={prev} loading={qPrev.isLoading} />
            <MarketingDashboard data={q.data} />
          </>
        ) : null}

        <AtlasSoonCard />
      </div>
    </AppLayout>
  );
}

function OwnersBadge() {
  const names = Object.values(MARKETING_OWNER_NAMES);
  return (
    <div className="glass rounded-xl px-4 py-2.5 flex items-center gap-2 flex-wrap text-xs">
      <Users className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground uppercase tracking-wider">Owners:</span>
      {names.map((n) => (
        <span key={n} className="px-2 py-0.5 rounded-md bg-surface-2 border border-border">
          {n}
        </span>
      ))}
    </div>
  );
}


type MktData = Awaited<ReturnType<typeof getMarketingSalesforceData>>;

function PeriodCompareStrip({
  current, previous, prevRange, loading,
}: { current: MktData; previous: MktData | null; prevRange: { start: string; end: string }; loading: boolean }) {
  const metrics: { key: keyof MktData["totals"]; label: string; money?: boolean }[] = [
    { key: "leads", label: "Leads" },
    { key: "convertidos", label: "Convertidos" },
    { key: "amadurecimento", label: "Amadurecimento" },
    { key: "novasContas", label: "Novas contas" },
    { key: "faturado", label: "Faturado", money: true },
  ];
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Comparativo com período anterior
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          anterior: {prevRange.start} → {prevRange.end}
          {loading ? <span className="ml-2 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> carregando…</span> : null}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {metrics.map((m) => {
          const cur = current.totals[m.key] as number;
          const prv = previous ? (previous.totals[m.key] as number) : 0;
          const delta = cur - prv;
          const pct = prv > 0 ? (delta / prv) * 100 : cur > 0 ? 100 : 0;
          const up = delta > 0;
          const flat = delta === 0;
          const good = up; // more is better for all these metrics
          const color = flat ? "text-muted-foreground" : good ? "text-[oklch(0.7_0.16_145)]" : "text-destructive";
          const Icon = flat ? TrendingUp : up ? ArrowUpRight : ArrowDownRight;
          return (
            <div key={m.key} className="bg-surface-2/50 border border-border rounded-xl p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</div>
              <div className="font-display font-bold text-xl tabular-nums mt-0.5">
                {m.money ? fmtBRL(cur) : fmt(cur)}
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  ant.: {m.money ? fmtBRL(prv) : fmt(prv)}
                </div>
                <div className={cn("text-[11px] font-semibold flex items-center gap-0.5 tabular-nums", color)}>
                  <Icon className="h-3 w-3" />
                  {flat ? "0%" : `${up ? "+" : ""}${pct.toFixed(1)}%`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MarketingDashboard({ data }: { data: Awaited<ReturnType<typeof getMarketingSalesforceData>> }) {
  const t = data.totals;
  const convRate = t.leads > 0 ? (t.convertidos / t.leads) * 100 : 0;

  const dailyMax = useMemo(
    () => data.serieDiaria.reduce((m, d) => Math.max(m, d.leads), 0),
    [data.serieDiaria],
  );

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI label="Leads" value={fmt(t.leads)} icon={Users} />
        <KPI label="Convertidos" value={fmt(t.convertidos)} icon={Target} accent="oklch(0.7 0.16 145)" />
        <KPI label="Taxa de conv." value={`${convRate.toFixed(1)}%`} icon={TrendingUp} />
        <KPI label="Amadurecimento" value={fmt(t.amadurecimento)} />
        <KPI label="Novas contas" value={fmt(t.novasContas)} />
        <KPI label="Faturado (novas)" value={fmtBRL(t.faturado)} accent="oklch(0.68 0.2 47)" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <BucketBlock title="Origem dos leads" data={data.porOrigem} suffix=" leads" />
        <BucketBlock title="Sub-origem" data={data.porSubOrigem.slice(0, 10)} suffix=" leads" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <BucketBlock title="Leads por owner (marketing)" data={data.porOwner} suffix=" leads" />
        <BucketBlock title="Status dos leads" data={data.statusBreakdown} suffix=" leads" />
      </div>

      <div className="glass rounded-2xl p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Série diária — leads x convertidos
        </div>
        {data.serieDiaria.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sem leads no período.</div>
        ) : (
          <div className="flex items-end gap-1 h-40">
            {data.serieDiaria.map((d) => {
              const h = dailyMax > 0 ? (d.leads / dailyMax) * 100 : 0;
              const hc = d.leads > 0 ? (d.convertidos / d.leads) * 100 : 0;
              return (
                <div key={d.date} className="flex-1 flex flex-col justify-end group relative">
                  <div className="w-full bg-primary/30 rounded-t-sm relative" style={{ height: `${h}%` }}>
                    <div
                      className="absolute bottom-0 inset-x-0 bg-primary rounded-t-sm"
                      style={{ height: `${hc}%` }}
                    />
                  </div>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-surface-2 border border-border rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                    {d.date} · {d.leads}L / {d.convertidos}C
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary/30" /> Leads</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary" /> Convertidos</span>
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-semibold">Leads convertidos ({data.convertidos.length})</h2>
          <span className="text-[11px] text-muted-foreground">Faturamento por conta apenas dentro do período selecionado</span>
        </div>
        <div className="overflow-x-auto max-h-[520px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="text-left px-4 py-2.5">Data</th>
                <th className="text-left px-4 py-2.5">Lead</th>
                <th className="text-left px-4 py-2.5">Owner</th>
                <th className="text-left px-4 py-2.5">Origem</th>
                <th className="text-left px-4 py-2.5">Sub-origem</th>
                <th className="text-right px-4 py-2.5">Faturado</th>
              </tr>
            </thead>
            <tbody>
              {data.convertidos.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Nenhuma conversão no período.</td></tr>
              ) : data.convertidos.map((c) => (
                <tr key={c.id} className="border-b border-border/40 hover:bg-surface-2/50">
                  <td className="px-4 py-2 tabular-nums">{c.convertedDate ?? "—"}</td>
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.owner ?? "—"}</td>
                  <td className="px-4 py-2">{c.origem ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.subOrigem ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">
                    {c.accountValue && c.accountValue > 0 ? fmtBRL(c.accountValue) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function KPI({ label, value, icon: Icon, accent }: { label: string; value: string; icon?: typeof Users; accent?: string }) {
  return (
    <div className="glass rounded-xl p-3.5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        {Icon ? <Icon className="h-3.5 w-3.5" style={{ color: accent ?? undefined }} /> : null}
      </div>
      <div className="font-display font-bold text-2xl tabular-nums mt-1" style={{ color: accent ?? undefined }}>
        {value}
      </div>
    </div>
  );
}

function BucketBlock({ title, data, suffix }: { title: string; data: { label: string; value: number }[]; suffix: string }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="glass rounded-2xl p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{title}</div>
      {data.length === 0 ? (
        <div className="text-sm text-muted-foreground">Sem dados no período.</div>
      ) : (
        <div className="space-y-2">
          {data.map((o) => {
            const pct = total > 0 ? (o.value / total) * 100 : 0;
            return (
              <div key={o.label}>
                <div className="flex justify-between text-sm">
                  <span className="truncate pr-2">{o.label}</span>
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    {fmt(o.value)}{suffix} · {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden mt-1">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

