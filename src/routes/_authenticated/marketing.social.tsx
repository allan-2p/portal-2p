import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import {
  Instagram, Youtube, Users, Radio, Facebook, Linkedin, AlertCircle,
  TrendingUp, TrendingDown, Heart, MessageCircle, Eye, Sparkles, Clock, CalendarDays,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMarketingGoals, type MarketingGoalRow } from "@/lib/marketing-goals.functions";
import { getMarketingSalesforceData } from "@/lib/salesforce.functions";
import { classifyOrigem } from "@/lib/marketing-origem";
import { getMetricoolBrandData, type MetricoolPost, type MetricoolDailyPoint } from "@/lib/metricool.functions";
import { useMarketingUnit } from "@/components/instance-provider";
import { AtlasSoonCard } from "./marketing.index";
import { DateRangePicker, defaultRange, ymd, type DateRangeValue } from "@/components/date-range-picker";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/marketing/social")({
  head: () => ({ meta: [{ title: "Social Mídia — Marketing — Portal 2P" }] }),
  component: SocialPage,
});

const fmt = (n: number) => n.toLocaleString("pt-BR");
const findGoal = (rows: MarketingGoalRow[] | undefined, key: string) => rows?.find((r) => r.key === key);

const UNIT_META = {
  solar: { label: "2P Solar", color: "oklch(0.68 0.2 47)" },
  carregadores: { label: "2P Carregadores", color: "oklch(0.5 0.19 265)" },
  station: { label: "2P Station", color: "oklch(0.78 0.14 90)" },
} as const;

const NET_ICON: Record<string, typeof Instagram> = {
  instagram: Instagram, facebook: Facebook, youtube: Youtube, tiktok: Radio, linkedin: Linkedin,
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

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
  return { pct: ((current - previous) / previous) * 100, up: current >= previous };
}

