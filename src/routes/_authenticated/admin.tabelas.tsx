import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, AlertTriangle, Search, Table as TableIcon, FileText, ShoppingCart } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  getSalesforceOrcamentos,
  getSalesforceVendas,
  type SalesforceOppRow,
} from "@/lib/salesforce.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/tabelas")({
  head: () => ({ meta: [{ title: "Tabelas — Portal 2P" }] }),
  component: TabelasPage,
});

const brl = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

function OppTable({
  records,
  loading,
  error,
  search,
}: {
  records: SalesforceOppRow[];
  loading: boolean;
  error: unknown;
  search: string;
}) {
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return records;
    return records.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        (r.account ?? "").toLowerCase().includes(s) ||
        (r.owner ?? "").toLowerCase().includes(s) ||
        (r.stage ?? "").toLowerCase().includes(s),
    );
  }, [records, search]);

  const total = useMemo(
    () => filtered.reduce((sum, r) => sum + (r.amount ?? 0), 0),
    [filtered],
  );

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {error && (
        <div className="border-b border-destructive/40 bg-destructive/10 text-destructive text-sm px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <div>{error instanceof Error ? error.message : "Erro ao carregar dados"}</div>

        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
              <th className="text-left px-4 py-2.5">Oportunidade</th>
              <th className="text-left px-4 py-2.5">Cliente</th>
              <th className="text-left px-4 py-2.5">Vendedor</th>
              <th className="text-left px-4 py-2.5">Etapa</th>
              <th className="text-left px-4 py-2.5">Tipo NF</th>
              <th className="text-left px-4 py-2.5">Data</th>
              <th className="text-right px-4 py-2.5">Valor</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground text-sm">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2 align-middle" />
                  Carregando do Salesforce…
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.account ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.owner ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-muted-foreground">
                      {r.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.tipoNf ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.closeDate)}</td>
                  <td className="px-4 py-3 text-right font-mono">{brl(r.amount)}</td>
                </tr>
              ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
          </tbody>
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-surface-2/50 text-sm">
                <td colSpan={6} className="px-4 py-2.5 text-right text-muted-foreground uppercase tracking-wider text-[11px]">
                  Total ({filtered.length} {filtered.length === 1 ? "registro" : "registros"})
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold">{brl(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function TabelasPage() {
  const { hasRole } = useAuth();
  const [tab, setTab] = useState<"orcamentos" | "vendas">("orcamentos");
  const [search, setSearch] = useState("");

  const fetchOrc = useServerFn(getSalesforceOrcamentos);
  const fetchVen = useServerFn(getSalesforceVendas);

  const qOrc = useQuery({
    queryKey: ["sf-orcamentos"],
    queryFn: () => fetchOrc(),
    staleTime: 60_000,
    enabled: hasRole("admin") && tab === "orcamentos",
  });
  const qVen = useQuery({
    queryKey: ["sf-vendas"],
    queryFn: () => fetchVen(),
    staleTime: 60_000,
    enabled: hasRole("admin") && tab === "vendas",
  });

  if (!hasRole("admin")) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <TableIcon className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <h1 className="font-display font-bold text-xl">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Somente administradores podem visualizar as tabelas.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-[1400px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Administrador</div>
            <h1 className="text-3xl font-bold mt-1">Tabelas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Dados de oportunidades sincronizados diretamente do Salesforce.
            </p>
          </div>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por oportunidade, cliente, vendedor…"
              className="pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-sm w-80 focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "orcamentos" | "vendas")}>
          <TabsList>
            <TabsTrigger value="orcamentos" className="gap-2">
              <FileText className="h-4 w-4" /> Orçamento
            </TabsTrigger>
            <TabsTrigger value="vendas" className="gap-2">
              <ShoppingCart className="h-4 w-4" /> Vendas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orcamentos" className="mt-4">
            <OppTable
              records={qOrc.data?.records ?? []}
              loading={qOrc.isLoading}
              error={qOrc.error}
              search={search}
            />
          </TabsContent>
          <TabsContent value="vendas" className="mt-4">
            <OppTable
              records={qVen.data?.records ?? []}
              loading={qVen.isLoading}
              error={qVen.error}
              search={search}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
