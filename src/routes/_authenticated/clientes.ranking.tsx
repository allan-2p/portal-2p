import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2, AlertTriangle, Trophy, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/clientes/ranking")({
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
  const [minValor, setMinValor] = useState("");
  const [limit, setLimit] = useState(100);

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

  const total = filtered.reduce((a, r) => a + r.valor, 0);
  const shown = filtered.slice(0, limit);

  function exportCsv() {
    const lines = [
      "Posicao,Cliente,Valor,Vendedor,UF",
      ...filtered.map((r, i) =>
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

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Clientes</div>
            <h1 className="text-3xl font-bold mt-1">Ranking</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Clientes ordenados pelo valor total (base Top 20 enviada em Integrações).
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente ou vendedor…"
                className="pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-sm w-64 focus:outline-none focus:border-primary/50"
              />
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="px-3.5 py-2 rounded-lg border border-border text-sm hover:bg-surface-2 disabled:opacity-60"
            >
              {isFetching ? "Atualizando…" : "Atualizar"}
            </button>
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border text-sm hover:bg-surface-2"
            >
              <Download className="h-4 w-4" /> Exportar
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-sm">
          <select
            value={seller}
            onChange={(e) => setSeller(e.target.value)}
            className="px-3 py-2 rounded-lg bg-surface border border-border focus:outline-none focus:border-primary/50"
          >
            <option value="all">Todos os vendedores</option>
            {sellers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={uf}
            onChange={(e) => setUf(e.target.value)}
            className="px-3 py-2 rounded-lg bg-surface border border-border focus:outline-none focus:border-primary/50"
          >
            <option value="all">Todos os estados</option>
            {ufs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            value={minValor}
            onChange={(e) => setMinValor(e.target.value)}
            placeholder="Valor mínimo (R$)"
            className="px-3 py-2 rounded-lg bg-surface border border-border w-44 focus:outline-none focus:border-primary/50"
          />
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-3 py-2 rounded-lg bg-surface border border-border focus:outline-none focus:border-primary/50"
          >
            {[20, 50, 100, 500, 100000].map((n) => (
              <option key={n} value={n}>
                {n >= 100000 ? "Todos" : `Top ${n}`}
              </option>
            ))}
          </select>
          {(seller !== "all" || uf !== "all" || minValor || search) && (
            <button
              onClick={() => {
                setSeller("all");
                setUf("all");
                setMinValor("");
                setSearch("");
              }}
              className="px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground"
            >
              Limpar filtros
            </button>
          )}
          <div className="ml-auto text-muted-foreground">
            {filtered.length.toLocaleString("pt-BR")} clientes · Total {brl(total)}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {isLoading ? (
            <div className="p-10 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando ranking…
            </div>
          ) : error ? (
            <div className="p-10 flex items-center justify-center gap-2 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4" />
              {error instanceof Error ? error.message : "Erro ao carregar"}
            </div>
          ) : shown.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-3 w-16">#</th>
                    <th className="text-left font-medium px-4 py-3">Cliente</th>
                    <th className="text-right font-medium px-4 py-3">Valor total</th>
                    <th className="text-left font-medium px-4 py-3">Vendedor</th>
                    <th className="text-left font-medium px-4 py-3 w-20">UF</th>
                    <th className="text-right font-medium px-4 py-3 w-24">Pedidos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.map((r, i) => (
                    <tr key={r.name + i} className="hover:bg-surface-2/40">
                      <td className="px-4 py-2.5">
                        <span
                          className={
                            i < 3
                              ? "inline-flex items-center gap-1 font-semibold text-primary"
                              : "text-muted-foreground"
                          }
                        >
                          {i < 3 && <Trophy className="h-3.5 w-3.5" />}
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{brl(r.valor)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.seller}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.uf}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > shown.length && (
                <div className="px-4 py-3 text-center text-xs text-muted-foreground border-t border-border">
                  Exibindo {shown.length} de {filtered.length.toLocaleString("pt-BR")} clientes.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
