import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Client360 } from "@/components/cliente-360/client-360";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import {
  getSalesforceAccounts,
  type SalesforceAccount,
} from "@/lib/salesforce.functions";


import { Search, Sparkles } from "lucide-react";



type Search = { account?: string };

export const Route = createFileRoute("/_authenticated/solar/clientes/perfil")({
  head: () => ({ meta: [{ title: "Perfil do Cliente — Portal 2P" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    account: typeof s.account === "string" ? s.account : undefined,
  }),
  component: PerfilPage,
});

const fmt = (n: number | null | undefined) =>
  typeof n === "number"
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    : "—";


const PAGE_SIZE = 10;

function PerfilPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const fetchAccounts = useServerFn(getSalesforceAccounts);
  const accountsQ = useQuery({
    queryKey: ["sf-accounts-perfil"],
    queryFn: () => fetchAccounts(),
    staleTime: 5 * 60_000,
  });
  const accounts = accountsQ.data?.records ?? [];

  const selected: SalesforceAccount | null = useMemo(
    () => (search.account ? accounts.find((a) => a.id === search.account) ?? null : null),
    [accounts, search.account],
  );

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.cnpj ?? "").toLowerCase().includes(q) ||
        (a.ownerName ?? "").toLowerCase().includes(q),
    );
  }, [accounts, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Clientes</div>
            <h1 className="text-3xl font-bold mt-1">Perfil do Cliente</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {selected
                ? "Dossiê completo para alimentar o Atlas: cadastro, histórico e anotações do vendedor."
                : "Selecione um cliente da lista para abrir o dossiê completo."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selected && (
              <>
                <button
                  onClick={() => navigate({ to: "/solar/clientes/perfil", search: {} })}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface text-sm font-medium"
                >
                  ← Voltar à lista
                </button>
                <Link
                  to="/solar/clientes/sugestoes"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/15 text-primary hover:bg-primary/20 text-sm font-medium"
                >
                  <Sparkles className="h-4 w-4" /> Sugestões do Atlas
                </Link>
              </>
            )}
          </div>
        </header>

        {selected ? (
          <Client360 account={selected} />
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <div className="p-3 border-b border-border flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nome, CNPJ ou responsável…"
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="ml-auto text-xs text-muted-foreground">
                {accountsQ.isLoading
                  ? "Carregando…"
                  : `${filtered.length} cliente${filtered.length === 1 ? "" : "s"}`}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2/40">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Cliente</th>
                    <th className="text-left px-4 py-2.5 font-medium">CNPJ</th>
                    <th className="text-center px-4 py-2.5 font-medium">Seg.</th>
                    <th className="text-left px-4 py-2.5 font-medium">Responsável</th>
                    <th className="text-right px-4 py-2.5 font-medium">Vendido tri. atual</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {accountsQ.isLoading && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                        Carregando clientes…
                      </td>
                    </tr>
                  )}
                  {!accountsQ.isLoading && pageRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                        Nenhum cliente encontrado.
                      </td>
                    </tr>
                  )}
                  {pageRows.map((a) => (
                    <tr
                      key={a.id}
                      onClick={() =>
                        navigate({ to: "/solar/clientes/perfil", search: { account: a.id } })
                      }
                      className="border-t border-border hover:bg-surface-2/60 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium truncate max-w-[280px]">{a.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.cnpj ?? "—"}</td>
                      <td className="px-4 py-3 text-center">
                        {a.segment ? (
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/15 text-primary text-xs font-semibold">
                            {a.segment}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">
                        {a.ownerName ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmt(a.quarterSold)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-primary text-xs font-medium">Abrir →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
                <div className="text-xs text-muted-foreground">
                  Página {pageSafe} de {totalPages} · exibindo{" "}
                  {(pageSafe - 1) * PAGE_SIZE + 1}–
                  {Math.min(pageSafe * PAGE_SIZE, filtered.length)} de {filtered.length}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={pageSafe === 1}
                    className="px-3 py-1.5 rounded-md bg-surface-2 hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium"
                  >
                    ← Anterior
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={pageSafe === totalPages}
                    className="px-3 py-1.5 rounded-md bg-surface-2 hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium"
                  >
                    Próxima →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
