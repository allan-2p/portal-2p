import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Filter, Facebook, Search, Globe, Users, Target as TargetIcon } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { listMarketingGoals, type MarketingGoalRow } from "@/lib/marketing-goals.functions";
import { AtlasSoonCard } from "./marketing.index";
import { useMarketingUnit } from "@/components/instance-provider";

export const Route = createFileRoute("/_authenticated/marketing/trafego")({
  head: () => ({ meta: [{ title: "Tráfego Pago — Marketing — Portal 2P" }] }),
  component: TrafegoPage,
});

const CAMPANHAS = {
  solar: [
    { plat: "Google", nome: "Search · Kit Solar Residencial", status: "Ativa", cpm: 12.4, cpc: 3.2, ctr: 6.1, cpa: 128, roas: 5.4, gasto: 8420, conv: 12 },
    { plat: "Google", nome: "PMax · Financiamento", status: "Ativa", cpm: 9.8, cpc: 2.8, ctr: 5.4, cpa: 155, roas: 4.2, gasto: 6210, conv: 8 },
    { plat: "Meta", nome: "Vídeo · Depoimento Cliente A", status: "Ativa", cpm: 18.2, cpc: 1.9, ctr: 4.8, cpa: 82, roas: 6.8, gasto: 4820, conv: 18 },
    { plat: "Meta", nome: "Carrossel · Economia 90%", status: "Ativa", cpm: 15.4, cpc: 1.7, ctr: 3.9, cpa: 74, roas: 5.1, gasto: 3420, conv: 14 },
    { plat: "Meta", nome: "Remarketing · Site", status: "Pausada", cpm: 22.1, cpc: 2.4, ctr: 5.2, cpa: 68, roas: 7.2, gasto: 1240, conv: 4 },
  ],
  carregadores: [
    { plat: "Google", nome: "Search · Carregador Wallbox", status: "Ativa", cpm: 14.8, cpc: 4.1, ctr: 5.8, cpa: 210, roas: 3.4, gasto: 5820, conv: 6 },
    { plat: "Google", nome: "PMax · Comercial", status: "Ativa", cpm: 11.2, cpc: 3.6, ctr: 4.9, cpa: 245, roas: 2.8, gasto: 4210, conv: 4 },
    { plat: "Meta", nome: "Vídeo · Instalação frota", status: "Ativa", cpm: 19.6, cpc: 2.4, ctr: 4.1, cpa: 168, roas: 4.1, gasto: 2810, conv: 4 },
    { plat: "Meta", nome: "Carrossel · Modelos 11kW/22kW", status: "Ativa", cpm: 16.8, cpc: 2.1, ctr: 3.2, cpa: 142, roas: 3.8, gasto: 1620, conv: 3 },
  ],
};

const SITE = {
  solar: { sessoes: 18420, bounce: 42, mediaTempo: "2m 18s", conv: 1.6, principaisFontes: [
    { fonte: "Google Orgânico", pct: 38 },
    { fonte: "Google Ads", pct: 27 },
    { fonte: "Meta Ads", pct: 18 },
    { fonte: "Direto", pct: 12 },
    { fonte: "Indicação", pct: 5 },
  ]},
  carregadores: { sessoes: 6840, bounce: 48, mediaTempo: "1m 52s", conv: 1.1, principaisFontes: [
    { fonte: "Google Ads", pct: 34 },
    { fonte: "Google Orgânico", pct: 28 },
    { fonte: "Meta Ads", pct: 20 },
    { fonte: "Direto", pct: 14 },
    { fonte: "Indicação", pct: 4 },
  ]},
};

const fmt = (n: number) => n.toLocaleString("pt-BR");
const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const findGoal = (rows: MarketingGoalRow[] | undefined, k: string) => rows?.find((r) => r.key === k);

