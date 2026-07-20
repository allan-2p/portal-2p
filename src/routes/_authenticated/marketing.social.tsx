import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Instagram, Youtube, Users, Radio } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMarketingGoals, type MarketingGoalRow } from "@/lib/marketing-goals.functions";
import { AtlasSoonCard } from "./marketing.index";

export const Route = createFileRoute("/_authenticated/marketing/social")({
  head: () => ({ meta: [{ title: "Social Media — Marketing — Portal 2P" }] }),
  component: SocialPage,
});

const fmt = (n: number) => n.toLocaleString("pt-BR");

function findGoal(records: MarketingGoalRow[] | undefined, key: string): MarketingGoalRow | undefined {
  return records?.find((r) => r.key === key);
}

// Detalhes de outras redes (mock por hora — real preenchido manualmente quando
// a integração Meta/Google chegar).
const OUTRAS_REDES = [
  { nome: "YouTube", icon: Youtube, seguidores: 1180, novos30d: 62, cor: "oklch(0.55 0.22 25)" },
  { nome: "TikTok", icon: Radio, seguidores: 400, novos30d: 32, cor: "oklch(0.4 0.05 250)" },
];

function SocialPage() {
  const fetchGoals = useServerFn(listMarketingGoals);
  const q = useQuery({
    queryKey: ["marketing-goals"],
    queryFn: () => fetchGoals(),
    staleTime: 60_000,
  });
  const recs = q.data?.records;

  const leadsOrg = findGoal(recs, "leads_qualificados_mes");
  const igSolar = findGoal(recs, "ig_solar_tri");
  const igCarreg = findGoal(recs, "ig_carregadores_tri");
  const igStation = findGoal(recs, "ig_station_tri");

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Marketing · Ingrid</div>
          <h1 className="text-3xl font-bold mt-1">Social Media</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Leads qualificados orgânicos e crescimento de seguidores por unidade.
          </p>
        </div>

        {/* Destaques principais */}
        <div className="grid lg:grid-cols-2 gap-4">
          <BigGoal
            label={leadsOrg?.label ?? "Leads qualificados (Orgânico)"}
            period="Mês"
            real={leadsOrg?.real_value ?? 0}
            meta={leadsOrg?.goal ?? 150}
            accent="oklch(0.7 0.16 145)"
            icon={Users}
          />
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Trimestre</div>
                <div className="font-display font-semibold text-lg mt-0.5">Seguidores Instagram</div>
              </div>
              <Instagram className="h-5 w-5" style={{ color: "oklch(0.65 0.2 350)" }} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <IgUnit label="Solar" real={igSolar?.real_value ?? 0} meta={igSolar?.goal ?? 30000} color="oklch(0.68 0.2 47)" />
              <IgUnit label="Carregadores" real={igCarreg?.real_value ?? 0} meta={igCarreg?.goal ?? 10000} color="oklch(0.5 0.19 265)" />
              <IgUnit label="Station" real={igStation?.real_value ?? 0} meta={igStation?.goal ?? 3000} color="oklch(0.78 0.14 90)" />
            </div>
          </div>
        </div>

        {/* Outras redes */}
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Outras redes</div>
          <div className="grid md:grid-cols-2 gap-4">
            {OUTRAS_REDES.map((r) => (
              <div key={r.nome} className="glass rounded-2xl p-5">
                <div className="flex items-center gap-2">
                  <r.icon className="h-4 w-4" style={{ color: r.cor }} />
                  <span className="font-semibold">{r.nome}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <Stat label="Seguidores" value={fmt(r.seguidores)} />
                  <Stat label="Novos 30d" value={`+${fmt(r.novos30d)}`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <AtlasSoonCard />
      </div>
    </AppLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-lg tabular-nums">{value}</div>
    </div>
  );
}

function IgUnit({ label, real, meta, color }: { label: string; real: number; meta: number; color: string }) {
  const pct = meta > 0 ? Math.min(100, (real / meta) * 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
        {label}
      </div>
      <div className="font-display font-bold text-xl tabular-nums mt-1">{fmt(real)}</div>
      <div className="text-[11px] text-muted-foreground">/ {fmt(meta)}</div>
      <div className="mt-2 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mt-1 text-[10px] font-semibold" style={{ color }}>{pct.toFixed(0)}%</div>
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
