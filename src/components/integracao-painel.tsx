import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IntegrationLogsPanel } from "@/components/integration-logs";
import {
  carregarPainelIntegracaoFn,
  executarJobIntegracaoFn,
  type FluxoSaude,
  type PendenciaGrupo,
  type PendenciaItem,
} from "@/lib/integracoes-paineis.functions";
import { criarOrdemVendaSapFn, sincronizarPedidoSalesforceFn } from "@/lib/propostas.functions";
import { reenviarClienteFn } from "@/lib/clientes.functions";
import { fluxosDoPainel, type Campo, type CampoStatus, type FluxoDic } from "@/lib/integracoes-dicionario";

const dataHora = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

function Card({ children, tom }: { children: React.ReactNode; tom: "ok" | "erro" | "alerta" | "neutro" }) {
  const cor =
    tom === "erro"
      ? "border-destructive/40 bg-destructive/5"
      : tom === "alerta"
        ? "border-amber-500/40 bg-amber-500/5"
        : tom === "ok"
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-border bg-surface-2";
  return <div className={`rounded-xl border p-4 space-y-2 ${cor}`}>{children}</div>;
}

function CardFluxo({ f }: { f: FluxoSaude }) {
  const cronParado =
    f.cronEsperadoHoras !== null &&
    (f.horasDesdeUltima === null || f.horasDesdeUltima > f.cronEsperadoHoras * 2);
  const tom = f.erros24h > 0 ? "erro" : cronParado ? "alerta" : f.ultimo.ok ? "ok" : "neutro";
  const Icone = tom === "erro" ? XCircle : tom === "alerta" ? AlertTriangle : tom === "ok" ? CheckCircle2 : Clock;

  return (
    <Card tom={tom}>
      <div className="flex items-start gap-2">
        <Icone
          className={`h-4 w-4 mt-0.5 shrink-0 ${
            tom === "erro"
              ? "text-destructive"
              : tom === "alerta"
                ? "text-amber-500"
                : tom === "ok"
                  ? "text-emerald-500"
                  : "text-muted-foreground"
          }`}
        />
        <div className="min-w-0">
          <div className="font-semibold text-sm">{f.titulo}</div>
          <div className="text-[11px] text-muted-foreground font-mono break-all">{f.chamada}</div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div>
          <dt className="text-muted-foreground">24h</dt>
          <dd className="font-medium">
            {f.execucoes24h} registro{f.execucoes24h === 1 ? "" : "s"} · {f.erros24h} erro
            {f.erros24h === 1 ? "" : "s"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">7 dias</dt>
          <dd className="font-medium">
            {f.execucoes7d} · {f.erros7d} erro{f.erros7d === 1 ? "" : "s"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Último</dt>
          <dd className="font-medium">
            {dataHora(f.ultimo.em)}
            {f.cronEsperadoHoras !== null && (
              <span className="text-muted-foreground font-normal">
                {" "}
                · esperado a cada {f.cronEsperadoHoras}h
              </span>
            )}
          </dd>
        </div>
      </dl>
      {f.ultimo.mensagem && (
        <p className="text-xs text-muted-foreground break-words line-clamp-3">{f.ultimo.mensagem}</p>
      )}
    </Card>
  );
}

function Acao({ item, painel }: { item: PendenciaItem; painel: "sap" | "salesforce" }) {
  const qc = useQueryClient();
  const criarOv = useServerFn(criarOrdemVendaSapFn);
  const syncPedido = useServerFn(sincronizarPedidoSalesforceFn);
  const reenviarCliente = useServerFn(reenviarClienteFn);
  const rodarJob = useServerFn(executarJobIntegracaoFn);

  const m = useMutation({
    mutationFn: async () => {
      if (item.acao === "ov" && item.propostaId) {
        return criarOv({ data: { propostaId: item.propostaId, forcar: true } });
      }
      if (item.acao === "salesforce-pedido" && item.propostaId) {
        return syncPedido({ data: { propostaId: item.propostaId, forcar: true } });
      }
      if ((item.acao === "cliente" || item.acao === "salesforce-cliente") && item.clienteId) {
        const instancia = item.instancia === "carregadores" ? "carregadores" : "solar";
        return reenviarCliente({
          data: {
            instancia,
            id: item.clienteId,
            alvos: [item.acao === "cliente" ? "sap" : "salesforce"],
          },
        });
      }
      if (item.acao === "cron" && item.job) return rodarJob({ data: { job: item.job as never } });
      throw new Error("Nada a reprocessar neste item.");
    },
    onSuccess: (r: any) => {
      // Reprocessos que não lançam (SAP/Salesforce) devolvem ok=false.
      if (r && r.ok === false) toast.error(r?.mensagem ?? "O reprocessamento falhou.", { duration: 12000 });
      else toast.success("Reprocessamento executado");
      qc.invalidateQueries({ queryKey: ["painel-integracao", painel] });
      qc.invalidateQueries({ queryKey: ["integration-logs"] });
      qc.invalidateQueries({ queryKey: ["job-runs"] });
    },

    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha no reprocessamento"),
  });

  if (!item.acao) return null;
  const rotulo =
    item.acao === "ov"
      ? "Reenviar ao SAP"
      : item.acao === "cliente"
        ? "Reenviar cadastro"
        : item.acao === "cron"
          ? "Executar agora"
          : "Sincronizar";

  return (
    <Button size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
      {m.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
      {rotulo}
    </Button>
  );
}

function ItemPendencia({ item, painel }: { item: PendenciaItem; painel: "sap" | "salesforce" }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="border-t border-border first:border-t-0 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-medium">{item.titulo}</div>
          {item.subtitulo && <div className="text-xs text-muted-foreground">{item.subtitulo}</div>}
          {item.mensagem && (
            <p className="text-xs text-destructive/90 mt-1 break-words whitespace-pre-wrap">{item.mensagem}</p>
          )}
          <div className="text-[11px] text-muted-foreground mt-1">{dataHora(item.em)}</div>
        </div>
        <div className="flex items-center gap-2">
          {(item.propostaId || item.clienteId) && (
            <Button size="sm" variant="ghost" onClick={() => setAberto((v) => !v)}>
              {aberto ? <ChevronDown className="h-3.5 w-3.5 mr-1" /> : <ChevronRight className="h-3.5 w-3.5 mr-1" />}
              Auditoria
            </Button>
          )}
          <Acao item={item} painel={painel} />
        </div>
      </div>
      {aberto && (
        <IntegrationLogsPanel
          {...(item.propostaId ? { propostaId: item.propostaId } : {})}
          {...(item.clienteId ? { clienteId: item.clienteId } : {})}
          title="Payload enviado e resposta recebida"
        />
      )}
    </div>
  );
}

function GrupoPendencia({ g, painel }: { g: PendenciaGrupo; painel: "sap" | "salesforce" }) {
  const [aberto, setAberto] = useState(g.itens.length > 0 && g.itens.length <= 10);
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 hover:bg-surface-2"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold flex items-center gap-2">
            {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {g.titulo}
            <span
              className={`text-xs rounded-full px-2 py-0.5 border ${
                g.itens.length > 0
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
              }`}
            >
              {g.itens.length}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 ml-6">{g.descricao}</p>
        </div>
      </button>
      {aberto && (
        <div className="px-4 pb-3">
          {g.erro && <p className="text-xs text-destructive py-2">{g.erro}</p>}
          {!g.erro && g.itens.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">Nenhuma pendência.</p>
          )}
          {g.itens.map((i) => (
            <ItemPendencia key={i.id} item={i} painel={painel} />
          ))}
        </div>
      )}
    </div>
  );
}

const CAMPO_TOM: Record<CampoStatus, string> = {
  implementado: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  "novo-portal": "border-sky-500/30 bg-sky-500/10 text-sky-600",
  "nao-implementado": "border-amber-500/30 bg-amber-500/10 text-amber-600",
};
const CAMPO_ROTULO: Record<CampoStatus, string> = {
  implementado: "em uso",
  "novo-portal": "novo no portal",
  "nao-implementado": "não usado ainda",
};

function LinhaCampo({ c }: { c: Campo }) {
  return (
    <tr className="border-t border-border align-top">
      <td className="py-2 pr-3 font-mono text-[11px] whitespace-nowrap">{c.campo}</td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">{c.origem}</td>
      <td className="py-2">
        <span className={`text-[10px] rounded-full border px-2 py-0.5 whitespace-nowrap ${CAMPO_TOM[c.status]}`}>
          {CAMPO_ROTULO[c.status]}
        </span>
      </td>
    </tr>
  );
}

function FluxoDicionario({ f }: { f: FluxoDic }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full text-left px-4 py-3 hover:bg-surface-2"
      >
        <div className="text-sm font-semibold flex items-center gap-2">
          {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {f.titulo}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 ml-6 font-mono break-all">{f.chamada}</p>
      </button>
      {aberto && (
        <div className="px-4 pb-4 space-y-4">
          <div className="text-xs space-y-1">
            <p>
              <span className="text-muted-foreground">Quando roda: </span>
              {f.gatilho}
            </p>
            <ul className="list-disc ml-5 text-muted-foreground space-y-0.5">
              {f.operacoes.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
            <div className="grid sm:grid-cols-3 gap-2 pt-2">
              <p>
                <span className="text-emerald-600 font-medium">OK: </span>
                {f.estados.ok}
              </p>
              <p>
                <span className="text-amber-600 font-medium">Pendente: </span>
                {f.estados.pendente}
              </p>
              <p>
                <span className="text-destructive font-medium">Erro: </span>
                {f.estados.erro}
              </p>
            </div>
          </div>

          {f.grupos.map((g) => (
            <div key={g.titulo}>
              <div className="text-xs font-semibold">
                {g.titulo}
                {g.estrutura && <span className="text-muted-foreground font-mono ml-2">{g.estrutura}</span>}
              </div>
              <table className="w-full mt-1">
                <tbody>
                  {g.campos.map((c) => (
                    <LinhaCampo key={`${g.titulo}-${c.campo}`} c={c} />
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <div>
            <div className="text-xs font-semibold">O que voltamos a ler da resposta</div>
            <table className="w-full mt-1">
              <tbody>
                {f.retornos.map((c) => (
                  <LinhaCampo key={`ret-${c.campo}`} c={c} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** Painel de operação de uma integração: saúde, pendências e dicionário de campos. */
export function IntegracaoPainel({ painel }: { painel: "sap" | "salesforce" }) {
  const carregar = useServerFn(carregarPainelIntegracaoFn);
  const q = useQuery({
    queryKey: ["painel-integracao", painel],
    queryFn: () => carregar({ data: { painel } }),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const dic = fluxosDoPainel(painel);
  const totalPendencias = (q.data?.pendencias ?? []).reduce((a, g) => a + g.itens.length, 0);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold">Saúde dos fluxos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Execuções e erros nas últimas 24 horas e nos últimos 7 dias.
              {q.data ? ` Atualizado em ${dataHora(q.data.geradoEm)}.` : ""}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${q.isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>

        {q.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando painel…
          </div>
        )}
        {q.error && (
          <p className="text-sm text-destructive">
            {q.error instanceof Error ? q.error.message : "Falha ao carregar o painel."}
          </p>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(q.data?.fluxos ?? []).map((f) => (
            <CardFluxo key={f.id} f={f} />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 space-y-3">
        <div>
          <h2 className="font-semibold">
            Pendências
            {q.data && (
              <span className="text-xs font-normal text-muted-foreground ml-2">
                {totalPendencias} item{totalPendencias === 1 ? "" : "s"} exigindo ação
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cada item mostra o motivo real e permite reprocessar sem sair da tela.
          </p>
        </div>
        {(q.data?.pendencias ?? []).map((g) => (
          <GrupoPendencia key={g.id} g={g} painel={painel} />
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 space-y-3">
        <div>
          <h2 className="font-semibold">Dicionário dos campos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            O que o portal envia e o que lê de volta em cada chamada, com a regra de preenchimento de cada campo.
          </p>
        </div>
        {dic.map((f) => (
          <FluxoDicionario key={f.id} f={f} />
        ))}
      </section>
    </div>
  );
}
