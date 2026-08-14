import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AlertTriangle, TrendingDown, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { AtlasSoonCard } from "@/components/marketing/atlas-soon-card";

export const Route = createFileRoute("/_authenticated/marketing/gargalo")({
  head: () => ({ meta: [{ title: "Mapa de Gargalo — Marketing — Portal 2P" }] }),
  component: GargaloPage,
});

type Stage = "imp_click" | "click_lead" | "lead_opp" | "opp_cli";
type UnitRow = {
  id: string;
  label: string;
  color: string;
  // conversões (%) por etapa
  rates: Record<Stage, number>;
  // volumes absolutos por etapa (opcional, mostrado no tooltip)
  vol: { imp: number; click: number; lead: number; opp: number; cli: number };
};

const STAGES: { id: Stage; label: string; short: string }[] = [
  { id: "imp_click", label: "Impressão → Clique", short: "Impr.→clique" },
  { id: "click_lead", label: "Clique → Lead", short: "Clique→lead" },
  { id: "lead_opp", label: "Lead → Oportunidade", short: "Lead→oport." },
  { id: "opp_cli", label: "Oportunidade → Cliente", short: "Oport.→cliente" },
];

// Dados baseados na visão consolidada de marketing 2P.
// (Enquanto a integração completa de tráfego não pluga direto no SF, esse é o
// panorama fechado do trimestre — atualizamos manualmente até fechar a pipe.)
const UNITS: UnitRow[] = [
  {
    id: "solar",
    label: "2P Solar",
    color: "oklch(0.68 0.2 47)",
    rates: { imp_click: 1.9, click_lead: 8.0, lead_opp: 33, opp_cli: 26 },
    vol: { imp: 1_240_000, click: 23_560, lead: 1_885, opp: 622, cli: 162 },
  },
  {
    id: "carregadores",
    label: "Carregadores",
    color: "oklch(0.5 0.19 265)",
    rates: { imp_click: 2.2, click_lead: 7.5, lead_opp: 34, opp_cli: 18 },
    vol: { imp: 480_000, click: 10_560, lead: 792, opp: 269, cli: 48 },
  },
  {
    id: "station",
    label: "Station",
    color: "oklch(0.72 0.15 195)",
    rates: { imp_click: 1.9, click_lead: 8.8, lead_opp: 35, opp_cli: 17 },
    vol: { imp: 210_000, click: 3_990, lead: 351, opp: 123, cli: 21 },
  },
];

// Referências de mercado (usadas para calcular gap x benchmark)
const BENCHMARK: Record<Stage, number> = {
  imp_click: 2.5,
  click_lead: 9,
  lead_opp: 35,
  opp_cli: 25,
};

const fmt = (n: number) => n.toLocaleString("pt-BR");