function TrafegoPage() {
  const { marketingUnit } = useMarketingUnit();
  const [plat, setPlat] = useState<"all" | "Google" | "Meta">("all");
  const campanhas = CAMPANHAS[marketingUnit].filter((c) => plat === "all" || c.plat === plat);
  const totalGasto = campanhas.reduce((a, c) => a + c.gasto, 0);
  const totalConv = campanhas.reduce((a, c) => a + c.conv, 0);
  const site = SITE[marketingUnit];

  const fetchGoals = useServerFn(listMarketingGoals);
  const gq = useQuery({ queryKey: ["marketing-goals"], queryFn: () => fetchGoals(), staleTime: 60_000 });
  const mql = findGoal(gq.data?.records, "mql_pago_mes");
  const novos = findGoal(gq.data?.records, "novos_pago_mes");

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Marketing · Julia</div>
            <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
              <Filter className="h-6 w-6 text-primary" /> Tráfego Pago
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Metas do mês, campanhas ativas e analytics do site.</p>
          </div>
          <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-sm">
            {(["all", "Google", "Meta"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPlat(p)}
                className={cn(
                  "px-3 py-1.5 rounded-md font-medium",
                  plat === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p === "all" ? "Todas" : p}
              </button>
            ))}
          </div>
        </div>

        {/* Metas em destaque */}
        <div className="grid md:grid-cols-2 gap-4">
          <BigGoal label={mql?.label ?? "MQL (Tráfego Pago)"} real={mql?.real_value ?? 0} meta={mql?.goal ?? 250} icon={TargetIcon} accent="oklch(0.6 0.18 240)" />
          <BigGoal label={novos?.label ?? "Novos (Tráfego Pago)"} real={novos?.real_value ?? 0} meta={novos?.goal ?? 30} icon={Users} accent="oklch(0.7 0.16 145)" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniKPI label="Campanhas" value={String(campanhas.length)} />
          <MiniKPI label="Gasto (30d)" value={fmtBRL(totalGasto)} />
          <MiniKPI label="Conversões" value={String(totalConv)} />
          <MiniKPI label="CPA médio" value={fmtBRL(totalConv > 0 ? totalGasto / totalConv : 0)} />
        </div>

        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-display font-semibold">Campanhas</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
                  <th className="text-left px-4 py-2.5">Plataforma</th>
                  <th className="text-left px-4 py-2.5">Campanha</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-right px-4 py-2.5">CPM</th>
                  <th className="text-right px-4 py-2.5">CPC</th>
                  <th className="text-right px-4 py-2.5">CTR</th>
                  <th className="text-right px-4 py-2.5">CPA</th>
                  <th className="text-right px-4 py-2.5">ROAS</th>
                  <th className="text-right px-4 py-2.5">Gasto</th>
                  <th className="text-right px-4 py-2.5">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => (
                  <tr key={c.nome} className="border-b border-border/40 hover:bg-surface-2/50">
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        {c.plat === "Meta" ? <Facebook className="h-3 w-3" /> : <Search className="h-3 w-3" />}
                        {c.plat}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{c.nome}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase",
                        c.status === "Ativa" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                      )}>{c.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtBRL(c.cpm)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtBRL(c.cpc)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.ctr}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtBRL(c.cpa)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{c.roas}x</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtBRL(c.gasto)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{c.conv}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="h-4 w-4 text-primary" />
            <h2 className="font-display font-semibold">Site (analytics)</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MiniKPI label="Sessões 30d" value={fmt(site.sessoes)} />
            <MiniKPI label="Bounce" value={`${site.bounce}%`} />
            <MiniKPI label="Tempo médio" value={site.mediaTempo} />
            <MiniKPI label="Conversão" value={`${site.conv}%`} />
          </div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Principais fontes</div>
          <div className="space-y-1.5">
            {site.principaisFontes.map((f) => (
              <div key={f.fonte}>
                <div className="flex justify-between text-sm">
                  <span>{f.fonte}</span>
                  <span className="tabular-nums text-muted-foreground">{f.pct}%</span>
                </div>
                <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden mt-1">
                  <div className="h-full bg-primary" style={{ width: `${f.pct}%` }} />
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

function MiniKPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-xl tabular-nums mt-1">{value}</div>
    </div>
  );
}

function BigGoal({ label, real, meta, icon: Icon, accent }: { label: string; real: number; meta: number; icon: typeof Users; accent: string }) {
  const pct = meta > 0 ? (real / meta) * 100 : 0;
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Mês</div>
          <div className="font-display font-semibold text-lg mt-0.5">{label}</div>
        </div>
        <Icon className="h-5 w-5" style={{ color: accent }} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
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
