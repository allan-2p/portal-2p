import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { BarChart3, Loader2 } from "lucide-react";
import { listarPropostasFn } from "@/lib/propostas.functions";
import { fmtBRL } from "@/lib/carregadores";
import { useCarregadoresProducts } from "@/hooks/use-carregadores";
import { StatusDot } from "@/components/proposta-status-ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/carregadores/visao-geral")({
  head: () => ({
    meta: [
      { title: "Visão Geral — Portal 2P Carregadores" },
      { name: "description", content: "Pedidos vendidos de carregadores por cliente, valor e data, com filtro por mês, trimestre, ano ou intervalo." },
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
  /** Data da compra: quando o pedido saiu de rascunho (fallback: criação). */
  data: string;
  /** Data de faturamento (NF emitida). */
  dataFaturamento: string | null;
  nfNumero: string | null;
  sapOvNumero: string | null;
  codigos: string[];
  nomesItens: string[];
};

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

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

function fmtData(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

type Modo = "todos" | "mes" | "trimestre" | "ano" | "intervalo";
type CampoData = "compra" | "faturamento";

function CarregadoresVisaoGeralPage() {
  const [modo, setModo] = useState<Modo>("todos");
  const [campoData, setCampoData] = useState<CampoData>("compra");
  const [mes, setMes] = useState<string>("");
  const [trimestre, setTrimestre] = useState<string>("");
  const [ano, setAno] = useState<string>("");
  const [de, setDe] = useState<string>("");
  const [ate, setAte] = useState<string>("");

  const produtos = useCarregadoresProducts();

  const q = useQuery({
    queryKey: ["carregadores-visao-geral"],
    queryFn: async (): Promise<PedidoVendido[]> => {
      const data = await listarPropostasFn({
        data: {
          organizacao: "carregadores",
          select:
            "id,numero,nome,cliente_nome,status,totais,itens,created_at,aguardando_pagamento_em,processando_em,faturado_em,nf_numero,sap_ov_numero",
          statusIn: STATUS_VENDIDOS as unknown as string[],
        },
      });
      return (data ?? []).map((r: any) => {
        const itens = Array.isArray(r.itens) ? r.itens : [];
        return {
          id: r.id,
          numero: r.numero ?? null,
          nome: r.nome ?? null,
          cliente_nome: r.cliente_nome ?? "—",
          status: r.status,
          valor: Number(r.totais?.valorTotal ?? r.totais?.total ?? 0),
          data: r.aguardando_pagamento_em ?? r.processando_em ?? r.created_at,
          dataFaturamento: r.faturado_em ?? null,
          nfNumero: r.nf_numero ?? null,
          sapOvNumero: r.sap_ov_numero ?? null,
          codigos: itens.map((i: any) => String(i?.codigo ?? "").trim()).filter(Boolean),
          nomesItens: itens.map((i: any) => norm(i?.nome)).filter(Boolean),
        };
      });
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  /** Só entram pedidos que contenham ao menos um produto do catálogo de carregadores. */
  const vendidos = useMemo(() => {
    const lista = produtos.data ?? [];
    if (!lista.length) return [];
    const codigos = new Set(lista.map((p) => String(p.codigo ?? "").trim()).filter(Boolean));
    const nomes = new Set(lista.map((p) => norm(p.nome)).filter(Boolean));
    return (q.data ?? []).filter(
      (p) =>
        p.codigos.some((c) => codigos.has(c)) ||
        p.nomesItens.some((n) => nomes.has(n)),
    );
  }, [q.data, produtos.data]);

  const meses = useMemo(() => {
    const set = new Set(vendidos.map((p) => mesChave(p.data)));
    return [...set].sort().reverse();
  }, [vendidos]);

  const anos = useMemo(() => {
    const set = new Set(vendidos.map((p) => p.data.slice(0, 4)));
    return [...set].sort().reverse();
  }, [vendidos]);

  const trimestres = useMemo(() => {
    const set = new Set(
      vendidos.map((p) => `${p.data.slice(0, 4)}-T${Math.floor(Number(p.data.slice(5, 7)) / 3.0001) + 1}`),
    );
    return [...set].sort().reverse();
  }, [vendidos]);

  /** Data de referência conforme o filtro escolhido (compra ou faturamento). */
  const dataRef = (p: PedidoVendido) =>
    campoData === "faturamento" ? (p.dataFaturamento ?? p.data) : p.data;

  const filtrados = useMemo(() => {
    return vendidos.filter((p) => {
      const ref = campoData === "faturamento" ? (p.dataFaturamento ?? p.data) : p.data;
      const d = ref.slice(0, 10);
      if (modo === "mes") return !mes || mesChave(ref) === mes;
      if (modo === "ano") return !ano || ref.slice(0, 4) === ano;
      if (modo === "trimestre") {
        if (!trimestre) return true;
        const t = `${ref.slice(0, 4)}-T${Math.floor(Number(ref.slice(5, 7)) / 3.0001) + 1}`;
        return t === trimestre;
      }
      if (modo === "intervalo") {
        if (de && d < de) return false;
        if (ate && d > ate) return false;
        return true;
      }
      return true;
    });
  }, [vendidos, modo, mes, trimestre, ano, de, ate, campoData]);

  const totalPeriodo = filtrados.reduce((s, p) => s + p.valor, 0);

  // Agrupa por mês (mais recente primeiro) para exibir subtotais.
  const grupos = useMemo(() => {
    const map = new Map<string, PedidoVendido[]>();
    for (const p of filtrados) {
      const ref = campoData === "faturamento" ? (p.dataFaturamento ?? p.data) : p.data;
      const k = mesChave(ref);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const da = campoData === "faturamento" ? (a.dataFaturamento ?? a.data) : a.data;
        const db = campoData === "faturamento" ? (b.dataFaturamento ?? b.data) : b.data;
        return da < db ? 1 : -1;
      });
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtrados, campoData]);

  const carregando = q.isLoading || produtos.isLoading;
  const selectCls = "h-9 rounded-lg border border-border bg-surface px-3 text-sm";

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> Visão Geral
            </h1>
            <p className="text-sm text-muted-foreground">
              Pedidos vendidos de carregadores — cliente, pedido, data da compra e valor.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(q.isFetching || produtos.isFetching) && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <select value={modo} onChange={(e) => setModo(e.target.value as Modo)} className={selectCls}>
              <option value="todos">Todos os períodos</option>
              <option value="mes">Por mês</option>
              <option value="trimestre">Por trimestre</option>
              <option value="ano">Por ano</option>
              <option value="intervalo">Intervalo de datas</option>
            </select>

            {modo === "mes" && (
              <select value={mes} onChange={(e) => setMes(e.target.value)} className={cn(selectCls, "capitalize")}>
                <option value="">Todos os meses</option>
                {meses.map((m) => (
                  <option key={m} value={m} className="capitalize">
                    {mesLabel(m)}
                  </option>
                ))}
              </select>
            )}

            {modo === "trimestre" && (
              <select value={trimestre} onChange={(e) => setTrimestre(e.target.value)} className={selectCls}>
                <option value="">Todos os trimestres</option>
                {trimestres.map((t) => (
                  <option key={t} value={t}>
                    {t.split("-")[1]} · {t.slice(0, 4)}
                  </option>
                ))}
              </select>
            )}

            {modo === "ano" && (
              <select value={ano} onChange={(e) => setAno(e.target.value)} className={selectCls}>
                <option value="">Todos os anos</option>
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            )}

            {modo === "intervalo" && (
              <div className="flex items-center gap-2">
                <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={selectCls} />
                <span className="text-sm text-muted-foreground">até</span>
                <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={selectCls} />
              </div>
            )}
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

        {carregando && (
          <div className="text-center text-sm text-muted-foreground py-12">Carregando pedidos…</div>
        )}
        {!carregando && filtrados.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">
            Nenhum pedido de carregadores no período selecionado.
          </div>
        )}

        {grupos.map(([mesK, itens]) => {
          const subtotal = itens.reduce((s, p) => s + p.valor, 0);
          return (
            <div key={mesK} className="glass rounded-2xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-surface-2/50">
                <h2 className="font-display font-semibold capitalize">{mesLabel(mesK)}</h2>
                <div className="text-sm text-muted-foreground">
                  {itens.length} pedido{itens.length !== 1 ? "s" : ""} • <span className="font-semibold text-foreground">{fmtBRL(subtotal)}</span>
                </div>
              </div>
              <div className="divide-y divide-border">
                <div className="hidden sm:grid grid-cols-[100px_100px_1fr_1fr_120px_140px] gap-3 px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  <span>Pedido</span>
                  <span>Compra</span>
                  <span>Nome</span>
                  <span>Cliente</span>
                  <span>Status</span>
                  <span className="text-right">Valor</span>
                </div>
                {itens.map((p) => (
                  <div
                    key={p.id}
                    className="grid sm:grid-cols-[100px_100px_1fr_1fr_120px_140px] gap-1 sm:gap-3 px-5 py-2.5 text-sm items-center"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{p.numero ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">{fmtData(p.data)}</span>
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
