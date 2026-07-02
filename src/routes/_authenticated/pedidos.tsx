import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { orders, kanbanColumns, type Order } from "@/lib/mock-data";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { KanbanSquare, List, Sparkles, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { VendedorFilter } from "@/components/vendedor-filter";
import { getSalesforceSalespeople } from "@/lib/salesforce.functions";

export const Route = createFileRoute("/_authenticated/pedidos")({
  head: () => ({
    meta: [
      { title: "Pedidos — Portal 2P" },
      { name: "description", content: "Detalhamento de pedidos em Kanban ou lista." },
    ],
  }),
  component: PedidosPage,
});

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

function PedidosPage() {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [search, setSearch] = useState("");
  const [ownerId, setOwnerId] = useState<string>("all");

  const fetchSalespeople = useServerFn(getSalesforceSalespeople);
  const peopleQ = useQuery({
    queryKey: ["sf-salespeople"],
    queryFn: () => fetchSalespeople(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const people = peopleQ.data?.records ?? [];

  // Mapa determinístico pedido -> vendedor (mock), até integrar OwnerId real dos pedidos.
  const ownerByOrder = useMemo(() => {
    const m = new Map<string, string>();
    if (people.length === 0) return m;
    for (const o of orders) {
      let h = 0;
      for (let i = 0; i < o.id.length; i++) h = (h * 31 + o.id.charCodeAt(i)) >>> 0;
      m.set(o.id, people[h % people.length].id);
    }
    return m;
  }, [people]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (ownerId !== "all" && ownerByOrder.get(o.id) !== ownerId) return false;
      if (!s) return true;
      return (
        o.code.toLowerCase().includes(s) ||
        o.title.toLowerCase().includes(s) ||
        o.client.toLowerCase().includes(s)
      );
    });
  }, [search, ownerId, ownerByOrder]);

  return (
    <AppLayout>
      <div className="max-w-[1700px] mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Carteira</div>
            <h1 className="text-3xl font-bold mt-1">Detalhamento de Pedidos</h1>
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

        <div className="glass rounded-2xl p-4 flex items-start gap-3 border-primary/30">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-[oklch(0.7_0.18_280)] flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="text-sm">
            <span className="font-semibold">Atlas: </span>
            <span className="text-muted-foreground">14 pedidos faturados aguardam coleta — R$ 96,4k. Pedido 40883 (R.V. Energia, R$ 63k) é o de maior impacto, vale priorizar a logística.</span>
          </div>
        </div>

        {view === "kanban" ? <KanbanView data={filtered} /> : <ListView data={filtered} />}
      </div>
    </AppLayout>
  );
}

const statusCount: Record<Order["status"], number> = {
  "Aguard. Pagamento": 6,
  "Processando": 3,
  "Separação": 10,
  "Faturado": 14,
  "Coletado": 101,
};

function KanbanView({ data }: { data: Order[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {kanbanColumns.map((col) => {
        const cards = data.filter((o) => o.status === col);
        return (
          <div key={col} className="bg-surface/60 rounded-2xl border border-border overflow-hidden flex flex-col max-h-[75vh]">
            <div className="bg-gradient-to-r from-primary to-[oklch(0.62_0.22_30)] px-4 py-2.5 flex items-center justify-between">
              <span className="font-display font-semibold text-sm text-primary-foreground">{col}</span>
              <span className="text-xs font-bold bg-background/30 text-primary-foreground px-2 py-0.5 rounded">{statusCount[col]}</span>
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
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({ data }: { data: Order[] }) {
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
                  <span className="text-[11px] px-2 py-0.5 rounded bg-primary/15 text-primary font-medium">{o.status}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{o.closing}</td>
                <td className="px-4 py-3 text-right font-semibold">{fmt(o.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
