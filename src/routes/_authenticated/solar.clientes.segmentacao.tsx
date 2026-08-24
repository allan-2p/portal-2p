import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { type Client, type Segment } from "@/lib/mock-data";
import {
  VendedorNamesFilter,
  parseVendedores,
  matchVendedor,
} from "@/components/vendedor-names-filter";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Eye,
  Trophy,
  Medal,
  Award,
  X,
  FileText,
  Loader2,
  AlertTriangle,
  Search,
  Package,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSegmentacaoFn } from "@/lib/segmentacao.functions";


export const Route = createFileRoute("/_authenticated/solar/clientes/segmentacao")({
  head: () => ({ meta: [{ title: "Perfil de Cliente — Portal 2P" }] }),
  component: SegmentacaoPage,
});

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type SortKey = "rank" | "name" | "segment" | "projection" | "generation" | "sales";
type SortDir = "asc" | "desc";

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function fmtKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Trimestre anterior — mesma base que a tabela "Projeção - Tri Atual".
function previousQuarterRange(): { start: string; end: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3) + 1;
  let qq = q - 1;
  let yy = y;
  if (qq < 1) {
    qq = 4;
    yy = y - 1;
  }
  const start = new Date(yy, (qq - 1) * 3, 1);
  const end = new Date(yy, qq * 3, 0);
  return { start: fmtKey(start), end: fmtKey(end), label: `Q${qq}/${yy}` };
}

// Segmentação por vendas do trimestre anterior — regra da Projeção - Tri Atual
function classifyAccount(prevSales: number): Segment {
  if (prevSales <= 0) return "D";
  if (prevSales < 15000) return "C";
  if (prevSales <= 30000) return "B";
  return "A";
}

const STATUS_COLOR: Record<string, string> = {
  "Aguardando Pagamento": "bg-emerald-500 text-white border-transparent",
  Processando: "bg-yellow-400 text-neutral-900 border-transparent",
  Separação: "bg-sky-400 text-white border-transparent",
  Faturado: "bg-black text-white border-transparent",
  Coletado: "bg-green-500 text-white border-transparent",
};

const STATUS_DOT: Record<string, string> = {
  "Aguardando Pagamento": "bg-emerald-500",
  Processando: "bg-yellow-400",
  Separação: "bg-sky-400",
  Faturado: "bg-neutral-900",
  Coletado: "bg-green-500",
};

const SEG_BADGE: Record<Segment, string> = {
  A: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  B: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  C: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  D: "bg-muted text-muted-foreground border-border",
};

const SEG_CHIP_ACTIVE: Record<Segment, string> = {
  A: "bg-emerald-500 text-white border-emerald-500",
  B: "bg-sky-500 text-white border-sky-500",
  C: "bg-amber-500 text-white border-amber-500",
  D: "bg-foreground text-background border-foreground",
};

function SegBadge({ seg }: { seg: Segment }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold border",
        SEG_BADGE[seg],
      )}
    >
      {seg}
    </span>
  );
}

