import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Megaphone, Search, Facebook, Users, Target as TargetIcon, AlertCircle, TrendingUp, TrendingDown, Info, Filter, ArrowRight, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { listMarketingGoals, type MarketingGoalRow } from "@/lib/marketing-goals.functions";
import { getMarketingSalesforceData } from "@/lib/salesforce.functions";
import { classifyOrigem } from "@/lib/marketing-origem";
import { getMetricoolAdsData, type MetricoolAdsPlatform } from "@/lib/metricool.functions";
import { AtlasSoonCard } from "@/components/marketing/atlas-soon-card";
import { useMarketingUnit } from "@/components/instance-provider";
import { DateRangePicker, defaultRange, ymd, type DateRangeValue } from "@/components/date-range-picker";

export const Route = createFileRoute("/_authenticated/marketing/trafego")({
  head: () => ({ meta: [{ title: "Mídia Paga — Marketing — Portal 2P" }] }),
  component: MidiaPagaPage,
});

const fmt = (n: number) => n.toLocaleString("pt-BR");
const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtBRLdec = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const findGoal = (rows: MarketingGoalRow[] | undefined, k: string) => rows?.find((r) => r.key === k);

function daysBetween(startISO: string, endISO: string) {
  const s = new Date(startISO); const e = new Date(endISO);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}
