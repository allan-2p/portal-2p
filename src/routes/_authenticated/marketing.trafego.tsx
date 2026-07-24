import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Megaphone, Search, Facebook, Users, Target as TargetIcon, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { listMarketingGoals, type MarketingGoalRow } from "@/lib/marketing-goals.functions";
import { getMarketingSalesforceData } from "@/lib/salesforce.functions";
import { classifyOrigem } from "@/lib/marketing-origem";
import { getMetricoolAdsData, type MetricoolAdsPlatform } from "@/lib/metricool.functions";
import { AtlasSoonCard } from "./marketing.index";
import { useMarketingUnit } from "@/components/instance-provider";
import { PeriodPicker, computeRange, type PeriodPreset } from "@/components/period-picker";

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

function MidiaPagaPage() {
  const { marketingUnit } = useMarketingUnit();
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [plat, setPlat] = useState<"all" | "google" | "meta">("all");
  const range = useMemo(() => computeRange(preset), [preset]);

  const fetchGoals = useServerFn(listMarketingGoals);
  const fetchSF = useServerFn(getMarketingSalesforceData);
  const fetchAds = useServerFn(getMetricoolAdsData);

  const gq = useQuery({ queryKey: ["marketing-goals"], queryFn: () => fetchGoals(), staleTime: 60_000 });
  const sfQ = useQuery({
    queryKey: ["marketing-sf", range.start, range.end],
    queryFn: () => fetchSF({ data: { start: range.start, end: range.end } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const adsQ = useQuery({
    queryKey: ["metricool-ads", marketingUnit, range.start, range.end],
    queryFn: () => fetchAds({ data: { unit: marketingUnit, start: range.start, end: range.end } }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const mql = findGoal(gq.data?.records, "mql_pago_mes");
  const novos = findGoal(gq.data?.records, "novos_pago_mes");

  const { mqlPagoReal, novosPagoReal } = useMemo(() => {
    const d = sfQ.data;
    if (!d) return { mqlPagoReal: null as number | null, novosPagoReal: null as number | null };
    const totalLeads = d.totals.leads;
    if (totalLeads === 0) return { mqlPagoReal: 0, novosPagoReal: 0 };
    const paidShare = d.porOrigem
      .filter((o) => classifyOrigem(o.label) === "paid")
      .reduce((a, b) => a + b.value, 0);
    const qualified = d.statusBreakdown
      .filter((s) => s.label === "Convertido" || s.label === "Amadurecimento")
      .reduce((a, b) => a + b.value, 0);
    const mqlPagoReal = Math.round((paidShare / totalLeads) * qualified);
    const novosPagoReal = d.convertidos.filter((c) => classifyOrigem(c.origem) === "paid").length;
    return { mqlPagoReal, novosPagoReal };
  }, [sfQ.data]);

  const mqlDisplay = mqlPagoReal ?? mql?.real_value ?? 0;
  const novosDisplay = novosPagoReal ?? novos?.real_value ?? 0;

  const platforms = adsQ.data?.platforms ?? [];
  const filtered = plat === "all" ? platforms : platforms.filter((p) => p.platform === plat);
  const totals = useMemo(() => aggregate(filtered), [filtered]);

  const paidOrigins = useMemo(() => {
    const rows = sfQ.data?.porOrigem ?? [];
    return rows.filter((o) => classifyOrigem(o.label) === "paid").sort((a, b) => b.value - a.value);
  }, [sfQ.data]);

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Marketing · Julia</div>
            <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-primary" /> Mídia Paga
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Google Ads e Meta Ads via Metricool · Salesforce · {range.label}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <PeriodPicker value={preset} onChange={setPreset} />
            <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-xs">
              {(["all", "google", "meta"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlat(p)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-md font-medium capitalize",
                    plat === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
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

        {/* Metas */}
        <div className="grid md:grid-cols-2 gap-4">
          <BigGoal label={mql?.label ?? "MQL (Mídia Paga)"} real={mqlDisplay} meta={mql?.goal ?? 250} icon={TargetIcon} accent="oklch(0.6 0.18 240)" loading={sfQ.isLoading} />
          <BigGoal label={novos?.label ?? "Novos (Mídia Paga)"} real={novosDisplay} meta={novos?.goal ?? 30} icon={Users} accent="oklch(0.7 0.16 145)" loading={sfQ.isLoading} />
        </div>

        {/* KPIs consolidados */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KPI label="Investimento" value={fmtBRL(totals.spend)} loading={adsQ.isLoading} />
          <KPI label="Impressões" value={fmt(totals.impressions)} loading={adsQ.isLoading} />
          <KPI label="Cliques" value={fmt(totals.clicks)} loading={adsQ.isLoading} />
          <KPI label="Conversões" value={fmt(totals.conversions)} loading={adsQ.isLoading} />
          <KPI label="CTR" value={`${totals.ctr.toFixed(2)}%`} loading={adsQ.isLoading} />
          <KPI label="CPA" value={totals.conversions > 0 ? fmtBRL(totals.cpa) : "—"} loading={adsQ.isLoading} />
        </div>

        {/* Cards por plataforma */}
        <div className="grid lg:grid-cols-2 gap-4">
          {platforms.map((p) => (
            <PlatformCard key={p.platform} data={p} />
          ))}
          {!adsQ.isLoading && platforms.length === 0 && (
            <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">
              Nenhuma plataforma de ads conectada nesta brand do Metricool ainda.
            </div>
          )}
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

        {/* Origens pagas no Salesforce */}
        {paidOrigins.length > 0 && (
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Search className="h-4 w-4 text-primary" />
              <h2 className="font-display font-semibold">Origens pagas · Leads no Salesforce</h2>
              <span className="text-xs text-muted-foreground ml-auto">{range.label}</span>
            </div>
            <div className="space-y-1.5">
              {paidOrigins.slice(0, 12).map((o) => {
                const max = paidOrigins[0]?.value || 1;
                const pct = (o.value / max) * 100;
                return (
                  <div key={o.label}>
                    <div className="flex justify-between text-sm">
                      <span className="truncate max-w-[70%]">{o.label}</span>
                      <span className="tabular-nums text-muted-foreground">{fmt(o.value)}</span>
                    </div>
                    <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <AtlasSoonCard />
      </div>
    </AppLayout>
  );
}

function aggregate(list: MetricoolAdsPlatform[]) {
  const spend = list.reduce((a, b) => a + b.spend, 0);
  const clicks = list.reduce((a, b) => a + b.clicks, 0);
  const impressions = list.reduce((a, b) => a + b.impressions, 0);
  const conversions = list.reduce((a, b) => a + b.conversions, 0);
  const dailyMap = new Map<string, { date: string; spend: number; clicks: number; impressions: number; conversions: number }>();
  for (const p of list) {
    for (const d of p.daily) {
      const row = dailyMap.get(d.date) ?? { date: d.date, spend: 0, clicks: 0, impressions: 0, conversions: 0 };
      row.spend += d.spend; row.clicks += d.clicks; row.impressions += d.impressions; row.conversions += d.conversions;
      dailyMap.set(d.date, row);
    }
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

function PlatformCard({ data }: { data: MetricoolAdsPlatform }) {
  const isGoogle = data.platform === "google";
  const Icon = isGoogle ? Search : Facebook;
  const color = isGoogle ? "oklch(0.65 0.18 25)" : "oklch(0.55 0.2 265)";
  const name = isGoogle ? "Google Ads" : "Meta Ads";
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color }} />
        <span className="font-semibold">{name}</span>
        <span className={cn(
          "ml-auto text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase",
          data.connected && data.spend > 0
            ? "bg-success/15 text-success"
            : data.connected
              ? "bg-muted text-muted-foreground"
              : "bg-destructive/15 text-destructive",
        )}>
          {data.connected ? (data.spend > 0 ? "Ativa" : "Sem dados no período") : "Não conectada"}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Metric label="Investimento" value={fmtBRL(data.spend)} accent={color} big />
        <Metric label="Conversões" value={fmt(data.conversions)} accent={color} big />
        <Metric label="CTR" value={`${data.ctr.toFixed(2)}%`} />
        <Metric label="CPC" value={data.clicks > 0 ? fmtBRLdec(data.cpc) : "—"} />
        <Metric label="CPM" value={data.impressions > 0 ? fmtBRLdec(data.cpm) : "—"} />
        <Metric label="CPA" value={data.conversions > 0 ? fmtBRL(data.cpa) : "—"} />
      </div>
      {data.roas != null && (
        <div className="mt-3 text-xs text-muted-foreground">
          ROAS <span className="font-semibold text-emerald-500">{data.roas.toFixed(2)}x</span>
          {" · "}Valor de conversão {fmtBRL(data.conversionValue ?? 0)}
        </div>
      )}
      {data.daily.length > 0 && <div className="mt-3"><DailyBars daily={data.daily} height={40} /></div>}
    </div>
  );
}

function Metric({ label, value, accent, big }: { label: string; value: string; accent?: string; big?: boolean }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-semibold tabular-nums mt-0.5", big && "text-xl font-display font-bold")}
        style={accent && big ? { color: accent } : undefined}>{value}</div>
    </div>
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

function KPI({ label, value, loading }: { label: string; value: string; loading?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-xl tabular-nums mt-1">
        {loading ? "…" : value}
      </div>
    </div>
  );
}

function BigGoal({ label, real, meta, icon: Icon, accent, loading }: { label: string; real: number; meta: number; icon: typeof Users; accent: string; loading?: boolean }) {
  const pct = meta > 0 ? (real / meta) * 100 : 0;
  const above = pct >= 100;
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
    </div>
  );
}
