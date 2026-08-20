import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Calculator, CheckCircle2, Cloud, History, Loader2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  criarOrdemVendaSapFn,
  sincronizarPedidoSalesforceFn,
  statusIntegracoesPedidoFn,
} from "@/lib/propostas.functions";
import { listIntegrationLogs, type IntegrationLogRow } from "@/lib/integration-logs.functions";

function dataHora(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function Linha({ rot, val }: { rot: string; val?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{rot}</span>
      <span className="break-words text-right font-medium">{val && String(val).trim() ? val : "—"}</span>
    </div>
  );
}

function Estado({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) return <Badge variant="outline">{label}</Badge>;
  return (
    <Badge variant={ok ? "secondary" : "destructive"} className="gap-1">
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </Badge>
  );
}

function resumoSeguro(detail: IntegrationLogRow["detail"]) {
  if (!detail) return null;
  const fonte = (detail["payload_resumo"] ?? detail["payload"] ?? null) as Record<string, unknown> | null;
  if (!fonte || typeof fonte !== "object" || Array.isArray(fonte)) return null;
  const permitidos = ["filial", "lista_preco", "tipo", "modalidade_frete", "uf", "itens", "testrun"];
  const seguro = Object.fromEntries(permitidos.filter((k) => fonte[k] !== undefined).map((k) => [k, fonte[k]]));
  return Object.keys(seguro).length ? JSON.stringify(seguro, null, 2) : null;
}

/**
 * Integrações da linha do pedido: situação no SAP (ordem de venda) e no
 * Salesforce (oportunidade), com reenvio manual e histórico de logs.
 */
export function PedidoIntegracoesDialog({
  propostaId,
  open,
  onOpenChange,
}: {
  propostaId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const statusFn = useServerFn(statusIntegracoesPedidoFn);
  const sapFn = useServerFn(criarOrdemVendaSapFn);
  const sfFn = useServerFn(sincronizarPedidoSalesforceFn);
  const listar = useServerFn(listIntegrationLogs);
  const [limit, setLimit] = useState(10);

  const status = useQuery({
    queryKey: ["pedido-integracoes", propostaId],
    queryFn: () => statusFn({ data: { propostaId: propostaId! } }),
    enabled: Boolean(open && propostaId),
  });

  const logs = useQuery({
    queryKey: ["pedido-integracoes-logs", propostaId, limit],
    queryFn: () => listar({ data: { propostaId: propostaId!, limit } }),
    enabled: Boolean(open && propostaId),
  });

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ["pedido-integracoes", propostaId] });
    qc.invalidateQueries({ queryKey: ["pedido-integracoes-logs", propostaId] });
    qc.invalidateQueries({ queryKey: ["propostas"] });
  };

  const sap = useMutation({
    mutationFn: async (opts: { testrun?: boolean; forcar?: boolean }) =>
      sapFn({ data: { propostaId: propostaId!, ...opts } }),
    onSuccess: (r: any) => {
      toast.success(r?.vbeln ? `Ordem de venda ${r.vbeln} no SAP.` : (r?.mensagem ?? "SAP respondeu com sucesso."));
      atualizar();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha no envio ao SAP."),
  });

  const sf = useMutation({
    mutationFn: async (forcar: boolean) => sfFn({ data: { propostaId: propostaId!, forcar } }),
    onSuccess: (r: any) => {
      toast.success(r?.mensagem ?? "Pedido enviado ao Salesforce.");
      atualizar();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha no envio ao Salesforce."),
  });

  const d = status.data;
  const rows = (logs.data?.rows ?? []) as IntegrationLogRow[];
  const total = logs.data?.total ?? 0;
  const ocupado = sap.isPending || sf.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Integrações e auditoria {d?.numero ? `#${d.numero}` : ""}
          </DialogTitle>
          <DialogDescription>
            {d?.cliente_nome ?? "Situação das integrações e histórico técnico do pedido."}
          </DialogDescription>
        </DialogHeader>

        {status.isLoading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando situação…
          </div>
        )}

        {d && (
          <Tabs defaultValue="integracoes" className="space-y-4">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="integracoes" className="gap-2"><Cloud className="h-4 w-4" /> Integrações</TabsTrigger>
              <TabsTrigger value="auditoria" className="gap-2"><History className="h-4 w-4" /> Auditoria</TabsTrigger>
            </TabsList>
            <TabsContent value="integracoes" className="space-y-4">
            {/* SAP */}
            <section className="space-y-2 rounded-xl border border-border bg-surface/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-primary">SAP • Ordem de venda</div>
                <Estado
                  ok={d.sap.status ? d.sap.status === "criada" : null}
                  label={d.sap.status === "criada" ? "Criada" : d.sap.status === "erro" ? "Erro" : "Não enviada"}
                />
              </div>
              <Linha rot="Nº da ordem (VBELN)" val={d.sap.numero} />
              <Linha rot="Enviado em" val={dataHora(d.sap.enviado_em)} />
              {d.sap.status === "erro" && d.sap.mensagem ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                  <p className="font-semibold">Retorno do SAP</p>
                  <p className="mt-0.5 break-words">{d.sap.mensagem}</p>
                </div>
              ) : (
                <Linha rot="Mensagem" val={d.sap.mensagem} />
              )}

              {d.validacao && !d.validacao.ok && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-sm">
                  <p className="font-semibold text-destructive">Pendências que impedem o envio</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-destructive">
                    {d.validacao.pendencias.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              {d.validacao?.avisos?.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/40 p-2 text-sm">
                  <p className="font-semibold">Avisos</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                    {d.validacao.avisos.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" disabled={ocupado || !d.validacao?.ok} onClick={() => sap.mutate({ testrun: true })}>
                  {sap.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                  Validar (test run)
                </Button>
                <Button size="sm" disabled={ocupado || !d.validacao?.ok} onClick={() => sap.mutate({})}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" /> Enviar / reenviar
                </Button>
                {d.sap.numero && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={ocupado || !d.validacao?.ok}
                    onClick={() => sap.mutate({ forcar: true })}
                  >
                    Forçar novo envio
                  </Button>
                )}
              </div>
            </section>

            {/* Salesforce */}
            <section className="space-y-2 rounded-xl border border-border bg-surface/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary">
                  <Cloud className="h-3.5 w-3.5" /> Salesforce • Oportunidade
                </div>
                <Estado
                  ok={d.salesforce.status ? d.salesforce.status === "sincronizado" : null}
                  label={
                    d.salesforce.status === "sincronizado"
                      ? "Sincronizado"
                      : d.salesforce.status === "erro"
                        ? "Erro"
                        : "Não enviado"
                  }
                />
              </div>
              <Linha rot="Oportunidade" val={d.salesforce.opportunityId} />
              <Linha rot="Conta" val={d.salesforce.accountId} />
              <Linha rot="Enviado em" val={dataHora(d.salesforce.enviado_em)} />
              <Linha rot="Mensagem" val={d.salesforce.mensagem} />
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" disabled={ocupado} onClick={() => sf.mutate(false)}>
                  {sf.isPending ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  )}
                  Enviar / atualizar
                </Button>
                {d.salesforce.opportunityId && (
                  <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => sf.mutate(true)}>
                    Forçar nova sincronização
                  </Button>
                )}
              </div>
            </section>

            </TabsContent>
            <TabsContent value="auditoria" className="space-y-4">
            <section className="space-y-2 rounded-xl border border-border bg-surface/40 p-3">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary">
                <History className="h-3.5 w-3.5" /> Tentativas e eventos deste pedido
              </div>
              {d.organizacao === "carregadores" && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold"><Calculator className="h-4 w-4" /> Memória fiscal e de cálculo</p>
                    <p className="text-xs text-muted-foreground">ICMS, DIFAL, CMV e comissão item a item.</p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/carregadores/propostas/auditoria" search={{ id: propostaId ?? undefined }}>Abrir cálculo</Link>
                  </Button>
                </div>
              )}
              {logs.isLoading && (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
              )}
              {!logs.isLoading && rows.length === 0 && (
                <p className="py-1 text-sm text-muted-foreground">Nenhum registro de integração para este pedido.</p>
              )}
              <ul className="space-y-2">
                {rows.map((l) => (
                  <li key={l.id} className="rounded-lg border border-border/60 p-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={l.level === "error" ? "destructive" : l.level === "warn" ? "outline" : "secondary"}
                        className="text-[10px]"
                      >
                        {l.level === "error" ? "Erro" : l.level === "warn" ? "Atenção" : "OK"}
                      </Badge>
                      <span className="font-medium">{l.slug} · {l.event}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{dataHora(l.created_at)}</span>
                    </div>
                    {l.message && <p className="mt-1 break-words text-muted-foreground">{l.message}</p>}
                    {l.duration_ms !== null && <p className="mt-1 text-xs text-muted-foreground">Duração: {l.duration_ms} ms</p>}
                    {resumoSeguro(l.detail) && (
                      <details className="mt-2 rounded-md bg-muted/50 p-2">
                        <summary className="cursor-pointer text-xs font-semibold">Payload resumido</summary>
                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{resumoSeguro(l.detail)}</pre>
                      </details>
                    )}
                    {l.level !== "info" && l.detail?.["resposta"] && (
                      <details className="mt-2 rounded-md border border-warning/40 bg-warning/10 p-2">
                        <summary className="flex cursor-pointer items-center gap-1 text-xs font-semibold"><AlertTriangle className="h-3 w-3" /> Resposta / erro técnico</summary>
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">{String(l.detail["resposta"])}</pre>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
              {rows.length < total && (
                <Button size="sm" variant="ghost" onClick={() => setLimit((v) => v + 10)}>
                  Ver mais ({total - rows.length})
                </Button>
              )}
            </section>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