function previousRange(r: DateRangeValue): { start: string; end: string; label: string } {
  const len = daysBetween(r.start, r.end);
  const prevEnd = new Date(r.start); prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate() - (len - 1));
  return { start: ymd(prevStart), end: ymd(prevEnd), label: "Período anterior" };
}
function delta(current: number, previous: number): { pct: number; up: boolean } | null {
  if (previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  return { pct, up: pct >= 0 };
}

function MidiaPagaPage() {
  const { marketingUnit } = useMarketingUnit();
  const [range, setRange] = useState<DateRangeValue>(() => defaultRange());
  const [plat, setPlat] = useState<"all" | "google" | "meta">("all");
  const prev = useMemo(() => previousRange(range), [range]);

  const fetchGoals = useServerFn(listMarketingGoals);
  const fetchSF = useServerFn(getMarketingSalesforceData);
  const fetchAds = useServerFn(getMetricoolAdsData);

  const gq = useQuery({ queryKey: ["marketing-goals"], queryFn: () => fetchGoals(), staleTime: 60_000 });
  const sfQ = useQuery({
    queryKey: ["marketing-sf", range.start, range.end],
    queryFn: () => fetchSF({ data: { start: range.start, end: range.end } }),
    staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const sfPrevQ = useQuery({
    queryKey: ["marketing-sf", prev.start, prev.end],
    queryFn: () => fetchSF({ data: { start: prev.start, end: prev.end } }),
    staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const adsQ = useQuery({
    queryKey: ["metricool-ads", marketingUnit, range.start, range.end],
    queryFn: () => fetchAds({ data: { unit: marketingUnit, start: range.start, end: range.end } }),
    staleTime: 5 * 60_000, refetchOnWindowFocus: false,
  });
  const adsPrevQ = useQuery({
    queryKey: ["metricool-ads", marketingUnit, prev.start, prev.end],
    queryFn: () => fetchAds({ data: { unit: marketingUnit, start: prev.start, end: prev.end } }),
    staleTime: 5 * 60_000, refetchOnWindowFocus: false,
  });

  const mql = findGoal(gq.data?.records, "mql_pago_mes");
  const novos = findGoal(gq.data?.records, "novos_pago_mes");

  const paidMetrics = useMemo(() => computePaidSalesforce(sfQ.data), [sfQ.data]);
  const paidPrev = useMemo(() => computePaidSalesforce(sfPrevQ.data), [sfPrevQ.data]);

  const platforms = adsQ.data?.platforms ?? [];
  const filtered = plat === "all" ? platforms : platforms.filter((p) => p.platform === plat);
  const totals = useMemo(() => aggregate(filtered), [filtered]);

  const platformsPrev = adsPrevQ.data?.platforms ?? [];
  const filteredPrev = plat === "all" ? platformsPrev : platformsPrev.filter((p) => p.platform === plat);
  const totalsPrev = useMemo(() => aggregate(filteredPrev), [filteredPrev]);

  const cpl = paidMetrics.leadsPaid > 0 && totals.spend > 0 ? totals.spend / paidMetrics.leadsPaid : 0;
  const cpNovo = paidMetrics.novosPaid > 0 && totals.spend > 0 ? totals.spend / paidMetrics.novosPaid : 0;

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Marketing · Julia</div>
            <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-primary" /> Mídia Paga
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Google Ads + Meta Ads via Metricool · Salesforce (origens pagas) · vs {prev.start.slice(5)} → {prev.end.slice(5)}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <DateRangePicker value={range} onChange={setRange} />
            <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-xs">
              {(["all", "google", "meta"] as const).map((p) => (
                <button key={p} onClick={() => setPlat(p)} className={cn(
                  "px-2.5 py-1.5 rounded-md font-medium capitalize",
                  plat === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}>
                  {p === "all" ? "Todas" : p === "google" ? "Google" : "Meta"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {adsQ.data?.error && (
          <div className="glass rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-amber-500">
            <AlertCircle className="h-4 w-4" /> Metricool: {adsQ.data.error}
          </div>
        )}

        {/* Integration status */}
        <IntegrationStatus platforms={platforms} loading={adsQ.isLoading} />

        {/* Metas de leads pagos */}
        <div className="grid md:grid-cols-2 gap-4">
          <BigGoal
            label={mql?.label ?? "MQL (Mídia Paga)"}
            real={paidMetrics.mqlPaid} prev={paidPrev.mqlPaid}
            meta={mql?.goal ?? 250}
            icon={TargetIcon} accent="oklch(0.6 0.18 240)" loading={sfQ.isLoading}
          />
          <BigGoal
            label={novos?.label ?? "Novos (Mídia Paga)"}
            real={paidMetrics.novosPaid} prev={paidPrev.novosPaid}
            meta={novos?.goal ?? 30}
            icon={Users} accent="oklch(0.7 0.16 145)" loading={sfQ.isLoading}
          />
        </div>

        {/* KPIs consolidados de Ads */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <KPI label="Investimento" value={fmtBRL(totals.spend)} d={delta(totals.spend, totalsPrev.spend)} loading={adsQ.isLoading} />
          <KPI label="Impressões" value={fmt(totals.impressions)} d={delta(totals.impressions, totalsPrev.impressions)} loading={adsQ.isLoading} />
          <KPI label="Cliques" value={fmt(totals.clicks)} d={delta(totals.clicks, totalsPrev.clicks)} loading={adsQ.isLoading} />
          <KPI label="CTR" value={`${totals.ctr.toFixed(2)}%`} d={delta(totals.ctr, totalsPrev.ctr)} loading={adsQ.isLoading} />
          <KPI label="CPC" value={totals.clicks ? fmtBRLdec(totals.cpc) : "—"} d={delta(totals.cpc, totalsPrev.cpc)} loading={adsQ.isLoading} invertDelta />
          <KPI label="Conversões" value={fmt(totals.conversions)} d={delta(totals.conversions, totalsPrev.conversions)} loading={adsQ.isLoading} />
          <KPI label="CPA" value={totals.conversions ? fmtBRL(totals.cpa) : "—"} d={delta(totals.cpa, totalsPrev.cpa)} loading={adsQ.isLoading} invertDelta />
        </div>

        {/* KPIs Salesforce (origens pagas) */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KPI label="Leads pagos" value={fmt(paidMetrics.leadsPaid)} d={delta(paidMetrics.leadsPaid, paidPrev.leadsPaid)} loading={sfQ.isLoading} />
          <KPI label="MQL pagos" value={fmt(paidMetrics.mqlPaid)} d={delta(paidMetrics.mqlPaid, paidPrev.mqlPaid)} loading={sfQ.isLoading} />
          <KPI label="Novos (pago)" value={fmt(paidMetrics.novosPaid)} d={delta(paidMetrics.novosPaid, paidPrev.novosPaid)} loading={sfQ.isLoading} />
          <KPI label="Taxa conversão" value={paidMetrics.leadsPaid ? `${((paidMetrics.novosPaid / paidMetrics.leadsPaid) * 100).toFixed(1)}%` : "—"} loading={sfQ.isLoading} />
          <KPI label="CPL (ads/leads)" value={cpl ? fmtBRLdec(cpl) : "—"} loading={adsQ.isLoading || sfQ.isLoading} invertDelta />
          <KPI label="Custo por novo" value={cpNovo ? fmtBRL(cpNovo) : "—"} loading={adsQ.isLoading || sfQ.isLoading} invertDelta />
        </div>

        {/* Cards por plataforma */}
        <div className="grid lg:grid-cols-2 gap-4">
          {platforms.map((p) => {
            const prevP = platformsPrev.find((x) => x.platform === p.platform);
            return <PlatformCard key={p.platform} data={p} prev={prevP} />;
          })}
          {!adsQ.isLoading && platforms.length === 0 && (
            <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">
              Nenhuma plataforma de ads conectada nesta brand do Metricool.
            </div>
          )}
        </div>

        {/* Funil pago */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="h-4 w-4 text-primary" />
            <h2 className="font-display font-semibold">Funil · Origens pagas</h2>
            <span className="text-xs text-muted-foreground ml-auto">Salesforce · {range.start} → {range.end}</span>
          </div>
          <FunnelPaid data={paidMetrics} />
        </div>

        {/* Série diária consolidada */}
        {totals.daily.length > 0 && (
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-semibold">Investimento diário</h2>
              <span className="text-xs text-muted-foreground">
                Total {fmtBRL(totals.spend)} · pico {fmtBRL(Math.max(...totals.daily.map((d) => d.spend)))}
              </span>
            </div>
            <DailyBars daily={totals.daily} />
          </div>
        )}

        {/* Origens pagas — tabela */}
        {paidMetrics.origins.length > 0 && (
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Search className="h-4 w-4 text-primary" />
              <h2 className="font-display font-semibold">Origens pagas · Ranking</h2>
              <span className="text-xs text-muted-foreground ml-auto">{paidMetrics.leadsPaid} leads</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="py-2">Origem</th>
                    <th className="py-2 text-right">Leads</th>
                    <th className="py-2 text-right">% do pago</th>
                    <th className="py-2">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {paidMetrics.origins.slice(0, 15).map((o: { label: string; value: number }) => {
                    const pct = paidMetrics.leadsPaid > 0 ? (o.value / paidMetrics.leadsPaid) * 100 : 0;
                    return (
                      <tr key={o.label} className="border-b border-border/40 hover:bg-surface-2/30">
                        <td className="py-2 truncate max-w-[420px]">{o.label}</td>
                        <td className="py-2 text-right tabular-nums">{fmt(o.value)}</td>
                        <td className="py-2 text-right tabular-nums">{pct.toFixed(1)}%</td>
                        <td className="py-2 w-[35%]">
                          <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <AtlasSoonCard />
      </div>
    </AppLayout>
  );
}

/* ==================== helpers & subcomponents ==================== */

type PaidMetrics = ReturnType<typeof computePaidSalesforce>;

function computePaidSalesforce(d: any) {
  if (!d) return { leadsPaid: 0, mqlPaid: 0, novosPaid: 0, naoConvPaid: 0, origins: [] as { label: string; value: number }[] };
  const origins = (d.porOrigem ?? []).filter((o: any) => classifyOrigem(o.label) === "paid");
  const leadsPaid = origins.reduce((a: number, b: any) => a + b.value, 0);
  const totalLeads = d.totals.leads || 1;
  const share = leadsPaid / totalLeads;
  const mqlPaid = Math.round(
    (d.statusBreakdown ?? []).filter((s: any) => s.label === "Convertido" || s.label === "Amadurecimento")
      .reduce((a: number, b: any) => a + b.value, 0) * share,
  );
  const novosPaid = (d.convertidos ?? []).filter((c: any) => classifyOrigem(c.origem) === "paid").length;
  const naoConvPaid = Math.round(
    (d.statusBreakdown ?? []).filter((s: any) => s.label === "Não Convertido")
      .reduce((a: number, b: any) => a + b.value, 0) * share,
  );
  return { leadsPaid, mqlPaid, novosPaid, naoConvPaid, origins: origins.sort((a: any, b: any) => b.value - a.value) };
}

function aggregate(list: MetricoolAdsPlatform[]) {
  const spend = list.reduce((a, b) => a + b.spend, 0);
  const clicks = list.reduce((a, b) => a + b.clicks, 0);
  const impressions = list.reduce((a, b) => a + b.impressions, 0);
  const conversions = list.reduce((a, b) => a + b.conversions, 0);
  const dailyMap = new Map<string, { date: string; spend: number; clicks: number; impressions: number; conversions: number }>();
  for (const p of list) for (const d of p.daily) {
    const row = dailyMap.get(d.date) ?? { date: d.date, spend: 0, clicks: 0, impressions: 0, conversions: 0 };
    row.spend += d.spend; row.clicks += d.clicks; row.impressions += d.impressions; row.conversions += d.conversions;
    dailyMap.set(d.date, row);
  }
  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  return {
    spend, clicks, impressions, conversions, daily,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    cpa: conversions > 0 ? spend / conversions : 0,
  };
}

function IntegrationStatus({ platforms, loading }: { platforms: MetricoolAdsPlatform[]; loading: boolean }) {
  if (loading) return null;
  const g = platforms.find((p) => p.platform === "google");
  const m = platforms.find((p) => p.platform === "meta");
  const items = [
    { name: "Google Ads", data: g },
    { name: "Meta Ads", data: m },
  ];
  const anyEmpty = items.some((i) => !i.data || (i.data.connected && i.data.spend === 0 && i.data.impressions === 0));
  if (!anyEmpty) return null;
  return (
    <div className="rounded-xl border border-border bg-surface/40 px-4 py-3 flex items-start gap-3 text-sm">
      <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="font-medium">Status da integração de ads</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Se aparecer "sem dados" no período, a conta pode não estar sincronizando com a Metricool.
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {items.map((it) => {
            const status = !it.data ? "off" : !it.data.connected ? "off" : it.data.spend > 0 ? "ok" : "empty";
            const color = status === "ok" ? "bg-success/15 text-success" : status === "empty" ? "bg-amber-500/15 text-amber-600" : "bg-destructive/15 text-destructive";
            const label = status === "ok" ? "sincronizando" : status === "empty" ? "conectada · sem gasto" : "não conectada";
            return (
              <span key={it.name} className={cn("text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded", color)}>
                {it.name} · {label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FunnelPaid({ data }: { data: PaidMetrics }) {
  const stages = [
    { label: "Leads pagos", value: data.leadsPaid, color: "oklch(0.65 0.15 240)" },
    { label: "MQL pagos", value: data.mqlPaid, color: "oklch(0.65 0.15 210)" },
    { label: "Novos (converted)", value: data.novosPaid, color: "oklch(0.7 0.16 145)" },
  ];
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="space-y-2">
      {stages.map((s, i) => {
        const pct = (s.value / max) * 100;
        const conv = i > 0 && stages[i - 1].value > 0 ? (s.value / stages[i - 1].value) * 100 : null;
        return (
          <div key={s.label} className="flex items-center gap-3">
            <div className="w-40 text-sm">{s.label}</div>
            <div className="flex-1 h-8 bg-surface-2 rounded-md overflow-hidden relative">
              <div className="h-full flex items-center px-3 text-xs font-semibold text-white" style={{ width: `${pct}%`, background: s.color }}>
                {fmt(s.value)}
              </div>
            </div>
            <div className="w-24 text-right text-xs text-muted-foreground tabular-nums">
              {conv != null ? `${conv.toFixed(1)}% conv.` : "—"}
            </div>
          </div>
        );
      })}
      {data.naoConvPaid > 0 && (
        <div className="pt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" /> Estimativa: {fmt(data.naoConvPaid)} leads pagos marcados como Não Convertido no período.
        </div>
      )}
    </div>
  );
}

function PlatformCard({ data, prev }: { data: MetricoolAdsPlatform; prev?: MetricoolAdsPlatform }) {
  const isGoogle = data.platform === "google";
  const Icon = isGoogle ? Search : Facebook;
  const color = isGoogle ? "oklch(0.65 0.18 25)" : "oklch(0.55 0.2 265)";
  const name = isGoogle ? "Google Ads" : "Meta Ads";
  const spendD = prev ? delta(data.spend, prev.spend) : null;
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color }} />
        <span className="font-semibold">{name}</span>
        <span className={cn(
          "ml-auto text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase",
          data.connected && data.spend > 0 ? "bg-success/15 text-success"
            : data.connected ? "bg-amber-500/15 text-amber-600"
            : "bg-destructive/15 text-destructive",
        )}>
          {data.connected ? (data.spend > 0 ? "Ativa" : "Sem gasto no período") : "Não conectada"}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Metric label="Investimento" value={fmtBRL(data.spend)} accent={color} big d={spendD} />
        <Metric label="Conversões" value={fmt(data.conversions)} accent={color} big d={prev ? delta(data.conversions, prev.conversions) : null} />
        <Metric label="CTR" value={`${data.ctr.toFixed(2)}%`} d={prev ? delta(data.ctr, prev.ctr) : null} />
        <Metric label="CPC" value={data.clicks > 0 ? fmtBRLdec(data.cpc) : "—"} d={prev ? delta(data.cpc, prev.cpc) : null} invertDelta />
        <Metric label="CPM" value={data.impressions > 0 ? fmtBRLdec(data.cpm) : "—"} d={prev ? delta(data.cpm, prev.cpm) : null} invertDelta />
        <Metric label="CPA" value={data.conversions > 0 ? fmtBRL(data.cpa) : "—"} d={prev ? delta(data.cpa, prev.cpa) : null} invertDelta />
      </div>
      {(data.roas != null || (data.conversionValue ?? 0) > 0) && (
        <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
          <ArrowRight className="h-3 w-3" />
          {data.roas != null && <>ROAS <span className="font-semibold text-emerald-500">{data.roas.toFixed(2)}x</span></>}
          {(data.conversionValue ?? 0) > 0 && <>· Valor de conversão <span className="font-semibold">{fmtBRL(data.conversionValue ?? 0)}</span></>}
        </div>
      )}
      {data.daily.length > 0 && <div className="mt-3"><DailyBars daily={data.daily} height={40} /></div>}
    </div>
  );
}

function Metric({ label, value, accent, big, d, invertDelta }: { label: string; value: string; accent?: string; big?: boolean; d?: { pct: number; up: boolean } | null; invertDelta?: boolean }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
        <span>{label}</span>
        {d && <DeltaBadge d={d} invert={invertDelta} />}
      </div>
      <div className={cn("font-semibold tabular-nums mt-0.5", big && "text-xl font-display font-bold")}
        style={accent && big ? { color: accent } : undefined}>{value}</div>
    </div>
  );
}

function DeltaBadge({ d, invert }: { d: { pct: number; up: boolean }; invert?: boolean }) {
  const good = invert ? !d.up : d.up;
  const Icon = d.up ? TrendingUp : TrendingDown;
  return (
    <span className={cn("flex items-center gap-0.5 tabular-nums normal-case", good ? "text-emerald-500" : "text-rose-500")}>
      <Icon className="h-3 w-3" />{Math.abs(d.pct).toFixed(1)}%
    </span>
  );
}

function DailyBars({ daily, height = 64 }: { daily: Array<{ date: string; spend: number }>; height?: number }) {
  const max = Math.max(...daily.map((d) => d.spend), 1);
  return (
    <div className="flex items-end gap-0.5" style={{ height }}>
      {daily.map((d) => {
        const h = Math.max(2, (d.spend / max) * height);
        return (
          <div key={d.date} className="flex-1 min-w-0 group relative">
            <div className="bg-primary/70 hover:bg-primary rounded-sm mx-auto w-full" style={{ height: h }} />
            <div className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-popover border border-border rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap z-10">
              {d.date.slice(5)} · {fmtBRL(d.spend)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KPI({ label, value, loading, d, invertDelta }: { label: string; value: string; loading?: boolean; d?: { pct: number; up: boolean } | null; invertDelta?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
        <span>{label}</span>
        {d && <DeltaBadge d={d} invert={invertDelta} />}
      </div>
      <div className="font-display font-bold text-xl tabular-nums mt-1">
        {loading ? "…" : value}
      </div>
    </div>
  );
}

function BigGoal({ label, real, prev, meta, icon: Icon, accent, loading }: { label: string; real: number; prev: number; meta: number; icon: typeof Users; accent: string; loading?: boolean }) {
  const pct = meta > 0 ? (real / meta) * 100 : 0;
  const above = pct >= 100;
  const d = delta(real, prev);
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{loading ? "Salesforce · carregando…" : "Período · Salesforce"}</div>
          <div className="font-display font-semibold text-lg mt-0.5">{label}</div>
        </div>
        <Icon className="h-5 w-5" style={{ color: accent }} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="font-display font-bold text-4xl tabular-nums" style={{ color: accent }}>{fmt(real)}</div>
        <div className="text-sm text-muted-foreground">/ {fmt(meta)}</div>
        <span className="ml-auto text-xs flex items-center gap-1" style={{ color: accent }}>
          {above ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="mt-3 h-2 bg-surface-2 rounded-full overflow-hidden">
        <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: accent }} />
      </div>
      {d && (
        <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
          vs anterior: <DeltaBadge d={d} />
        </div>
      )}
    </div>
  );
}
