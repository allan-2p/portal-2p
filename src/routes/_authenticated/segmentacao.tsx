import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { clients, type Segment } from "@/lib/mock-data";
import { Fragment, useState } from "react";
import { ChevronDown, Sparkles, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_authenticated/segmentacao")({
  head: () => ({
    meta: [
      { title: "Segmentação — Portal 2P" },
      { name: "description", content: "Carteira segmentada por A, B, C, D com detalhamento por cliente." },
    ],
  }),
  component: SegmentacaoPage,
});

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function SegmentacaoPage() {
  const [period, setPeriod] = useState<"mensal" | "trimestral">("mensal");
  const [filterSeg, setFilterSeg] = useState<Segment | "all">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const visible = clients.filter((c) => filterSeg === "all" || c.segment === filterSeg);
  const totals = visible.reduce(
    (acc, c) => ({
      projection: acc.projection + c.projection,
      generation: acc.generation + c.generation,
      sales: acc.sales + c.sales,
    }),
    { projection: 0, generation: 0, sales: 0 },
  );

  const segments: { key: Segment | "all"; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "A", label: "A" },
    { key: "B", label: "B" },
    { key: "C", label: "C" },
    { key: "D", label: "D" },
  ];

  return (
    <AppLayout>
      <div className="max-w-[1600px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Carteira</div>
            <h1 className="text-3xl font-bold mt-1">Segmentação</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-surface rounded-lg p-1 border border-border">
              {(["mensal", "trimestral"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn("px-3 py-1.5 rounded-md text-sm capitalize",
                    period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                >{p}</button>
              ))}
            </div>
            <div className="flex items-center gap-3 px-4 py-2 rounded-lg glass">
              <Legend color="bg-destructive" label="Até 70%" />
              <Legend color="bg-warning" label="70% a 99%" />
              <Legend color="bg-success" label="100% +" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground mr-2">Segmento:</span>
          {segments.map((s) => (
            <button
              key={s.key}
              onClick={() => setFilterSeg(s.key)}
              className={cn("px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                filterSeg === s.key ? "bg-primary text-primary-foreground border-primary" : "bg-surface border-border text-muted-foreground hover:text-foreground")}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="glass rounded-2xl p-4 flex items-start gap-3 border-primary/30">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-[oklch(0.7_0.18_280)] flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="text-sm">
            <span className="font-semibold">Atlas: </span>
            <span className="text-muted-foreground">
              {visible.filter((c) => c.health < 40).length} clientes desta visão estão abaixo de 40% de saúde. Foque em A primeiro — 1 cliente A vale 4 clientes B em receita média.
            </span>
          </div>
        </div>

        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-display font-semibold">Carteira | Visão {period === "mensal" ? "Mensal" : "Trimestral"}</h2>
            <span className="text-xs text-muted-foreground">{visible.length} clientes</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
                  <th className="w-10"></th>
                  <th className="text-left px-4 py-2.5">Cliente</th>
                  <th className="text-center px-2 py-2.5">Seg</th>
                  <th className="text-right px-4 py-2.5">Projeção {period === "mensal" ? "| Mensal" : "| Trim."}</th>
                  <th className="text-right px-4 py-2.5">Geração R$</th>
                  <th className="text-right px-4 py-2.5">Vendas R$</th>
                  <th className="text-center px-4 py-2.5">Tendência</th>
                  <th className="text-center px-4 py-2.5">Saúde</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const isOpen = expanded.has(c.id);
                  const generationPct = (c.generation / c.projection) * 100;
                  return (
                    <Fragment key={c.id}>
                      <tr
                        onClick={() => toggle(c.id)}
                        className="border-b border-border/40 hover:bg-surface-2/50 cursor-pointer"
                      >

                        <td className="px-2">
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                        </td>
                        <td className="px-4 py-3 font-medium">{c.name}</td>
                        <td className="px-2 py-3 text-center">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded font-display font-bold text-xs bg-primary/15 text-primary">{c.segment}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(c.projection)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{c.generation > 0 ? fmt(c.generation) : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{c.sales > 0 ? fmt(c.sales) : "—"}</td>
                        <td className="px-4 py-3 text-center">
                          {c.trend === "up" && <TrendingUp className="h-4 w-4 text-success mx-auto" />}
                          {c.trend === "down" && <TrendingDown className="h-4 w-4 text-destructive mx-auto" />}
                          {c.trend === "stable" && <Minus className="h-4 w-4 text-muted-foreground mx-auto" />}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-center">
                            <div className="w-20 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                              <div className={cn("h-full",
                                c.health > 70 ? "bg-success" : c.health > 40 ? "bg-warning" : "bg-destructive")}
                                style={{ width: `${c.health}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-6">{c.health}</span>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${c.id}-d`} className="bg-surface-2/30 border-b border-border/40">
                          <td colSpan={8} className="px-6 py-5">
                            <div className="grid md:grid-cols-4 gap-4">
                              <Detail label="Projeção de Vendas" value={fmt(c.projection)} />
                              <Detail label="Geração R$" value={fmt(c.generation)} sub={`${generationPct.toFixed(0)}% da projeção`} />
                              <Detail label="Vendas R$" value={fmt(c.sales)} sub={`${((c.sales / c.projection) * 100).toFixed(0)}% da projeção`} />
                              <Detail label="Última interação" value={c.lastInteraction} sub={`Saúde ${c.health}/100`} />
                            </div>
                            <div className="mt-4 p-3 rounded-lg bg-background/60 border border-border flex items-start gap-2">
                              <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                              <div className="text-xs text-muted-foreground leading-relaxed">
                                <span className="text-foreground font-medium">Atlas sugere: </span>
                                {c.health > 70
                                  ? `${c.name} está bem. Bom momento para apresentar linha premium ou upsell de acessórios.`
                                  : c.health > 40
                                  ? `Ritmo abaixo do esperado. Faça follow-up esta semana e revise últimas cotações pendentes.`
                                  : `Cliente em risco. Agende ligação imediata para entender bloqueios e ofereça condição especial.`}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                <tr className="bg-surface-2 font-display font-bold border-t-2 border-primary/40">
                  <td></td>
                  <td className="px-4 py-3">Total ({visible.length})</td>
                  <td></td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.projection)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-success">{fmt(totals.generation)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-primary">{fmt(totals.sales)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Detail({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-lg mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
