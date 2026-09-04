import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buscaGlobalFn, type BuscaTipo } from "@/lib/busca-global.functions";
import { GRUPO_BUSCA, UNIDADE_BUSCA, agruparResultados } from "@/components/global-search";

type BuscaSearch = { q?: string };

export const Route = createFileRoute("/_authenticated/busca")({
  validateSearch: (search: Record<string, unknown>): BuscaSearch =>
    typeof search["q"] === "string" ? { q: search["q"] } : {},

  head: () => ({
    meta: [
      { title: "Busca | Portal 2P" },
      {
        name: "description",
        content:
          "Pesquise propostas, pedidos, clientes e contatos do Grupo 2P em uma única tela.",
      },
      { property: "og:title", content: "Busca | Portal 2P" },
      {
        property: "og:description",
        content:
          "Pesquise propostas, pedidos, clientes e contatos do Grupo 2P em uma única tela.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaginaBusca,
});

const FILTROS: Array<{ id: "tudo" | BuscaTipo; label: string }> = [
  { id: "tudo", label: "Tudo" },
  { id: "proposta", label: "Propostas" },
  { id: "pedido", label: "Pedidos" },
  { id: "cliente", label: "Clientes" },
  { id: "contato", label: "Contatos" },
];

function PaginaBusca() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const buscar = useServerFn(buscaGlobalFn);
  const [termo, setTermo] = useState(q ?? "");
  const [filtro, setFiltro] = useState<"tudo" | BuscaTipo>("tudo");

  useEffect(() => setTermo(q ?? ""), [q]);

  const consulta = (q ?? "").trim();
  const { data, isFetching } = useQuery({
    queryKey: ["busca-global", consulta, 30],
    queryFn: () => buscar({ data: { q: consulta, limite: 30 } }),
    enabled: consulta.length >= 2,
    staleTime: 30_000,
  });

  const resultados = data?.resultados ?? [];
  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of resultados) c[r.tipo] = (c[r.tipo] ?? 0) + 1;
    return c;
  }, [resultados]);

  const grupos = agruparResultados(
    filtro === "tudo" ? resultados : resultados.filter((r) => r.tipo === filtro),
  );

  const submeter = (e: React.FormEvent) => {
    e.preventDefault();
    void navigate({ to: "/busca", search: { q: termo.trim() } });
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-4xl px-4 py-6 space-y-5">
        <div>
          <h1 className="font-display text-xl font-bold">Busca</h1>
          <p className="text-sm text-muted-foreground">
            Propostas, pedidos, clientes e contatos das unidades que você acessa.
          </p>
        </div>

        <form onSubmit={submeter} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Número da proposta, OV, cliente, CNPJ, contato…"
              className="pl-9"
            />
          </div>
          <Button type="submit">Buscar</Button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => {
            const total = f.id === "tudo" ? resultados.length : (contagem[f.id] ?? 0);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  filtro === f.id
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border bg-surface hover:bg-surface-2",
                )}
              >
                {f.label} {total > 0 && <span className="opacity-70">({total})</span>}
              </button>
            );
          })}
        </div>

        {isFetching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
          </div>
        )}

        {!isFetching && consulta.length >= 2 && !resultados.length && (
          <p className="text-sm text-muted-foreground">
            Nada encontrado para “{consulta}”.
          </p>
        )}

        {consulta.length < 2 && (
          <p className="text-sm text-muted-foreground">Digite ao menos 2 caracteres.</p>
        )}

        <div className="space-y-5">
          {grupos.map(([tipo, itens]) => {
            const Icon = GRUPO_BUSCA[tipo].icon;
            return (
              <section key={tipo} className="rounded-xl border border-border bg-surface">
                <header className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm font-semibold">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {GRUPO_BUSCA[tipo].titulo}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({itens.length})
                  </span>
                </header>
                <ul className="divide-y divide-border">
                  {itens.map((r) => (
                    <li key={`${r.tipo}-${r.id}`}>
                      <button
                        type="button"
                        onClick={() =>
                          void navigate({ to: r.to as any, search: r.search as any })
                        }
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/60"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{r.titulo}</span>
                          {r.subtitulo && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {r.subtitulo}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {UNIDADE_BUSCA[r.instancia] ?? r.instancia}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
