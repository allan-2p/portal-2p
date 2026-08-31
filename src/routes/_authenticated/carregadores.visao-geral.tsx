import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { BarChart3, Loader2 } from "lucide-react";
import { listarPropostasFn } from "@/lib/propostas.functions";
import { fmtBRL } from "@/lib/carregadores";
import { StatusDot } from "@/components/proposta-status-ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/carregadores/visao-geral")({
  head: () => ({
    meta: [
      { title: "Visão Geral — Portal 2P Carregadores" },
      { name: "description", content: "Pedidos vendidos de carregadores por cliente, valor e mês, com filtro por período." },
      { property: "og:title", content: "Visão Geral — Portal 2P Carregadores" },
      { property: "og:description", content: "Pedidos vendidos de carregadores por período." },
    ],
  }),
  component: CarregadoresVisaoGeralPage,
});

/** Status que representam venda concretizada (pedido subiu). */
const STATUS_VENDIDOS = [
  "Aguardando Pagamento",
  "Processando",
  "Separação",
  "Faturado",
  "Coletado",
  "Entregue",
] as const;

type PedidoVendido = {
  id: string;
  numero: string | null;
  nome: string | null;
  cliente_nome: string;
  status: string;
  valor: number;
  created_at: string;
};

function mesChave(iso: string) {
  return iso.slice(0, 7); // YYYY-MM
}

function mesLabel(chave: string) {
  const [ano, mes] = chave.split("-").map(Number);
  return new Date(ano!, (mes ?? 1) - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function CarregadoresVisaoGeralPage() {
  const [periodo, setPeriodo] = useState<string>("todos");

  const q = useQuery({
    queryKey: ["carregadores-visao-geral"],
    queryFn: async (): Promise<PedidoVendido[]> => {
      const data = await listarPropostasFn({
        data: {
          organizacao: "carregadores",
          select: "id,numero,nome,cliente_nome,status,totais,created_at",
          statusIn: STATUS_VENDIDOS as unknown as string[],
        },
      });
      return (data ?? []).map((r: any) => ({
        id: r.id,
        numero: r.numero ?? null,
        nome: r.nome ?? null,
        cliente_nome: r.cliente_nome ?? "—",
        status: r.status,
        valor: Number(r.totais?.valorTotal ?? r.totais?.total ?? 0),
        created_at: r.created_at,
      }));
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const meses = useMemo(() => {
    const set = new Set((q.data ?? []).map((p) => mesChave(p.created_at)));
    return [...set].sort().reverse();
  }, [q.data]);

  const filtrados = useMemo(() => {
    const list = q.data ?? [];
    if (periodo === "todos") return list;
    return list.filter((p) => mesChave(p.created_at) === periodo);
  }, [q.data, periodo]);

  const totalPeriodo = filtrados.reduce((s, p) => s + p.valor, 0);

  // Agrupa por mês (mais recente primeiro) para exibir subtotais.
  const grupos = useMemo(() => {
    const map = new Map<string, PedidoVendido[]>();
    for (const p of filtrados) {
      const k = mesChave(p.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtrados]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> Visão Geral
            </h1>
            <p className="text-sm text-muted-foreground">
              Pedidos vendidos de carregadores — cliente, pedido, valor e mês.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {q.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="h-9 rounded-lg border border-border bg-surface px-3 text-sm capitalize"
            >
              <option value="todos">Todos os períodos</option>
              {meses.map((m) => (
                <option key={m} value={m} className="capitalize">
                  {mesLabel(m)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="glass rounded-2xl p-5 border border-border">
            <div className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-semibold">Pedidos vendidos</div>
            <div className="text-2xl font-display font-bold mt-1">{filtrados.length}</div>
          </div>
          <div className="glass rounded-2xl p-5 border border-border">
            <div className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-semibold">Valor total no período</div>
            <div className="text-2xl font-display font-bold mt-1">{fmtBRL(totalPeriodo)}</div>
          </div>
        </div>

        {q.isLoading && (
          <div className="text-center text-sm text-muted-foreground py-12">Carregando pedidos…</div>
        )}
        {!q.isLoading && filtrados.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">
            Nenhum pedido vendido no período selecionado.
          </div>
        )}

        {grupos.map(([mes, itens]) => {
          const subtotal = itens.reduce((s, p) => s + p.valor, 0);
          return (
            <div key={mes} className="glass rounded-2xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-surface-2/50">
                <h2 className="font-display font-semibold capitalize">{mesLabel(mes)}</h2>
                <div className="text-sm text-muted-foreground">
                  {itens.length} pedido{itens.length !== 1 ? "s" : ""} • <span className="font-semibold text-foreground">{fmtBRL(subtotal)}</span>
                </div>
              </div>
              <div className="divide-y divide-border">
                <div className="hidden sm:grid grid-cols-[110px_1fr_1fr_120px_140px] gap-3 px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  <span>Pedido</span>
                  <span>Nome</span>
                  <span>Cliente</span>
                  <span>Status</span>
                  <span className="text-right">Valor</span>
                </div>
                {itens.map((p) => (
                  <div
                    key={p.id}
                    className="grid sm:grid-cols-[110px_1fr_1fr_120px_140px] gap-1 sm:gap-3 px-5 py-2.5 text-sm items-center"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{p.numero ?? "—"}</span>
                    <span className={cn("truncate", !p.nome && "text-muted-foreground")}>{p.nome ?? "—"}</span>
                    <span className="truncate">{p.cliente_nome}</span>
                    <span className="flex items-center gap-1.5 text-xs">
                      <StatusDot status={p.status as any} /> {p.status}
                    </span>
                    <span className="sm:text-right font-semibold">{fmtBRL(p.valor)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </AppLayout>
  );
}
