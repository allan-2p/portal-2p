import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useStickyOpen } from "@/hooks/use-sticky-open";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, KanbanSquare, List, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROPOSTA_STATUS_STYLE, type PropostaStatus } from "@/lib/proposta-status";
import { StatusDot, StatusLegend } from "@/components/proposta-status-ui";
import { listarPropostasFn } from "@/lib/propostas.functions";
import { VendedorNamesFilter } from "@/components/vendedor-names-filter";
import { useVendedoresOrg } from "@/hooks/use-carregadores-vendedores";

export const Route = createFileRoute("/_authenticated/solar/pedidos")({
  head: () => ({
    meta: [
      { title: "Acompanhamento — Portal 2P Solar" },
      {
        name: "description",
        content:
          "Acompanhe os pedidos do 2P Solar em Kanban ou lista, com status, valores e responsáveis.",
      },
      { property: "og:title", content: "Acompanhamento — Portal 2P Solar" },
      {
        property: "og:description",
        content: "Acompanhe os pedidos do 2P Solar por status, cliente e valor.",
      },
      { property: "og:url", content: "/solar/pedidos" },
    ],
    links: [{ rel: "canonical", href: "/solar/pedidos" }],
  }),
  component: AcompanhamentoSolarPage,
});

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/** Status de acompanhamento (pós-fechamento) — iguais aos de Carregadores. */
const PEDIDO_STATUS = [
  "Aguardando Pagamento",
  "Processando",
  "Separação",
  "Faturado",
  "Coletado",
] as const satisfies readonly PropostaStatus[];
type PedidoStatus = (typeof PEDIDO_STATUS)[number];

const STATUS_STYLE = PROPOSTA_STATUS_STYLE;

type Pedido = {
  id: string;
  code: string;
  title: string;
  client: string;
  closing: string;
  value: number;
  status: PedidoStatus;
  uf: string;
  created_by: string | null;
};

function datePtBr(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function AcompanhamentoSolarPage() {
  // Visão Kanban/Lista persiste durante a navegação e entre sessões.
  const [kanban, , setKanban] = useStickyOpen("portal2p-acomp-solar-kanban", true);
  const view: "kanban" | "list" = kanban ? "kanban" : "list";
  const setView = (v: "kanban" | "list") => setKanban(v === "kanban");
  const [search, setSearch] = useState("");
  const [vendedor, setVendedor] = useState("__all__");
  const vend = useVendedoresOrg("solar");

  const q = useQuery({
    queryKey: ["solar-pedidos"],
    queryFn: async () => {
      const data = await listarPropostasFn({
        data: {
          organizacao: "solar",
          select: "id,numero,cliente_nome,uf,status,totais,created_at,created_by",
          statusIn: PEDIDO_STATUS as unknown as string[],
        },
      });
      return data ?? [];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const pedidos = useMemo<Pedido[]>(
    () =>
      (q.data ?? []).map((r: any) => {
        const totais = (r.totais as Record<string, number>) ?? {};
        return {
          id: r.id,
          code: r.numero ?? String(r.id).slice(-6).toUpperCase(),
          title: r.numero ? `Proposta ${r.numero}` : "Proposta",
          client: r.cliente_nome ?? "—",
          closing: datePtBr(r.created_at),
          value: Number(totais.valorTotal ?? 0),
          status: r.status as PedidoStatus,
          uf: r.uf ?? "—",
          created_by: r.created_by ?? null,
        };
      }),
    [q.data],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return pedidos
      .filter((o) => vend.matches(vendedor, o.created_by))
      .filter(
        (o) =>
          !s ||
          o.code.toLowerCase().includes(s) ||
          o.title.toLowerCase().includes(s) ||
          o.client.toLowerCase().includes(s),
      )
      .sort((a, b) => b.value - a.value);
  }, [search, pedidos, vendedor, vend]);

  return (
    <AppLayout>
      <div className="max-w-[1700px] mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Propostas</div>
            <h1 className="text-3xl font-bold mt-1">Acompanhamento</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar pedido, cliente…"
                className="pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-sm w-64 focus:outline-none focus:border-primary/50"
              />
            </div>
            <VendedorNamesFilter
              value={vendedor}
              onChange={setVendedor}
              options={vend.names}
              allLabel="Todos os vendedores"
            />
            <div className="flex bg-surface rounded-lg p-1 border border-border">
              <button
                onClick={() => setView("kanban")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors",
                  view === "kanban"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <KanbanSquare className="h-4 w-4" /> Kanban
              </button>
              <button
                onClick={() => setView("list")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors",
                  view === "list"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <List className="h-4 w-4" /> Lista
              </button>
            </div>
          </div>
        </div>

        {q.isLoading ? (
          <div className="glass rounded-2xl p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando pedidos…
          </div>
        ) : q.error ? (
          <div className="glass rounded-2xl p-8 flex items-center gap-3 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Não foi possível carregar os pedidos.
          </div>
        ) : view === "kanban" ? (
          <KanbanView data={filtered} />
        ) : (
          <ListView data={filtered} />
        )}
      </div>
    </AppLayout>
  );
}

function KanbanView({ data }: { data: Pedido[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {PEDIDO_STATUS.map((col) => {
        const cards = data.filter((o) => o.status === col);
        const style = STATUS_STYLE[col];
        return (
          <div
            key={col}
            className="bg-surface/60 rounded-2xl border border-border overflow-hidden flex flex-col max-h-[75vh]"
          >
            <div
              className="px-4 py-2.5 flex items-center justify-between"
              style={{ backgroundColor: style.bg, color: style.fg }}
            >
              <span className="font-display font-semibold text-sm">{col}</span>
              <span className="text-xs font-bold bg-background/30 px-2 py-0.5 rounded">
                {cards.length}
              </span>
            </div>
            <div className="p-2 space-y-2 overflow-y-auto flex-1">
              {cards.map((c) => (
                <div
                  key={c.id}
                  className="bg-surface-2 hover:bg-surface rounded-xl p-3 border border-transparent hover:border-primary/30 transition-all"
                >
                  <div className="text-sm font-medium truncate">
                    {c.code} — {c.title}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-primary mt-2">Cliente</div>
                  <div className="text-xs text-foreground/90 leading-snug line-clamp-2">{c.client}</div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-primary">Data</div>
                      <div className="text-xs">{c.closing}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-primary">Valor</div>
                      <div className="text-xs font-semibold">{fmt(c.value)}</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-2">UF {c.uf}</div>
                </div>
              ))}
              {cards.length === 0 && (
                <div className="text-xs text-muted-foreground px-2 py-6 text-center">
                  Nenhum pedido neste status.
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({ data }: { data: Pedido[] }) {
  return (
    <div className="space-y-3">
      <StatusLegend statuses={PEDIDO_STATUS} />
      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="text-left px-4 py-3">Código</th>
                <th className="text-left px-4 py-3">Pedido</th>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">UF</th>
                <th className="text-left px-4 py-3">Data</th>
                <th className="text-right px-4 py-3">Valor</th>
              </tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id} className="border-b border-border/50 hover:bg-surface-2">
                  <td className="px-4 py-3 font-medium">{o.code}</td>
                  <td className="px-4 py-3 text-muted-foreground">{o.title}</td>
                  <td className="px-4 py-3">{o.client}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusDot status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{o.uf}</td>
                  <td className="px-4 py-3 text-muted-foreground">{o.closing}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(o.value)}</td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum pedido encontrado nos status em curso.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
