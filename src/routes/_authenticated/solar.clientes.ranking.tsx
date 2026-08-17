import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2, AlertTriangle, Trophy, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/solar/clientes/ranking")({
  head: () => ({
    meta: [
      { title: "Ranking de Clientes — Portal 2P" },
      { name: "description", content: "Ranking dos clientes 2P Solar por valor total faturado, com filtros por vendedor e estado." },
      { property: "og:title", content: "Ranking de Clientes — Portal 2P" },
      { property: "og:description", content: "Clientes ordenados do maior para o menor valor total." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RankingPage,
});

const BUCKET = "top20";
const PATH = "top20.csv";

type Row = {
  name: string;
  valor: number;
  seller: string;
  uf: string;
  count: number;
};

/** Regras fixas de normalização de contas */
function normalizeName(raw: string): string | null {
  const n = raw.trim();
  const u = n.toUpperCase();
  if (/\bESOL\b|ESOL/.test(u)) return null; // ESOL desconsiderada
  if (u.includes("RUDNIK")) return null; // excluída
  if (u.includes("VERTICE") || u.includes("VÉRTICE")) return null; // excluída
  if (u.includes("SOLTURI")) return "SOLTURI";
  if (/\bNAP\b|NAP\s|^NAP/.test(u) || u.includes("NAP ")) return "NAP";
  return n;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function parseMoney(raw: string): number {
  let s = (raw ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "");
  s = s.replace(",", ".");
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function RankingPage() {
  const [search, setSearch] = useState("");
  const [seller, setSeller] = useState("all");
  const [uf, setUf] = useState("all");
  
  const [limit, setLimit] = useState(50);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["top20-ranking"],
    queryFn: async (): Promise<Row[]> => {
      const { data: blob, error: err } = await supabase.storage.from(BUCKET).download(PATH);
      if (err || !blob) throw new Error("Arquivo Top 20 não encontrado. Envie o CSV em Integrações.");
      const rows = parseCsv(await blob.text());
      const [header, ...body] = rows;
      if (!header) return [];
      const idx = (needle: string) =>
        header.findIndex((h) => h.trim().toLowerCase().includes(needle));
      const iName = idx("nome");
      const iValor = idx("valor");
      const iSeller = idx("user_account");
      const iUf = idx("billingstate");
      const iCount = idx("contagem");
      const map = new Map<string, Row>();
      for (const r of body) {
        const name = normalizeName(r[iName] ?? "");
        if (!name) continue;

        const valor = parseMoney(r[iValor] ?? "");
        const key = name.toLowerCase();
        const prev = map.get(key);
        if (prev) {
          prev.valor += valor;
          prev.count += Number(r[iCount] ?? 0) || 0;
        } else {
          map.set(key, {
            name,
            valor,
            seller: (r[iSeller] ?? "").trim() || "—",
            uf: (r[iUf] ?? "").trim() || "—",
            count: Number(r[iCount] ?? 0) || 0,
          });
        }
      }
      return [...map.values()].sort((a, b) => b.valor - a.valor);
    },
    staleTime: 5 * 60_000,
  });

  const all = data ?? [];
  const sellers = useMemo(
    () => [...new Set(all.map((r) => r.seller))].filter((s) => s !== "—").sort(),
    [all],
  );
  const ufs = useMemo(
    () => [...new Set(all.map((r) => r.uf))].filter((s) => s !== "—").sort(),
    [all],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all.filter((r) => {
      if (seller !== "all" && r.seller !== seller) return false;
      if (uf !== "all" && r.uf !== uf) return false;
      if (s && !r.name.toLowerCase().includes(s) && !r.seller.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [all, search, seller, uf]);

  const shown = filtered.slice(0, Math.min(limit, 50));
  const total = shown.reduce((a, r) => a + r.valor, 0);

  function exportCsv() {
    const lines = [
      "Posicao,Cliente,Valor,Vendedor,UF",
      ...shown.map((r, i) =>
        [i + 1, `"${r.name.replace(/"/g, '""')}"`, r.valor.toFixed(2), `"${r.seller}"`, r.uf].join(","),
      ),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "ranking-clientes.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const maxValor = shown.length ? Math.max(...shown.map((r) => r.valor)) : 1;
  const grandTotal = filtered.reduce((a, r) => a + r.valor, 0) || 1;
  const podium = shown.slice(0, 3);
  const rest = shown.slice(3);
  const hasFilters = seller !== "all" || uf !== "all" || !!search;

  const selectCls =
    "px-3 py-2 rounded-xl bg-surface border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition";

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-6">
        {/* Header */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Clientes</div>
            <h1 className="text-2xl sm:text-3xl font-bold mt-1 flex items-center gap-2">
              <Trophy className="h-6 w-6 text-primary shrink-0" />
              <span className="truncate">Ranking</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Clientes ordenados por valor total faturado.
            </p>
          </div>
          <button
            onClick={exportCsv}
            disabled={shown.length === 0}
            className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface-2 hover:bg-surface border border-border text-sm font-medium disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> Exportar
          </button>
        </header>

        {/* Resumo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard label="Clientes exibidos" value={String(shown.length)} />
          <SummaryCard label="Total exibido" value={brl(total)} accent />
          <SummaryCard label="Ticket médio" value={brl(shown.length ? total / shown.length : 0)} />
          <SummaryCard
            label="Concentração Top 3"
            value={`${Math.round((podium.reduce((a, r) => a + r.valor, 0) / grandTotal) * 100)}%`}
          />
        </div>

        {/* Filtros */}
        <div className="rounded-2xl border border-border bg-card p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente ou vendedor…"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition"
            />
          </div>
          <select value={seller} onChange={(e) => setSeller(e.target.value)} className={selectCls}>
            <option value="all">Todos os vendedores</option>
            {sellers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={uf} onChange={(e) => setUf(e.target.value)} className={selectCls}>
            <option value="all">Todos os estados</option>
            {ufs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className={selectCls}>
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                Top {n}
              </option>
            ))}
          </select>
          {hasFilters && (
            <button
              onClick={() => {
                setSeller("all");
                setUf("all");
                setSearch("");
              }}
              className="px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2"
            >
              Limpar
            </button>
          )}
          {isFetching && !isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando ranking…
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-3">
            <AlertTriangle className="h-6 w-6 text-destructive mx-auto" />
            <div className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Erro ao carregar"}
            </div>
            <button
              onClick={() => refetch()}
              className="px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface text-sm font-medium"
            >
              Tentar novamente
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center space-y-2">
            <Trophy className="h-7 w-7 text-muted-foreground/50 mx-auto" />
            <div className="text-sm font-medium">Nenhum cliente encontrado</div>
            <p className="text-xs text-muted-foreground">Ajuste os filtros ou a busca para ver resultados.</p>
          </div>
        ) : (
          <>
            {/* Pódio */}
            <div className="grid gap-3 sm:grid-cols-3">
              {podium.map((r, i) => (
                <PodiumCard key={r.name} rank={i + 1} row={r} share={(r.valor / grandTotal) * 100} />
              ))}
            </div>

            {/* Lista */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="hidden md:grid grid-cols-[56px_minmax(0,1fr)_180px_170px_56px] gap-3 px-4 py-2.5 bg-surface-2/60 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                <div>#</div>
                <div>Cliente</div>
                <div className="text-right">Valor total</div>
                <div>Vendedor</div>
                <div className="text-center">UF</div>
              </div>
              <ul className="divide-y divide-border/60">
                {rest.map((r, i) => {
                  const pos = i + 4;
                  const pct = (r.valor / maxValor) * 100;
                  return (
                    <li
                      key={r.name + pos}
                      className="relative group grid grid-cols-[40px_minmax(0,1fr)] md:grid-cols-[56px_minmax(0,1fr)_180px_170px_56px] gap-x-3 gap-y-1 px-4 py-3 hover:bg-surface-2/50 transition-colors"
                    >
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 bg-primary/5 group-hover:bg-primary/10 transition-all pointer-events-none"
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                      <div className="relative text-sm font-semibold tabular-nums text-muted-foreground">
                        {pos}
                      </div>
                      <div className="relative min-w-0">
                        <div className="truncate text-sm font-medium">{r.name}</div>
                        <div className="md:hidden text-xs text-muted-foreground truncate">
                          {r.seller} · {r.uf}
                        </div>
                      </div>
                      <div className="relative col-start-2 md:col-start-3 text-sm font-semibold tabular-nums md:text-right">
                        {brl(r.valor)}
                      </div>
                      <div className="relative hidden md:block text-sm text-muted-foreground truncate">
                        {r.seller}
                      </div>
                      <div className="relative hidden md:flex justify-center">
                        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-surface-2 text-muted-foreground">
                          {r.uf}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {filtered.length > shown.length && (
                <div className="px-4 py-3 text-center text-xs text-muted-foreground border-t border-border">
                  Exibindo os {shown.length} maiores de {filtered.length} clientes.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={
        "rounded-2xl border p-4 " +
        (accent ? "border-primary/30 bg-primary/5" : "border-border bg-card")
      }
    >
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={
          "mt-1 text-lg sm:text-xl font-bold tabular-nums truncate " + (accent ? "text-primary" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}

const MEDAL = ["bg-primary text-primary-foreground", "bg-surface-2 text-foreground", "bg-surface-2 text-foreground"];

function PodiumCard({ rank, row, share }: { rank: number; row: Row; share: number }) {
  return (
    <div
      className={
        "relative overflow-hidden rounded-2xl border p-4 transition-shadow hover:shadow-lg " +
        (rank === 1 ? "border-primary/40 bg-primary/[0.07]" : "border-border bg-card")
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={
            "h-9 w-9 shrink-0 rounded-xl grid place-items-center text-sm font-bold " + MEDAL[rank - 1]
          }
        >
          {rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-snug line-clamp-2">{row.name}</div>
          <div className="text-xs text-muted-foreground truncate mt-0.5">
            {row.seller} · {row.uf}
          </div>
        </div>
        {rank === 1 && <Trophy className="h-5 w-5 text-primary shrink-0" />}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className={"text-xl font-bold tabular-nums " + (rank === 1 ? "text-primary" : "")}>
          {brl(row.valor)}
        </div>
        <div className="text-[11px] text-muted-foreground">{share.toFixed(1)}% do total</div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div
          className={"h-full rounded-full " + (rank === 1 ? "bg-primary" : "bg-primary/50")}
          style={{ width: `${Math.min(100, Math.max(4, share))}%` }}
        />
      </div>
    </div>
  );
}