function SegmentacaoPage() {
  const navigate = useNavigate();
  const [selectedSegs, setSelectedSegs] = useState<Set<Segment>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailClient, setDetailClient] = useState<Client | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [vendedor, setVendedor] = useState<string>("__all__");
  const [periodo, setPeriodo] = useState<"mes" | "tri">("mes");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const baseRange = useMemo(previousQuarterRange, []);

  const fetchSeg = useServerFn(getSegmentacaoFn);
  const segQ = useQuery({
    queryKey: ["segmentacao", "solar", periodo],
    queryFn: () => fetchSeg({ data: { instancia: "solar" as const, periodo } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const loading = segQ.isLoading;
  const anyError = segQ.error;
  const baseLabel = segQ.data?.baseLabel ?? baseRange.label;

  type Linha = Client & {
    consultor: string | null;
    prevSales: number;
    pedidos: { id: string; name: string | null; status: string | null; total: number; closeDate: string | null }[];
  };

  const clients: Linha[] = useMemo(() => {
    return (segQ.data?.rows ?? []).map((r) => {
      const denom = r.projecao > 0 ? r.projecao : 1;
      const health = r.projecao > 0 ? Math.max(0, Math.min(100, Math.round((r.vendas / denom) * 100))) : 0;
      return {
        id: r.id,
        name: r.nome,
        segment: r.segmento as Segment,
        projection: r.projecao,
        generation: r.geracao,
        sales: r.vendas,
        trend: "stable",
        lastInteraction: "—",
        health,
        notes: r.observacoes ?? undefined,
        consultor: r.consultor,
        prevSales: r.vendasTriAnterior,
        pedidos: r.pedidos,
      } as Linha;
    });
  }, [segQ.data]);

  const vendedores = segQ.data?.consultores ?? [];

  const scoped = useMemo(() => {
    const sel = parseVendedores(vendedor);
    if (sel.length === 0) return clients;
    return clients.filter((c) => matchVendedor(sel, c.consultor ?? ""));
  }, [clients, vendedor]);

  const ordersByAccount = useMemo(() => {
    const map = new Map<string, Linha["pedidos"]>();
    for (const c of clients) map.set(c.id, c.pedidos);
    return map;
  }, [clients]);

  const prevSalesByAccount = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of clients) map.set(c.id, c.prevSales);
    return map;
  }, [clients]);

  const ranked = useMemo(
    () =>
      [...scoped]
        .sort((a, b) => (prevSalesByAccount.get(b.id) ?? 0) - (prevSalesByAccount.get(a.id) ?? 0))
        .map((c, i) => ({ ...c, rank: i + 1 })),
    [scoped, prevSalesByAccount],
  );

  const s = search.trim().toLowerCase();
  const filtered = ranked.filter((c) => {
    if (selectedSegs.size > 0 && !selectedSegs.has(c.segment)) return false;
    if (s && !c.name.toLowerCase().includes(s)) return false;
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

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = visible.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, selectedSegs, vendedor, periodo, pageSize, sortKey, sortDir]);

  const totals = visible.reduce(
    (acc, c) => ({
      projection: acc.projection + c.projection,
      generation: acc.generation + c.generation,
      sales: acc.sales + c.sales,
    }),
    { projection: 0, generation: 0, sales: 0 },
  );

  // Contagens por segmento (respeitando filtro de vendedor)
  const segCounts = useMemo(() => {
    const c: Record<Segment, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const r of scoped) c[r.segment] += 1;
    return c;
  }, [scoped]);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" || k === "segment" ? "asc" : "desc");
    }
  };

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const allSegs: Segment[] = ["A", "B", "C", "D"];
  const allSelected = selectedSegs.size === 0;
  const toggleSeg = (seg: Segment) => {
    setSelectedSegs((prev) => {
      const n = new Set(prev);
      if (n.has(seg)) n.delete(seg);
      else n.add(seg);
      return n;
    });
  };

  return (
    <AppLayout>
      <div className="max-w-[1600px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Clientes</div>
            <h1 className="text-3xl font-bold mt-1">Perfil de Cliente</h1>
            <div className="text-xs text-muted-foreground mt-1">
              Base: Projeção - Tri Atual · Trimestre {baseLabel}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente…"
                className="pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-sm w-56 focus:outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Vendedor</label>
              <VendedorNamesFilter
                value={vendedor}
                onChange={setVendedor}
                options={vendedores}
                allLabel="Todos"
              />

            </div>

          </div>
        </div>

        {/* Contagens por segmento + regras/explicação */}
        <div className="glass rounded-2xl p-4 flex flex-wrap items-start gap-6 text-sm">
          <div className="flex items-center gap-3">
            {allSegs.map((seg) => (
              <div key={seg} className="flex items-center gap-1.5">
                <SegBadge seg={seg} />
                <span className="text-xs text-muted-foreground tabular-nums">{segCounts[seg]}</span>
              </div>
            ))}
          </div>
          <div className="h-10 w-px bg-border hidden md:block" />
          <div className="flex-1 min-w-[280px] text-[11px] text-muted-foreground leading-relaxed flex gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              <div>
                <b className="text-foreground">Segmentação</b> pelas vendas do trimestre anterior ({baseLabel}):
                {" "}<b className="text-foreground">A</b> &gt; R$ 30k ·
                {" "}<b className="text-foreground">B</b> R$ 15k–30k ·
                {" "}<b className="text-foreground">C</b> &lt; R$ 15k ·
                {" "}<b className="text-foreground">D</b> sem histórico.
              </div>
              <div className="mt-1">
                <b className="text-foreground">Projeção</b> = vendas do trimestre anterior ÷ 3. Geração projetada usa a
                conversão real de cada cliente (fechados/gerados no trimestre anterior), com fallback na conversão global.
              </div>
              <div className="mt-1">
                <b className="text-foreground">Geração</b> e <b className="text-foreground">Vendas</b> exibidas vêm das
                oportunidades registradas no banco do Grupo 2P (Gerado e Vendido do período).
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground mr-2">Segmento:</span>
          <button
            onClick={() => setSelectedSegs(new Set())}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
              allSelected
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-surface border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Todos
          </button>
          {allSegs.map((seg) => {
            const active = selectedSegs.has(seg);
            return (
              <button
                key={seg}
                onClick={() => toggleSeg(seg)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors inline-flex items-center gap-2",
                  active
                    ? SEG_CHIP_ACTIVE[seg]
                    : "bg-surface border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {seg}
                <span className={cn("text-[10px] tabular-nums", active ? "opacity-90" : "opacity-70")}>
                  {segCounts[seg]}
                </span>
              </button>
            );
          })}
          {!allSelected && (
            <span className="text-[11px] text-muted-foreground ml-1">
              {selectedSegs.size} selecionado{selectedSegs.size > 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-display font-semibold">
              Segmentação | {periodo === "tri" ? "Trimestre atual" : "Mês atual"}
            </h2>
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-lg border border-border overflow-hidden">
                {([
                  { k: "mes" as const, label: "Mês" },
                  { k: "tri" as const, label: "Trimestre" },
                ]).map((o) => (
                  <button
                    key={o.k}
                    onClick={() => setPeriodo(o.k)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium transition-colors",
                      periodo === o.k
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">{visible.length} clientes</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50 select-none">
                  <th className="w-10"></th>
                  <SortableTh label="Rank" k="rank" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="center" className="w-16" />
                  <SortableTh label="Cliente" k="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                  <SortableTh label="Seg" k="segment" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="center" />
                  <SortableTh label={periodo === "tri" ? "Projeção / tri" : "Projeção / mês"} k="projection" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortableTh label="Geração R$" k="generation" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortableTh label="Vendas R$" k="sales" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                  
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-muted-foreground text-sm">
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2 align-middle" />
                      Carregando clientes…
                    </td>
                  </tr>
                )}
                {anyError && !loading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-sm text-destructive">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 mt-0.5" />
                        <div>
                          <div className="font-medium">Não foi possível carregar a segmentação.</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {anyError instanceof Error ? anyError.message : String(anyError)}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}

                {!loading &&
                  pageRows.map((c) => {
                    const isOpen = expanded.has(c.id);
                    const denom = c.projection > 0 ? c.projection : 1;
                    const generationPct = (c.generation / denom) * 100;
                    const salesPct = (c.sales / denom) * 100;

                    return (
                      <Fragment key={c.id}>
                        <tr onClick={() => toggle(c.id)} className="border-b border-border/40 hover:bg-surface-2/50 cursor-pointer">
                          <td className="px-2">
                            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                          </td>
                          <td className="px-2 py-3 text-center"><RankBadge rank={c.rank} /></td>
                          <td className="px-4 py-3 font-medium">{c.name}</td>
                          <td className="px-2 py-3 text-center">
                            <SegBadge seg={c.segment} />
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmt(c.projection)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{c.generation > 0 ? fmt(c.generation) : "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{c.sales > 0 ? fmt(c.sales) : "—"}</td>
                          <td className="px-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate({ to: "/solar/clientes/perfil", search: { account: c.id } });
                              }}
                              className="p-1.5 rounded hover:bg-primary/15 text-muted-foreground hover:text-primary"
                              title="Abrir perfil do cliente"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${c.id}-d`} className="bg-surface-2/30 border-b border-border/40">
                            <td colSpan={8} className="px-6 py-5">
                              <div className="grid md:grid-cols-3 gap-4">
                                <Detail label={periodo === "tri" ? "Projeção (tri)" : "Projeção (mês)"} value={fmt(c.projection)} />
                                <Detail label="Geração R$" value={fmt(c.generation)} sub={c.projection > 0 ? `${generationPct.toFixed(0)}% da projeção` : undefined} />
                                <Detail label="Vendas R$" value={fmt(c.sales)} sub={c.projection > 0 ? `${salesPct.toFixed(0)}% da projeção` : undefined} />
                              </div>
                              <div className="mt-4 p-3 rounded-lg bg-background/60 border border-border">
                                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <Package className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                                      Pedidos em andamento
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-2 text-[10px]">
                                    {(["Aguardando Pagamento","Processando","Separação","Faturado","Coletado"] as const).map((s) => (
                                      <span key={s} className="inline-flex items-center gap-1 text-muted-foreground">
                                        <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])} />
                                        {s}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                {(() => {
                                  const orders = ordersByAccount.get(c.id) ?? [];
                                  if (orders.length === 0) {
                                    return <div className="text-xs text-muted-foreground">Nenhum pedido em andamento.</div>;
                                  }
                                  return (
                                    <div className="space-y-1.5">
                                      {orders
                                        .slice()
                                        .sort((a, b) => b.total - a.total)
                                        .map((o) => (
                                          <div key={o.id} className="flex items-center gap-3 text-xs">
                                            <span className={cn(
                                              "px-2 py-0.5 rounded-md border font-medium whitespace-nowrap",
                                              (o.status && STATUS_COLOR[o.status]) || "bg-surface-2 text-muted-foreground border-border",
                                            )}>
                                              {o.status ?? "—"}
                                            </span>
                                            <span className="truncate flex-1">{o.name}</span>
                                            {o.closeDate && (
                                              <span className="text-muted-foreground tabular-nums">
                                                {new Date(o.closeDate + "T00:00:00").toLocaleDateString("pt-BR")}
                                              </span>
                                            )}
                                            <span className="font-display font-semibold tabular-nums w-28 text-right">
                                              {fmt(o.total)}
                                            </span>
                                          </div>
                                        ))}
                                    </div>
                                  );
                                })()}
                              </div>
                              <div className="mt-3 p-3 rounded-lg bg-background/60 border border-border">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <FileText className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Observações do cadastro</span>
                                </div>
                                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
                                  {c.notes ?? "Sem observações registradas no cadastro."}
                                </p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                {!loading && (
                  <tr className="bg-surface-2 font-display font-bold border-t-2 border-primary/40">
                    <td colSpan={2}></td>
                    <td className="px-4 py-3">Total ({visible.length})</td>
                    <td></td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.projection)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-success">{fmt(totals.generation)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-primary">{fmt(totals.sales)}</td>
                    <td colSpan={2}></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!loading && visible.length > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-t border-border">
              <div className="text-xs text-muted-foreground">
                Exibindo {(pageSafe - 1) * pageSize + 1}–{Math.min(pageSafe * pageSize, visible.length)} de {visible.length}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2 py-1.5 rounded-md bg-surface border border-border text-xs"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n} por página
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pageSafe === 1}
                  className="px-3 py-1.5 rounded-md bg-surface-2 hover:bg-surface disabled:opacity-40 text-xs font-medium"
                >
                  ← Anterior
                </button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {pageSafe} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={pageSafe === totalPages}
                  className="px-3 py-1.5 rounded-md bg-surface-2 hover:bg-surface disabled:opacity-40 text-xs font-medium"
                >
                  Próxima →
                </button>
              </div>
            </div>
          )}
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
  const conversion = client.projection > 0 ? ((client.sales / client.projection) * 100).toFixed(0) : "0";
  const generationPct = client.projection > 0 ? ((client.generation / client.projection) * 100).toFixed(0) : "0";
  return (
    <>
      <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl pointer-events-auto overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-3 bg-gradient-to-r from-primary/10 to-transparent">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {client.rank && <RankBadge rank={client.rank} />}
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold border", SEG_BADGE[client.segment])}>
                  Seg {client.segment}
                </span>
              </div>
              <h2 className="font-display font-bold text-xl truncate">{client.name}</h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-surface-2 rounded-lg shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Detail label="Projeção" value={fmt(client.projection)} />
              <Detail label="Geração" value={fmt(client.generation)} sub={`${generationPct}%`} />
              <Detail label="Vendas" value={fmt(client.sales)} sub={`${conversion}%`} />
            </div>


            <div className="rounded-xl bg-surface-2 border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Observações do cadastro</span>
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
                {client.notes ?? "Sem observações no cadastro deste cliente."}
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