function SocialPage() {
  const { marketingUnit } = useMarketingUnit();
  const meta = UNIT_META[marketingUnit];
  const [range, setRange] = useState<DateRangeValue>(() => defaultRange());
  const prev = useMemo(() => previousRange(range), [range]);

  const fetchGoals = useServerFn(listMarketingGoals);
  const fetchSF = useServerFn(getMarketingSalesforceData);
  const fetchMC = useServerFn(getMetricoolBrandData);

  const q = useQuery({ queryKey: ["marketing-goals"], queryFn: () => fetchGoals(), staleTime: 60_000 });
  const sfQ = useQuery({
    queryKey: ["marketing-sf", range.start, range.end],
    queryFn: () => fetchSF({ data: { start: range.start, end: range.end } }),
    staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const mcQ = useQuery({
    queryKey: ["metricool", marketingUnit, range.start, range.end],
    queryFn: () => fetchMC({ data: { unit: marketingUnit, start: range.start, end: range.end } }),
    staleTime: 5 * 60_000, refetchOnWindowFocus: false,
  });
  const mcPrevQ = useQuery({
    queryKey: ["metricool", marketingUnit, prev.start, prev.end],
    queryFn: () => fetchMC({ data: { unit: marketingUnit, start: prev.start, end: prev.end } }),
    staleTime: 5 * 60_000, refetchOnWindowFocus: false,
  });

  const recs = q.data?.records;
  const leadsOrg = findGoal(recs, "leads_qualificados_mes");

  const igGoalKey =
    marketingUnit === "solar" ? "ig_solar_tri"
      : marketingUnit === "carregadores" ? "ig_carregadores_tri"
        : "ig_station_tri";
  const igGoal = findGoal(recs, igGoalKey);

  const mqlOrganicoReal = useMemo(() => {
    const d = sfQ.data;
    if (!d) return null;
    const qualified = new Set(["Convertido", "Amadurecimento"]);
    const totalLeads = d.totals.leads;
    if (totalLeads === 0) return 0;
    const qualifiedLeads = d.statusBreakdown.filter((s) => qualified.has(s.label)).reduce((a, b) => a + b.value, 0);
    const organicShare = d.porOrigem.filter((o) => classifyOrigem(o.label) === "organic").reduce((a, b) => a + b.value, 0);
    return Math.round((organicShare / totalLeads) * qualifiedLeads);
  }, [sfQ.data]);

  const displayReal = mqlOrganicoReal ?? leadsOrg?.real_value ?? 0;
  const ig = mcQ.data?.followers.find((f) => f.network === "instagram");
  const igPrev = mcPrevQ.data?.followers.find((f) => f.network === "instagram");
  const igReal = ig?.followers ?? 0;
  const posts = mcQ.data?.posts ?? [];
  const postsPrev = mcPrevQ.data?.posts ?? [];
  const insights = useMemo(() => computeInsights(posts), [posts]);
  const insightsPrev = useMemo(() => computeInsights(postsPrev), [postsPrev]);
  const igSeries = mcQ.data?.igSeries ?? { followers: [], reach: [], engaged: [] };

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Marketing · {meta.label} · Ingrid
            </div>
            <h1 className="text-3xl font-bold mt-1">Social Mídia</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Metricool + Salesforce · {range.label} · vs {prev.start.slice(5)} → {prev.end.slice(5)}
            </p>
          </div>
          <DateRangePicker value={range} onChange={setRange} />
        </div>

        {mcQ.data?.error && (
          <div className="glass rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-amber-500">
            <AlertCircle className="h-4 w-4" /> Metricool: {mcQ.data.error}
          </div>
        )}

        {/* Destaques */}
        <div className="grid lg:grid-cols-2 gap-4">
          <BigGoal
            label={leadsOrg?.label ?? "Leads qualificados (Orgânico)"}
            period={sfQ.isLoading ? "Salesforce · carregando…" : `Período · Salesforce`}
            real={displayReal} meta={leadsOrg?.goal ?? 150}
            accent="oklch(0.7 0.16 145)" icon={Users}
          />
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Trimestre · {meta.label}
                </div>
                <div className="font-display font-semibold text-lg mt-0.5">Seguidores Instagram</div>
              </div>
              <Instagram className="h-5 w-5" style={{ color: "oklch(0.65 0.2 350)" }} />
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <div className="font-display font-bold text-4xl tabular-nums" style={{ color: meta.color }}>
                {mcQ.isLoading ? "…" : fmt(igReal)}
              </div>
              <div className="text-sm text-muted-foreground">/ {fmt(igGoal?.goal ?? 0)}</div>
              {ig && ig.growth !== 0 && (
                <span className={`ml-auto text-xs flex items-center gap-1 ${ig.growth > 0 ? "text-emerald-500" : "text-destructive"}`}>
                  {ig.growth > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {ig.growth > 0 ? "+" : ""}{fmt(ig.growth)} no período
                </span>
              )}
            </div>
            <div className="mt-3 h-2 bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full" style={{
                width: `${Math.min(100, igGoal?.goal ? (igReal / igGoal.goal) * 100 : 0)}%`,
                background: meta.color,
              }} />
            </div>
          </div>
        </div>

        {/* KPIs Instagram com comparativo */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KPI label="Seguidores" value={fmt(igReal)} d={delta(igReal, igPrev?.followers ?? 0)} loading={mcQ.isLoading} />
          <KPI label="Crescimento (período)" value={fmt(ig?.growth ?? 0)} d={delta(ig?.growth ?? 0, igPrev?.growth ?? 0)} loading={mcQ.isLoading} />
          <KPI label="Posts publicados" value={fmt(insights.total)} d={delta(insights.total, insightsPrev.total)} loading={mcQ.isLoading} />
          <KPI label="Alcance total" value={fmt(insights.totalReach)} d={delta(insights.totalReach, insightsPrev.totalReach)} loading={mcQ.isLoading} />
          <KPI label="Interações" value={fmt(insights.totalInteractions)} d={delta(insights.totalInteractions, insightsPrev.totalInteractions)} loading={mcQ.isLoading} />
          <KPI label="Eng. médio" value={`${insights.avgEngagement.toFixed(2)}%`} d={delta(insights.avgEngagement, insightsPrev.avgEngagement)} loading={mcQ.isLoading} />
        </div>

        {/* Charts: seguidores + alcance/engajados */}
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="glass rounded-2xl p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Instagram · Seguidores</div>
                <div className="font-display font-semibold text-lg mt-0.5">Evolução no período</div>
              </div>
              {igSeries.followers.length > 1 && (
                <div className="text-xs text-muted-foreground">
                  {fmt(igSeries.followers[0].value)} → <span className="font-semibold text-foreground">{fmt(igSeries.followers[igSeries.followers.length - 1].value)}</span>
                </div>
              )}
            </div>
            <LineChart points={igSeries.followers} color={meta.color} height={180} />
          </div>
          <div className="glass rounded-2xl p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Alcance vs Engajados</div>
            <div className="mt-2 space-y-2">
              <MiniLine title="Alcance" points={igSeries.reach} color="oklch(0.6 0.18 240)" />
              <MiniLine title="Contas engajadas" points={igSeries.engaged} color="oklch(0.7 0.16 145)" />
            </div>
          </div>
        </div>

        {/* Melhor dia / melhor hora / mix de conteúdo */}
        <div className="grid md:grid-cols-3 gap-4">
          <BestByWeekday posts={posts} />
          <BestByHour posts={posts} />
          <EngagementBuckets posts={posts} />
        </div>

        {/* Redes conectadas */}
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Redes sociais · {meta.label}
          </div>
          {mcQ.isLoading ? (
            <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">Carregando dados do Metricool…</div>
          ) : mcQ.data && mcQ.data.followers.length === 0 ? (
            <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">
              Nenhuma rede conectada no Metricool para esta brand ainda.
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mcQ.data?.followers.map((row) => {
                const Icon = NET_ICON[row.network] ?? Radio;
                return (
                  <div key={row.network} className="glass rounded-2xl p-5">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" style={{ color: meta.color }} />
                      <span className="font-semibold capitalize">{row.network}</span>
                      {row.growth !== 0 && (
                        <span className={`ml-auto text-xs flex items-center gap-1 ${row.growth > 0 ? "text-emerald-500" : "text-destructive"}`}>
                          {row.growth > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {row.growth > 0 ? "+" : ""}{fmt(row.growth)}
                        </span>
                      )}
                    </div>
                    <div className="font-display font-bold text-3xl tabular-nums mt-2">{fmt(row.followers)}</div>
                    <div className="text-[11px] text-muted-foreground">seguidores</div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                      {row.reach != null && <MiniStat label="Alcance" value={fmt(row.reach)} />}
                      {row.engaged != null && <MiniStat label="Engajados" value={fmt(row.engaged)} />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top posts */}
        {insights.topPosts.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Top posts por engajamento
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {insights.topPosts.map((p) => <PostCard key={p.id} p={p} />)}
            </div>
          </div>
        )}

        {/* Timeline de posts */}
        {posts.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Posts recentes</div>
            <div className="glass rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
                    <th className="text-left px-4 py-2.5">Rede</th>
                    <th className="text-left px-4 py-2.5">Data</th>
                    <th className="text-left px-4 py-2.5">Conteúdo</th>
                    <th className="text-right px-4 py-2.5"><Heart className="inline h-3 w-3" /></th>
                    <th className="text-right px-4 py-2.5"><MessageCircle className="inline h-3 w-3" /></th>
                    <th className="text-right px-4 py-2.5"><Eye className="inline h-3 w-3" /></th>
                    <th className="text-right px-4 py-2.5">Eng.</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => (
                    <tr key={p.id} className="border-b border-border/40 hover:bg-surface-2/50">
                      <td className="px-4 py-2.5 capitalize">{p.network}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="px-4 py-2.5 max-w-md truncate">
                        {p.url ? (
                          <a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">
                            {p.text || "(sem texto)"}
                          </a>
                        ) : (p.text || "(sem texto)")}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(p.likes)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(p.comments)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(p.reach)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{p.engagement.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <NotionCalendarCard start={range.start} end={range.end} unit={marketingUnit} accent={meta.color} />

        <AtlasSoonCard />

      </div>
    </AppLayout>
  );
}

function computeInsights(posts: MetricoolPost[]) {
  const total = posts.length;
  const totalReach = posts.reduce((a, p) => a + p.reach, 0);
  const totalInteractions = posts.reduce((a, p) => a + p.interactions, 0);
  const avgReach = total > 0 ? totalReach / total : 0;
  const avgEngagement = total > 0 ? posts.reduce((a, p) => a + p.engagement, 0) / total : 0;
  const topPosts = [...posts].sort((a, b) => b.engagement - a.engagement).slice(0, 3);
  return { total, totalReach, totalInteractions, avgReach, avgEngagement, topPosts };
}

/* ============================ subcomponents ============================ */

function LineChart({ points, color, height = 160 }: { points: MetricoolDailyPoint[]; color: string; height?: number }) {
  if (points.length < 2) {
    return <div className="text-sm text-muted-foreground py-6 text-center">Sem série suficiente no período.</div>;
  }
  const w = 800; const h = height; const pad = 20;
  const values = points.map((p) => p.value);
  const min = Math.min(...values); const max = Math.max(...values);
  const range = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);
  const path = points.map((p, i) => {
    const x = pad + i * step;
    const y = pad + (h - pad * 2) * (1 - (p.value - min) / range);
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const areaPath = `${path} L ${(pad + (points.length - 1) * step).toFixed(1)} ${h - pad} L ${pad} ${h - pad} Z`;
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaGrad)" />
        <path d={path} fill="none" stroke={color} strokeWidth={2} />
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1 tabular-nums">
        <span>{points[0].date}</span>
        <span>min {fmt(min)} · max {fmt(max)}</span>
        <span>{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}

function MiniLine({ title, points, color }: { title: string; points: MetricoolDailyPoint[]; color: string }) {
  const total = points.reduce((a, b) => a + b.value, 0);
  if (points.length < 2) {
    return (
      <div className="rounded-lg border border-border/60 p-2">
        <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">{title}</span><span className="tabular-nums font-semibold">{fmt(total)}</span></div>
        <div className="text-[10px] text-muted-foreground mt-1">Sem série suficiente.</div>
      </div>
    );
  }
  const w = 200; const h = 44;
  const values = points.map((p) => p.value);
  const min = Math.min(...values); const max = Math.max(...values);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const path = points.map((p, i) => {
    const x = i * step;
    const y = h - 4 - (h - 8) * ((p.value - min) / range);
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  return (
    <div className="rounded-lg border border-border/60 p-2">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground">{title}</span>
        <span className="tabular-nums font-semibold">{fmt(total)}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }} preserveAspectRatio="none">
        <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
      </svg>
    </div>
  );
}

function BestByWeekday({ posts }: { posts: MetricoolPost[] }) {
  const buckets = useMemo(() => {
    const acc = Array.from({ length: 7 }, () => ({ count: 0, eng: 0 }));
    for (const p of posts) {
      if (!p.publishedAt) continue;
      const wd = new Date(p.publishedAt).getDay();
      acc[wd].count += 1;
      acc[wd].eng += p.engagement;
    }
    return acc.map((b, i) => ({
      label: WEEKDAY_LABELS[i],
      count: b.count,
      avg: b.count > 0 ? b.eng / b.count : 0,
    }));
  }, [posts]);
  const max = Math.max(0.001, ...buckets.map((b) => b.avg));
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="h-4 w-4 text-primary" />
        <div className="font-display font-semibold">Melhor dia da semana</div>
      </div>
      <div className="space-y-1.5">
        {buckets.map((b) => (
          <div key={b.label} className="flex items-center gap-2 text-xs">
            <span className="w-8 text-muted-foreground">{b.label}</span>
            <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${(b.avg / max) * 100}%` }} />
            </div>
            <span className="tabular-nums font-semibold w-14 text-right">{b.avg.toFixed(2)}%</span>
            <span className="tabular-nums text-muted-foreground w-8 text-right">{b.count}</span>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground mt-2">Engajamento médio · nº posts</div>
    </div>
  );
}

function BestByHour({ posts }: { posts: MetricoolPost[] }) {
  const buckets = useMemo(() => {
    const bins = [
      { label: "0–6h", from: 0, to: 6 },
      { label: "6–12h", from: 6, to: 12 },
      { label: "12–18h", from: 12, to: 18 },
      { label: "18–24h", from: 18, to: 24 },
    ];
    return bins.map((bin) => {
      const inBin = posts.filter((p) => {
        if (!p.publishedAt) return false;
        const h = new Date(p.publishedAt).getHours();
        return h >= bin.from && h < bin.to;
      });
      const avg = inBin.length > 0 ? inBin.reduce((a, b) => a + b.engagement, 0) / inBin.length : 0;
      return { label: bin.label, count: inBin.length, avg };
    });
  }, [posts]);
  const max = Math.max(0.001, ...buckets.map((b) => b.avg));
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-4 w-4 text-primary" />
        <div className="font-display font-semibold">Melhor horário</div>
      </div>
      <div className="space-y-1.5">
        {buckets.map((b) => (
          <div key={b.label} className="flex items-center gap-2 text-xs">
            <span className="w-14 text-muted-foreground">{b.label}</span>
            <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${(b.avg / max) * 100}%` }} />
            </div>
            <span className="tabular-nums font-semibold w-14 text-right">{b.avg.toFixed(2)}%</span>
            <span className="tabular-nums text-muted-foreground w-8 text-right">{b.count}</span>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground mt-2">Engajamento médio · nº posts</div>
    </div>
  );
}

function EngagementBuckets({ posts }: { posts: MetricoolPost[] }) {
  const buckets = useMemo(() => {
    const bins = [
      { label: "Baixo (<1%)", test: (e: number) => e < 1, color: "oklch(0.6 0.24 25)" },
      { label: "Médio (1–3%)", test: (e: number) => e >= 1 && e < 3, color: "oklch(0.75 0.15 80)" },
      { label: "Bom (3–6%)", test: (e: number) => e >= 3 && e < 6, color: "oklch(0.65 0.15 210)" },
      { label: "Excelente (≥6%)", test: (e: number) => e >= 6, color: "oklch(0.7 0.16 145)" },
    ];
    return bins.map((bin) => ({
      ...bin,
      count: posts.filter((p) => bin.test(p.engagement)).length,
    }));
  }, [posts]);
  const total = buckets.reduce((a, b) => a + b.count, 0) || 1;
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="font-display font-semibold">Distribuição de engajamento</div>
      </div>
      <div className="space-y-1.5">
        {buckets.map((b) => {
          const pct = (b.count / total) * 100;
          return (
            <div key={b.label} className="flex items-center gap-2 text-xs">
              <span className="w-32 truncate">{b.label}</span>
              <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                <div className="h-full" style={{ width: `${pct}%`, background: b.color }} />
              </div>
              <span className="tabular-nums font-semibold w-8 text-right">{b.count}</span>
              <span className="tabular-nums text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PostCard({ p }: { p: MetricoolPost }) {
  return (
    <a
      href={p.url ?? undefined} target="_blank" rel="noreferrer"
      className="glass rounded-2xl overflow-hidden hover:ring-1 hover:ring-primary transition"
    >
      {p.thumbnail && (
        <div className="aspect-square bg-surface-2 overflow-hidden">
          <img src={p.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}
      <div className="p-3 space-y-2">
        <div className="text-xs text-muted-foreground">
          {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString("pt-BR") : "—"}
        </div>
        <div className="text-sm line-clamp-2">{p.text || "(sem texto)"}</div>
        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/50">
          <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{fmt(p.likes)}</span>
          <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{fmt(p.comments)}</span>
          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{fmt(p.reach)}</span>
          <span className="font-semibold text-primary">{p.engagement.toFixed(2)}%</span>
        </div>
      </div>
    </a>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-surface/40 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function KPI({ label, value, d, loading, invertDelta }: {
  label: string; value: string;
  d?: { pct: number; up: boolean } | null;
  loading?: boolean; invertDelta?: boolean;
}) {
  const good = d ? (invertDelta ? !d.up : d.up) : null;
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-xl tabular-nums mt-1">{loading ? "…" : value}</div>
      {d && (
        <div className={cn(
          "text-[10px] mt-0.5 flex items-center gap-0.5 tabular-nums",
          good == null ? "text-muted-foreground" : good ? "text-emerald-500" : "text-destructive",
        )}>
          {d.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {d.up ? "+" : ""}{d.pct.toFixed(1)}%
        </div>
      )}
    </div>
  );
}

function BigGoal({ label, period, real, meta, accent, icon: Icon }: { label: string; period: string; real: number; meta: number; accent: string; icon: typeof Users }) {
  const pct = meta > 0 ? (real / meta) * 100 : 0;
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{period}</div>
          <div className="font-display font-semibold text-lg mt-0.5">{label}</div>
        </div>
        <Icon className="h-5 w-5" style={{ color: accent }} />
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <div className="font-display font-bold text-4xl tabular-nums" style={{ color: accent }}>{fmt(real)}</div>
        <div className="text-sm text-muted-foreground">/ {fmt(meta)}</div>
        <span className="ml-auto text-xs font-semibold" style={{ color: accent }}>{pct.toFixed(1)}%</span>
      </div>
      <div className="mt-3 h-2 bg-surface-2 rounded-full overflow-hidden">
        <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: accent }} />
      </div>
    </div>
  );
}
