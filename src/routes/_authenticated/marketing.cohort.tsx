import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useMarketingUnit } from "@/components/instance-provider";
import { LineChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { AtlasSoonCard } from "@/components/marketing/atlas-soon-card";

export const Route = createFileRoute("/_authenticated/marketing/cohort")({
  head: () => ({ meta: [{ title: "Análise Cohort — Marketing — Portal 2P" }] }),
  component: CohortPage,
});

// Cohort simplificado: para cada safra (mês de entrada do lead), quantos leads,
// e quantos compraram em M0, M1, M2, M3+, e quantos ainda não compraram.
const COHORTS = {
  solar: [
    { safra: "Jan/26", leads: 320, m0: 8, m1: 22, m2: 14, m3plus: 18, semCompra: 258 },
    { safra: "Fev/26", leads: 380, m0: 12, m1: 28, m2: 20, m3plus: 12, semCompra: 308 },
    { safra: "Mar/26", leads: 410, m0: 14, m1: 34, m2: 22, m3plus: 8, semCompra: 332 },
    { safra: "Abr/26", leads: 458, m0: 18, m1: 42, m2: 24, m3plus: 0, semCompra: 374 },
    { safra: "Mai/26", leads: 512, m0: 22, m1: 48, m2: 0, m3plus: 0, semCompra: 442 },
    { safra: "Jun/26", leads: 588, m0: 28, m1: 0, m2: 0, m3plus: 0, semCompra: 560 },
    { safra: "Jul/26", leads: 642, m0: 0, m1: 0, m2: 0, m3plus: 0, semCompra: 642 },
  ],
  carregadores: [
    { safra: "Jan/26", leads: 120, m0: 2, m1: 8, m2: 6, m3plus: 8, semCompra: 96 },
    { safra: "Fev/26", leads: 148, m0: 4, m1: 10, m2: 8, m3plus: 4, semCompra: 122 },
    { safra: "Mar/26", leads: 162, m0: 4, m1: 12, m2: 8, m3plus: 2, semCompra: 136 },
    { safra: "Abr/26", leads: 180, m0: 6, m1: 14, m2: 6, m3plus: 0, semCompra: 154 },
    { safra: "Mai/26", leads: 210, m0: 8, m1: 16, m2: 0, m3plus: 0, semCompra: 186 },
    { safra: "Jun/26", leads: 240, m0: 10, m1: 0, m2: 0, m3plus: 0, semCompra: 230 },
    { safra: "Jul/26", leads: 268, m0: 0, m1: 0, m2: 0, m3plus: 0, semCompra: 268 },
  ],
  station: [
    { safra: "Jan/26", leads: 30, m0: 1, m1: 2, m2: 1, m3plus: 2, semCompra: 24 },
    { safra: "Fev/26", leads: 42, m0: 1, m1: 3, m2: 2, m3plus: 1, semCompra: 35 },
    { safra: "Mar/26", leads: 48, m0: 2, m1: 3, m2: 2, m3plus: 1, semCompra: 40 },
    { safra: "Abr/26", leads: 55, m0: 2, m1: 4, m2: 2, m3plus: 0, semCompra: 47 },
    { safra: "Mai/26", leads: 62, m0: 2, m1: 5, m2: 0, m3plus: 0, semCompra: 55 },
    { safra: "Jun/26", leads: 72, m0: 3, m1: 0, m2: 0, m3plus: 0, semCompra: 69 },
    { safra: "Jul/26", leads: 80, m0: 0, m1: 0, m2: 0, m3plus: 0, semCompra: 80 },
  ],
};

const UNIT_LABEL = { solar: "2P Solar", carregadores: "2P Carregadores", station: "2P Station" } as const;


function CohortPage() {
  const { marketingUnit } = useMarketingUnit();
  const rows = COHORTS[marketingUnit];
  const totalLeads = rows.reduce((a, r) => a + r.leads, 0);
  const totalCompraram = rows.reduce((a, r) => a + r.m0 + r.m1 + r.m2 + r.m3plus, 0);
  const totalSemCompra = totalLeads - totalCompraram;
  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Marketing · {UNIT_LABEL[marketingUnit]}</div>
          <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
            <LineChart className="h-6 w-6 text-primary" /> Análise Cohort
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Por safra de entrada do lead — quem já comprou e quem ainda não comprou.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniKPI label="Leads (7 safras)" value={totalLeads.toLocaleString("pt-BR")} />
          <MiniKPI label="Compraram" value={totalCompraram.toLocaleString("pt-BR")} accent="text-success" />
          <MiniKPI label="Sem compra" value={totalSemCompra.toLocaleString("pt-BR")} accent="text-destructive" />
          <MiniKPI label="Conversão total" value={`${((totalCompraram / totalLeads) * 100).toFixed(1)}%`} />
        </div>

        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
                  <th className="text-left px-4 py-2.5">Safra</th>
                  <th className="text-right px-4 py-2.5">Leads</th>
                  <th className="text-right px-4 py-2.5">M0</th>
                  <th className="text-right px-4 py-2.5">M1</th>
                  <th className="text-right px-4 py-2.5">M2</th>
                  <th className="text-right px-4 py-2.5">M3+</th>
                  <th className="text-right px-4 py-2.5">Conversão</th>
                  <th className="text-right px-4 py-2.5">Sem compra</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const compraram = r.m0 + r.m1 + r.m2 + r.m3plus;
                  const conv = r.leads > 0 ? (compraram / r.leads) * 100 : 0;
                  return (
                    <tr key={r.safra} className="border-b border-border/40 hover:bg-surface-2/50">
                      <td className="px-4 py-2.5 font-medium">{r.safra}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.leads}</td>
                      <HeatCell v={r.m0} max={30} />
                      <HeatCell v={r.m1} max={50} />
                      <HeatCell v={r.m2} max={30} />
                      <HeatCell v={r.m3plus} max={20} />
                      <td className={cn("px-4 py-2.5 text-right tabular-nums font-semibold",
                        conv >= 10 ? "text-success" : conv >= 5 ? "text-warning" : "text-destructive")}>
                        {conv.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{r.semCompra}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <AtlasSoonCard />
      </div>
    </AppLayout>
  );
}

function HeatCell({ v, max }: { v: number; max: number }) {
  const intensity = max > 0 ? Math.min(1, v / max) : 0;
  return (
    <td className="px-4 py-2.5 text-right tabular-nums">
      <span
        className="inline-block px-2 py-0.5 rounded"
        style={{
          background: intensity > 0 ? `oklch(0.68 0.2 47 / ${0.1 + intensity * 0.5})` : "transparent",
          color: intensity > 0.4 ? "oklch(0.25 0.1 47)" : undefined,
        }}
      >
        {v || "—"}
      </span>
    </td>
  );
}

function MiniKPI({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-display font-bold text-xl tabular-nums mt-1", accent)}>{value}</div>
    </div>
  );
}
