import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { clients, type Client, type Segment } from "@/lib/mock-data";
import { useGlobalSearch } from "@/lib/search-store";
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Sparkles, TrendingUp, TrendingDown, Minus, Eye, Trophy, Medal, Award, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/clientes/segmentacao")({
  head: () => ({ meta: [{ title: "Segmentação — Portal 2P" }] }),
  component: SegmentacaoPage,
});

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type SortKey = "rank" | "name" | "segment" | "projection" | "generation" | "sales" | "health";
type SortDir = "asc" | "desc";

function SegmentacaoPage() {
  const [period, setPeriod] = useState<"mensal" | "trimestral">("mensal");
  const [filterSeg, setFilterSeg] = useState<Segment | "all">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailClient, setDetailClient] = useState<Client | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const search = useGlobalSearch().trim().toLowerCase();

  const ranked = useMemo(
    () => [...clients].sort((a, b) => b.sales - a.sales).map((c, i) => ({ ...c, rank: i + 1 })),
    [],
  );

  const filtered = ranked.filter((c) => {
    if (filterSeg !== "all" && c.segment !== filterSeg) return false;
    if (search && !c.name.toLowerCase().includes(search)) return false;
    return true;
  });

  const visible = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = a[sortKey] as string | number;
      const bv = b[sortKey] as string | number;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = visible.reduce(
    (acc, c) => ({ projection: acc.projection + c.projection, generation: acc.generation + c.generation, sales: acc.sales + c.sales }),
    { projection: 0, generation: 0, sales: 0 },
  );

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "name" || k === "segment" ? "asc" : "desc"); }
  };

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const segments: { key: Segment | "all"; label: string }[] = [
    { key: "all", label: "Todos" }, { key: "A", label: "A" }, { key: "B", label: "B" }, { key: "C", label: "C" }, { key: "D", label: "D" },
  ];

  return (
    <AppLayout>
      <div className="max-w-[1600px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Clientes</div>
            <h1 className="text-3xl font-bold mt-1">Segmentação</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-surface rounded-lg p-1 border border-border">
              {(["mensal", "trimestral"] as const).map((p) => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={cn("px-3 py-1.5 rounded-md text-sm capitalize",
                    period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{p}</button>
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
            <button key={s.key} onClick={() => setFilterSeg(s.key)}
              className={cn("px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                filterSeg === s.key ? "bg-primary text-primary-foreground border-primary" : "bg-surface border-border text-muted-foreground hover:text-foreground")}>
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
            <h2 className="font-display font-semibold">Segmentação | Visão {period === "mensal" ? "Mensal" : "Trimestral"}</h2>
            <span className="text-xs text-muted-foreground">{visible.length} clientes</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50 select-none">
                  <th className="w-10"></th>
                  <SortableTh label="Rank" k="rank" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="center" className="w-16" />
                  <SortableTh label="Cliente" k="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                  <SortableTh label="Seg" k="segment" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="center" />
                  <SortableTh label="Projeção" k="projection" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortableTh label="Geração R$" k="generation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortableTh label="Vendas R$" k="sales" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                  <th className="text-center px-4 py-2.5">Tendência</th>
                  <SortableTh label="Saúde" k="health" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="center" />
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const isOpen = expanded.has(c.id);
                  const generationPct = (c.generation / c.projection) * 100;
                  return (
                    <Fragment key={c.id}>
                      <tr onClick={() => toggle(c.id)} className="border-b border-border/40 hover:bg-surface-2/50 cursor-pointer">
                        <td className="px-2">
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                        </td>
                        <td className="px-2 py-3 text-center"><RankBadge rank={c.rank} /></td>
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
                              <div className={cn("h-full", c.health > 70 ? "bg-success" : c.health > 40 ? "bg-warning" : "bg-destructive")} style={{ width: `${c.health}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-6">{c.health}</span>
                          </div>
                        </td>
                        <td className="px-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setDetailClient(c); }}
                            className="p-1.5 rounded hover:bg-primary/15 text-muted-foreground hover:text-primary"
                            title="Ver detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${c.id}-d`} className="bg-surface-2/30 border-b border-border/40">
                          <td colSpan={10} className="px-6 py-5">
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
                  <td colSpan={2}></td>
                  <td className="px-4 py-3">Total ({visible.length})</td>
                  <td></td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.projection)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-success">{fmt(totals.generation)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-primary">{fmt(totals.sales)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {detailClient && <ClientDetailModal client={detailClient} onClose={() => setDetailClient(null)} />}
    </AppLayout>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return (
    <span className="inline-flex items-center justify-center gap-1 h-8 w-12 rounded-lg font-display font-bold text-sm bg-gradient-to-br from-[oklch(0.85_0.16_85)] to-[oklch(0.72_0.18_75)] text-white shadow-md">
      <Trophy className="h-3.5 w-3.5" />1
    </span>
  );
  if (rank === 2) return (
    <span className="inline-flex items-center justify-center gap-1 h-8 w-12 rounded-lg font-display font-bold text-sm bg-gradient-to-br from-[oklch(0.82_0.02_250)] to-[oklch(0.65_0.02_250)] text-white shadow">
      <Medal className="h-3.5 w-3.5" />2
    </span>
  );
  if (rank === 3) return (
    <span className="inline-flex items-center justify-center gap-1 h-8 w-12 rounded-lg font-display font-bold text-sm bg-gradient-to-br from-[oklch(0.65_0.12_50)] to-[oklch(0.5_0.13_45)] text-white shadow">
      <Award className="h-3.5 w-3.5" />3
    </span>
  );
  if (rank <= 10) return (
    <span className="inline-flex h-7 w-9 items-center justify-center rounded-md font-display font-bold text-xs bg-primary/15 text-primary border border-primary/30">
      {rank}
    </span>
  );
  return <span className="text-xs text-muted-foreground tabular-nums">#{rank}</span>;
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

function ClientDetailModal({ client, onClose }: { client: Client & { rank?: number }; onClose: () => void }) {
  const conversion = ((client.sales / client.projection) * 100).toFixed(0);
  const generationPct = ((client.generation / client.projection) * 100).toFixed(0);
  return (
    <>
      <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl pointer-events-auto overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-3 bg-gradient-to-r from-primary/10 to-transparent">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {client.rank && <RankBadge rank={client.rank} />}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-bold">Seg {client.segment}</span>
              </div>
              <h2 className="font-display font-bold text-xl truncate">{client.name}</h2>
              <div className="text-xs text-muted-foreground mt-0.5">Última interação há {client.lastInteraction}</div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-surface-2 rounded-lg shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Detail label="Projeção" value={fmt(client.projection)} />
              <Detail label="Geração" value={fmt(client.generation)} sub={`${generationPct}%`} />
              <Detail label="Vendas" value={fmt(client.sales)} sub={`${conversion}%`} />
              <Detail label="Saúde" value={`${client.health}/100`} />
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Saúde da relação</div>
              <div className="h-3 rounded-full bg-surface-2 overflow-hidden">
                <div className={cn("h-full", client.health > 70 ? "bg-success" : client.health > 40 ? "bg-warning" : "bg-destructive")} style={{ width: `${client.health}%` }} />
              </div>
            </div>

            <div className="rounded-xl bg-primary/8 border border-primary/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs uppercase tracking-wider font-semibold text-primary">Atlas — Plano sugerido</span>
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed">
                {client.health > 70
                  ? `${client.name} está em excelente forma. Apresente a linha premium e proponha um plano trimestral de recompras.`
                  : client.health > 40
                  ? `Cliente desacelerando. Recomendo um follow-up estruturado nos próximos 7 dias e revisar cotações pendentes.`
                  : `Cliente em risco crítico. Agendar ligação imediata com gestor e oferecer condição comercial diferenciada para retomada.`}
              </p>
            </div>

            <div className="rounded-xl bg-surface-2 border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Observações (Salesforce)</span>
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
                {client.notes ?? "Sem observações registradas no Salesforce para este cliente."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SortableTh({ label, k, sortKey, sortDir, onSort, align, className }: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align: "left" | "right" | "center";
  className?: string;
}) {
  const active = sortKey === k;
  const alignCls = align === "right" ? "text-right justify-end" : align === "center" ? "text-center justify-center" : "text-left justify-start";
  return (
    <th className={cn("px-4 py-2.5", className)}>
      <button
        onClick={() => onSort(k)}
        className={cn("inline-flex items-center gap-1 w-full hover:text-foreground transition-colors", alignCls, active && "text-primary")}
      >
        {label}
        {active ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-50" />}
      </button>
    </th>
  );
}
