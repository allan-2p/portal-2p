import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Instagram, Youtube, Users, Radio, Facebook, Linkedin, AlertCircle, TrendingUp, Heart, MessageCircle, Eye } from "lucide-react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMarketingGoals, type MarketingGoalRow } from "@/lib/marketing-goals.functions";
import { getMarketingSalesforceData } from "@/lib/salesforce.functions";
import { classifyOrigem } from "@/lib/marketing-origem";
import { getMetricoolBrandData } from "@/lib/metricool.functions";
import { useMarketingUnit } from "@/components/instance-provider";
import { AtlasSoonCard } from "./marketing.index";

export const Route = createFileRoute("/_authenticated/marketing/social")({
  head: () => ({ meta: [{ title: "Social Media — Marketing — Portal 2P" }] }),
  component: SocialPage,
});

const fmt = (n: number) => n.toLocaleString("pt-BR");
const findGoal = (rows: MarketingGoalRow[] | undefined, key: string) =>
  rows?.find((r) => r.key === key);

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: ymd(start), end: ymd(now) };
}

const UNIT_META = {
  solar: { label: "2P Solar", color: "oklch(0.68 0.2 47)" },
  carregadores: { label: "2P Carregadores", color: "oklch(0.5 0.19 265)" },
  station: { label: "2P Station", color: "oklch(0.78 0.14 90)" },
} as const;

const NET_ICON: Record<string, typeof Instagram> = {
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
  tiktok: Radio,
  linkedin: Linkedin,
};

function SocialPage() {
  const { marketingUnit } = useMarketingUnit();
  const meta = UNIT_META[marketingUnit];
  const fetchGoals = useServerFn(listMarketingGoals);
  const fetchSF = useServerFn(getMarketingSalesforceData);
  const fetchMC = useServerFn(getMetricoolBrandData);
  const range = useMemo(() => currentMonthRange(), []);

  const q = useQuery({
    queryKey: ["marketing-goals"],
    queryFn: () => fetchGoals(),
    staleTime: 60_000,
  });
  const sfQ = useQuery({
    queryKey: ["marketing-sf", range.start, range.end],
    queryFn: () => fetchSF({ data: range }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const mcQ = useQuery({
    queryKey: ["metricool", marketingUnit, range.start, range.end],
    queryFn: () => fetchMC({ data: { unit: marketingUnit, start: range.start, end: range.end } }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const recs = q.data?.records;
  const leadsOrg = findGoal(recs, "leads_qualificados_mes");

  // Meta de seguidores Instagram por unidade
  const igGoalKey =
    marketingUnit === "solar"
      ? "ig_solar_tri"
      : marketingUnit === "carregadores"
        ? "ig_carregadores_tri"
        : "ig_station_tri";
  const igGoal = findGoal(recs, igGoalKey);

  // MQL orgânico real: fração orgânica dos leads qualificados no mês
  const mqlOrganicoReal = useMemo(() => {
    const d = sfQ.data;
    if (!d) return null;
    const qualifiedStatuses = new Set(["Convertido", "Amadurecimento"]);
    const totalLeads = d.totals.leads;
    const qualifiedLeads = d.statusBreakdown
      .filter((s) => qualifiedStatuses.has(s.label))
      .reduce((a, b) => a + b.value, 0);
    if (totalLeads === 0) return 0;
    const organicShare = d.porOrigem
      .filter((o) => classifyOrigem(o.label) === "organic")
      .reduce((a, b) => a + b.value, 0);
    return Math.round((organicShare / totalLeads) * qualifiedLeads);
  }, [sfQ.data]);

  const displayReal = mqlOrganicoReal ?? leadsOrg?.real_value ?? 0;

  const ig = mcQ.data?.followers.find((f) => f.network === "instagram");
  const igReal = ig?.followers ?? 0;

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Marketing · {meta.label} · Ingrid
          </div>
          <h1 className="text-3xl font-bold mt-1">Social Media</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Leads qualificados orgânicos e crescimento de seguidores da unidade.
          </p>
        </div>

        {mcQ.data?.error && (
          <div className="glass rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-amber-500">
            <AlertCircle className="h-4 w-4" />
            Metricool: {mcQ.data.error}
          </div>
        )}

        {/* Destaques principais */}
        <div className="grid lg:grid-cols-2 gap-4">
          <BigGoal
            label={leadsOrg?.label ?? "Leads qualificados (Orgânico)"}
            period={sfQ.isLoading ? "Mês · carregando…" : "Mês · Salesforce"}
            real={displayReal}
            meta={leadsOrg?.goal ?? 150}
            accent="oklch(0.7 0.16 145)"
            icon={Users}
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
                <span className="ml-auto text-xs flex items-center gap-1 text-emerald-500">
                  <TrendingUp className="h-3.5 w-3.5" /> +{fmt(ig.growth)} no período
                </span>
              )}
            </div>
            <div className="mt-3 h-2 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${Math.min(100, igGoal?.goal ? (igReal / igGoal.goal) * 100 : 0)}%`,
                  background: meta.color,
                }}
              />
            </div>
          </div>
        </div>

        {/* Todas as redes vindas do Metricool */}
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Redes sociais · {meta.label}
          </div>
          {mcQ.isLoading ? (
            <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">
              Carregando dados do Metricool…
            </div>
          ) : mcQ.data && mcQ.data.followers.length === 0 ? (
            <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">
              Nenhuma rede social conectada no Metricool para esta brand ainda.
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
                        <span className="ml-auto text-xs text-emerald-500 flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />+{fmt(row.growth)}
                        </span>
                      )}
                    </div>
                    <div className="font-display font-bold text-3xl tabular-nums mt-2">
                      {fmt(row.followers)}
                    </div>
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

        {/* Posts recentes */}
        {mcQ.data && mcQ.data.posts.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Posts recentes
            </div>
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
                  </tr>
                </thead>
                <tbody>
                  {mcQ.data.posts.map((p) => (
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
                        ) : (
                          p.text || "(sem texto)"
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(p.likes)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(p.comments)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(p.reach)}</td>
                    </tr>
                  ))}
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-surface/40 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
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
      </div>
      <div className="mt-3 h-2 bg-surface-2 rounded-full overflow-hidden">
        <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: accent }} />
      </div>
      <div className="mt-1 text-xs font-semibold" style={{ color: accent }}>{pct.toFixed(1)}% da meta</div>
    </div>
  );
}
