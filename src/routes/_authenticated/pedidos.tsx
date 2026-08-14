import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, KanbanSquare, List, Loader2, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { VendedorFilter } from "@/components/vendedor-filter";
import { propostaStatusStyle } from "@/lib/proposta-status";
import { getSalesforcePedidos, PEDIDO_STATUS, type PedidoStatus, type SalesforceOppRow } from "@/lib/salesforce.functions";
import { useScopedOwner } from "@/hooks/use-seller-scope";

export const Route = createFileRoute("/_authenticated/pedidos")({
  head: () => ({
    meta: [
      { title: "Pedidos — Portal 2P" },
      {
        name: "description",
        content:
          "Acompanhe os pedidos em Kanban ou lista, com status, valores e responsáveis por vendedor.",
      },
      { property: "og:title", content: "Pedidos — Portal 2P" },
      {
        property: "og:description",
        content:
          "Acompanhe os pedidos em Kanban ou lista, com status, valores e responsáveis por vendedor.",
      },
      { property: "og:url", content: "/pedidos" },
    ],
    links: [{ rel: "canonical", href: "/pedidos" }],
  }),

  component: PedidosPage,
});

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

type Pedido = {
  id: string;
  code: string;
  title: string;
  client: string;
  closing: string;
  value: number;
  status: PedidoStatus;
  owner: string | null;
};

function isPedidoStatus(status: string | null): status is PedidoStatus {
  return PEDIDO_STATUS.includes(status as PedidoStatus);
}

function datePtBr(date: string | null) {
  if (!date) return "—";
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR");
}

function orderCode(row: SalesforceOppRow) {
  const numberMatch = row.name.match(/\b\d{4,}\b/);
  return numberMatch?.[0] ?? row.id.slice(-6);
}

function mapPedido(row: SalesforceOppRow): Pedido | null {
  if (!isPedidoStatus(row.status)) return null;
  return {
    id: row.id,
    code: orderCode(row),
    title: row.name,
    client: row.account ?? "—",
    closing: datePtBr(row.closeDate),
    value: row.total ?? row.amount ?? 0,
    status: row.status,
    owner: row.owner,
  };
}

function PedidosPage() {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [search, setSearch] = useState("");
  const { ownerId, setOwnerId, ownerParam, dataEnabled } = useScopedOwner("all");

  const fetchPedidos = useServerFn(getSalesforcePedidos);
  const pedidosQ = useQuery({
    queryKey: ["salesforce", "pedidos", ownerParam],
    queryFn: () => fetchPedidos({ data: { ownerId: ownerParam } }),
    enabled: dataEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const pedidos = useMemo(
    () => (pedidosQ.data?.records ?? []).map(mapPedido).filter((o): o is Pedido => Boolean(o)),
    [pedidosQ.data],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return pedidos.filter((o) => {
      if (!s) return true;
      return (
        o.code.toLowerCase().includes(s) ||
        o.title.toLowerCase().includes(s) ||
        o.client.toLowerCase().includes(s) ||
        (o.owner ?? "").toLowerCase().includes(s)
      );
    }).sort((a, b) => b.value - a.value);
  }, [search, pedidos]);

  const totalValue = filtered.reduce((sum, pedido) => sum + pedido.value, 0);
  const faturados = filtered.filter((pedido) => pedido.status === "Faturado").length;

  return (
    <AppLayout>
      <div className="max-w-[1700px] mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Carteira</div>
            <h1 className="text-3xl font-bold mt-1">Pedidos</h1>
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
            <VendedorFilter value={ownerId} onChange={setOwnerId} />
            <div className="flex bg-surface rounded-lg p-1 border border-border">
              <button
                onClick={() => setView("kanban")}
                className={cn("px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors",
                  view === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <KanbanSquare className="h-4 w-4" /> Kanban
              </button>
              <button
                onClick={() => setView("list")}
                className={cn("px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors",
                  view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <List className="h-4 w-4" /> Lista
              </button>
            </div>
          </div>
        </div>


        {pedidosQ.isLoading ? (
          <div className="glass rounded-2xl p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando pedidos do Salesforce…
          </div>
        ) : pedidosQ.error ? (
          <div className="glass rounded-2xl p-8 flex items-center gap-3 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Não foi possível carregar os pedidos do Salesforce.
          </div>
        ) : view === "kanban" ? <KanbanView data={filtered} /> : <ListView data={filtered} />}
      </div>
    </AppLayout>
  );
}

const STATUS_STYLE = Object.fromEntries(
  PEDIDO_STATUS.map((s) => [s, propostaStatusStyle(s)]),
) as unknown as Record<PedidoStatus, { bg: string; fg: string }>;


function KanbanView({ data }: { data: Pedido[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {PEDIDO_STATUS.map((col) => {
        const cards = data.filter((o) => o.status === col);
        const style = STATUS_STYLE[col];
        return (
          <div key={col} className="bg-surface/60 rounded-2xl border border-border overflow-hidden flex flex-col max-h-[75vh]">
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: style.bg, color: style.fg }}>
              <span className="font-display font-semibold text-sm">{col}</span>
              <span className="text-xs font-bold bg-background/30 px-2 py-0.5 rounded">{cards.length}</span>
            </div>
            <div className="p-2 space-y-2 overflow-y-auto flex-1">
              {cards.map((c) => (
                <div key={c.id} className="bg-surface-2 hover:bg-surface rounded-xl p-3 cursor-pointer border border-transparent hover:border-primary/30 transition-all">
                  <div className="text-sm font-medium truncate">{c.code} — {c.title}</div>
                  <div className="text-[10px] uppercase tracking-wider text-primary mt-2">Cliente</div>
                  <div className="text-xs text-foreground/90 leading-snug line-clamp-2">{c.client}</div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-primary">Fechamento</div>
                      <div className="text-xs">{c.closing}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-primary">Valor</div>
                      <div className="text-xs font-semibold">{fmt(c.value)}</div>
                    </div>
                  </div>
                  {c.owner && <div className="text-[11px] text-muted-foreground mt-2 truncate">{c.owner}</div>}
                </div>
              ))}
              {cards.length === 0 && (
                <div className="text-xs text-muted-foreground px-2 py-6 text-center">Nenhum pedido neste status.</div>
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
    <div className="glass rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
              <th className="text-left px-4 py-3">Código</th>
              <th className="text-left px-4 py-3">Pedido</th>
              <th className="text-left px-4 py-3">Cliente</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Vendedor</th>
              <th className="text-left px-4 py-3">Fechamento</th>
              <th className="text-right px-4 py-3">Valor</th>
            </tr>
          </thead>
          <tbody>
            {data.map((o) => (
              <tr key={o.id} className="border-b border-border/50 hover:bg-surface-2 cursor-pointer">
                <td className="px-4 py-3 font-medium">{o.code}</td>
                <td className="px-4 py-3 text-muted-foreground">{o.title}</td>
                <td className="px-4 py-3">{o.client}</td>
                <td className="px-4 py-3">
                  <span
                    className="text-[11px] px-2 py-0.5 rounded font-medium"
                    style={{ backgroundColor: STATUS_STYLE[o.status].bg, color: STATUS_STYLE[o.status].fg }}
                  >
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{o.owner ?? "—"}</td>
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
  );
}