function stageMinMax(stage: Stage) {
  const values = UNITS.map((u) => u.rates[stage]);
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** cor da célula a partir do valor (0..100) — escala azul do claro (baixa conv) ao escuro (alta) */
function cellShade(value: number, stageMin: number, stageMax: number) {
  const span = Math.max(0.0001, stageMax - stageMin);
  const t = Math.min(1, Math.max(0, (value - stageMin) / span));
  // do azul bem clarinho (0) ao azul escuro (1)
  const lightness = 0.96 - t * 0.55; // 0.96 → 0.41
  const chroma = 0.02 + t * 0.16;
  const bg = `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} 245)`;
  const text = lightness < 0.6 ? "white" : "oklch(0.25 0.05 265)";
  return { bg, text };
}

function GargaloPage() {
  const [hover, setHover] = useState<{ unit: string; stage: Stage } | null>(null);

  const stageStats = useMemo(() => {
    const map: Record<Stage, { min: number; max: number }> = {} as never;
    STAGES.forEach((s) => (map[s.id] = stageMinMax(s.id)));
    return map;
  }, []);

  // pior etapa (maior gap x benchmark) por unidade → "vazamento"
  const leaks = useMemo(() => {
    const out: Record<string, Stage> = {};
    UNITS.forEach((u) => {
      let worst: Stage = "imp_click";
      let worstGap = -Infinity;
      STAGES.forEach((s) => {
        const gap = (BENCHMARK[s.id] - u.rates[s.id]) / BENCHMARK[s.id];
        if (gap > worstGap) {
          worstGap = gap;
          worst = s.id;
        }
      });
      out[u.id] = worst;
    });
    return out;
  }, []);

  // top gargalo global (maior gap absoluto de receita potencial)
  const topLeak = useMemo(() => {
    let best: { unit: UnitRow; stage: Stage; gap: number } | null = null;
    UNITS.forEach((u) => {
      STAGES.forEach((s) => {
        const gap = (BENCHMARK[s.id] - u.rates[s.id]) / BENCHMARK[s.id];
        if (!best || gap > best.gap) best = { unit: u, stage: s.id, gap };
      });
    });
    return best!;
  }, []);

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Marketing</div>
          <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
            <TrendingDown className="h-6 w-6 text-primary" /> Mapa de gargalo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conversão por unidade × etapa do funil. Quanto mais escuro, melhor a conversão — as
            células mais claras são onde o funil vaza.
          </p>
        </div>

        {/* Alerta gargalo principal */}
        <div className="glass rounded-2xl p-4 flex items-start gap-3 border border-destructive/30">
          <div className="h-9 w-9 rounded-lg bg-destructive/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-wider text-destructive font-semibold">
              Gargalo prioritário
            </div>
            <div className="text-sm mt-0.5">
              <span className="font-semibold">{topLeak.unit.label}</span> — etapa{" "}
              <span className="font-semibold">
                {STAGES.find((s) => s.id === topLeak.stage)!.label}
              </span>{" "}
              está{" "}
              <span className="font-semibold text-destructive">
                {(topLeak.gap * 100).toFixed(0)}% abaixo
              </span>{" "}
              do benchmark de mercado ({BENCHMARK[topLeak.stage]}%). Corrigir aqui destrava o maior
              volume de receita adicional no trimestre.
            </div>
          </div>
        </div>

        {/* Mapa de calor */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
            <div>
              <h2 className="font-display font-semibold text-lg">
                Mapa de gargalo — conversão por unidade × etapa
              </h2>
              <p className="text-xs text-muted-foreground">
                quanto mais escuro, melhor a conversão · a célula mais clara é onde vaza
              </p>
            </div>
          </div>

          {/* Grid */}
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              {/* Header */}
              <div className="grid grid-cols-[140px_repeat(4,minmax(0,1fr))] gap-2 mb-2">
                <div />
                {STAGES.map((s) => (
                  <div
                    key={s.id}
                    className="text-[11px] uppercase tracking-wider text-muted-foreground text-center"
                  >
                    {s.short}
                  </div>
                ))}
              </div>

              {/* Linhas por unidade */}
              <div className="space-y-2">
                {UNITS.map((u) => (
                  <div
                    key={u.id}
                    className="grid grid-cols-[140px_repeat(4,minmax(0,1fr))] gap-2 items-stretch"
                  >
                    <div className="flex items-center gap-2 pl-1">
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ background: u.color }}
                      />
                      <span className="font-medium text-sm">{u.label}</span>
                    </div>
                    {STAGES.map((s) => {
                      const val = u.rates[s.id];
                      const { min, max } = stageStats[s.id];
                      const { bg, text } = cellShade(val, min, max);
                      const isLeak = leaks[u.id] === s.id;
                      const isHover = hover?.unit === u.id && hover?.stage === s.id;
                      return (
                        <div
                          key={s.id}
                          className={cn(
                            "relative h-16 rounded-lg flex items-center justify-center font-display font-bold text-lg tabular-nums transition-transform",
                            isLeak
                              ? "ring-2 ring-destructive ring-offset-2 ring-offset-background"
                              : "",
                            isHover ? "scale-[1.02] shadow-lg" : "",
                          )}
                          style={{ background: bg, color: text }}
                          onMouseEnter={() => setHover({ unit: u.id, stage: s.id })}
                          onMouseLeave={() => setHover(null)}
                        >
                          {val}%
                          {isLeak && (
                            <span className="absolute top-1 right-1.5 text-[9px] uppercase tracking-wider font-bold text-destructive bg-white/95 rounded px-1 py-[1px] leading-none">
                              vaza
                            </span>
                          )}
                          {isHover && (
                            <div className="absolute z-20 top-full mt-2 left-1/2 -translate-x-1/2 min-w-[220px] bg-surface border border-border rounded-lg p-3 shadow-xl text-left">
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                {u.label} · {STAGES.find((x) => x.id === s.id)!.label}
                              </div>
                              <div className="mt-1 flex items-baseline gap-2">
                                <span className="text-xl font-bold" style={{ color: u.color }}>
                                  {val}%
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  benchmark {BENCHMARK[s.id]}%
                                </span>
                              </div>
                              <StageDetail unit={u} stage={s.id} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Legenda */}
              <div className="mt-5 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>menor conversão</span>
                <div className="flex gap-[3px]">
                  {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                    const l = 0.96 - t * 0.55;
                    const c = 0.02 + t * 0.16;
                    return (
                      <span
                        key={t}
                        className="h-5 w-8 rounded-sm border border-border/60"
                        style={{ background: `oklch(${l} ${c} 245)` }}
                      />
                    );
                  })}
                </div>
                <span>maior conversão</span>
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm ring-2 ring-destructive" />
                  vazamento por unidade
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Resumo por unidade */}
        <div className="grid md:grid-cols-3 gap-4">
          {UNITS.map((u) => {
            const leak = leaks[u.id];
            const stage = STAGES.find((s) => s.id === leak)!;
            const gap = (BENCHMARK[leak] - u.rates[leak]) / BENCHMARK[leak];
            return (
              <div key={u.id} className="glass rounded-2xl p-5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: u.color }} />
                  <div className="font-display font-semibold">{u.label}</div>
                </div>
                <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Volume atual do funil
                </div>
                <div className="mt-1 text-sm tabular-nums flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>{fmt(u.vol.imp)} impr.</span>
                  <span className="text-muted-foreground">→</span>
                  <span>{fmt(u.vol.click)} cliques</span>
                  <span className="text-muted-foreground">→</span>
                  <span>{fmt(u.vol.lead)} leads</span>
                  <span className="text-muted-foreground">→</span>
                  <span>{fmt(u.vol.opp)} oport.</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-semibold">{fmt(u.vol.cli)} clientes</span>
                </div>
                <div className="mt-4 rounded-lg bg-destructive/10 border border-destructive/25 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-destructive font-semibold">
                    Onde vaza
                  </div>
                  <div className="text-sm mt-0.5">
                    {stage.label} —{" "}
                    <span className="font-semibold">{u.rates[leak]}%</span>{" "}
                    <span className="text-muted-foreground">
                      ({(gap * 100).toFixed(0)}% abaixo do benchmark)
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="glass rounded-xl px-4 py-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Benchmarks: Impr.→clique 2,5% · Clique→lead 9% · Lead→oport. 35% · Oport.→cliente 25%.
            Volumes consolidados do trimestre corrente. Atualização automática entrará junto com o
            pipe de tráfego pago no Atlas.
          </span>
        </div>

        <AtlasSoonCard />
      </div>
    </AppLayout>
  );
}

function StageDetail({ unit, stage }: { unit: UnitRow; stage: Stage }) {
  const map: Record<Stage, [number, number, string]> = {
    imp_click: [unit.vol.imp, unit.vol.click, "impr. → cliques"],
    click_lead: [unit.vol.click, unit.vol.lead, "cliques → leads"],
    lead_opp: [unit.vol.lead, unit.vol.opp, "leads → oport."],
    opp_cli: [unit.vol.opp, unit.vol.cli, "oport. → clientes"],
  };
  const [from, to, label] = map[stage];
  return (
    <div className="mt-2 text-[11px] text-muted-foreground tabular-nums">
      {fmt(from)} → {fmt(to)} <span className="opacity-70">({label})</span>
    </div>
  );
}
