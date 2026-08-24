import { formatPropostaNumero } from "@/lib/sap-numero";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck, Search, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { AccessDenied } from "@/components/access-denied";
import { useInstance } from "@/components/instance-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { mascaraDoc } from "@/lib/cnpj";
import { listCondicoesPagamento } from "@/lib/condicoes-pagamento.functions";
import { analisarCredito, listCreditoAnalises } from "@/lib/credito.functions";
import { CreditoAnexosLista } from "@/components/credito-anexos";
import {
  CREDITO_CONCLUSOES, CREDITO_PRIORIDADES, CREDITO_STATUS,
  creditoStatusTom, fmtBRL, type CreditoAnalise,
} from "@/lib/credito";

export const Route = createFileRoute("/_authenticated/financeiro/credito")({
  head: () => ({
    meta: [
      { title: "Análise de Crédito — Portal 2P" },
      {
        name: "description",
        content:
          "Fila de análise de crédito do Grupo 2P: solicitações dos vendedores, limite aprovado e condição de pagamento a prazo liberada.",
      },
      { property: "og:title", content: "Análise de Crédito — Portal 2P" },
      {
        property: "og:description",
        content: "Solicitações de crédito, limites aprovados e condições a prazo liberadas no portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CreditoPage,
});

type Aba = "abertas" | "concluidas" | "todas";

const ABAS: { id: Aba; label: string; status?: string[] }[] = [
  { id: "abertas", label: "Na fila", status: ["Análise Solicitada", "Em Andamento"] },
  { id: "concluidas", label: "Concluídas", status: ["Análise Concluída"] },
  { id: "todas", label: "Todas" },
];

const dataBR = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

function CreditoPage() {
  const { hasFeature } = useInstance();
  const podeAnalisar = hasFeature("financeiro.credito");

  const qc = useQueryClient();
  const fetchList = useServerFn(listCreditoAnalises);
  const fetchCondicoes = useServerFn(listCondicoesPagamento);
  const analisar = useServerFn(analisarCredito);

  const [aba, setAba] = useState<Aba>("abertas");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<CreditoAnalise | null>(null);

  const statusFiltro = ABAS.find((a) => a.id === aba)?.status;
  const { data: analises, isFetching } = useQuery({
    queryKey: ["credito-analises", aba],
    queryFn: () => fetchList({ data: statusFiltro ? { status: statusFiltro } : {} }),
    enabled: podeAnalisar,
    staleTime: 30_000,
  });

  const { data: condicoes } = useQuery({
    queryKey: ["condicoes-pagamento", "credito"],
    queryFn: () => fetchCondicoes({ data: { somenteCheckout: true } }),
    enabled: podeAnalisar,
    staleTime: 5 * 60_000,
  });

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const rows = analises ?? [];
    if (!t) return rows;
    return rows.filter((r) =>
      [r.numero, r.clienteNome, r.clienteDoc, r.solicitadoPorNome]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t)),
    );
  }, [analises, busca]);

  const salvar = useMutation({
    mutationFn: (input: Parameters<typeof analisarCredito>[0]["data"]) => analisar({ data: input }),
    onSuccess: () => {
      toast.success("Análise atualizada.");
      setAberta(null);
      qc.invalidateQueries({ queryKey: ["credito-analises"] });
      qc.invalidateQueries({ queryKey: ["credito-vigente"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!podeAnalisar) {
    return (
      <AppLayout>
        <AccessDenied
          title="Análise de Crédito restrita"
          description="Esta fila é do Financeiro. Peça a um administrador o acesso “Financeiro • Análise de Crédito”."
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-[1200px] mx-auto space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Financeiro</div>
            <h1 className="text-2xl sm:text-3xl font-bold mt-1 flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" /> Análise de Crédito
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
              Solicitações abertas pelos vendedores no cadastro do cliente. O limite liberado aqui é o
              que autoriza condição de pagamento a prazo no checkout.
            </p>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => qc.invalidateQueries({ queryKey: ["credito-analises"] })}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {ABAS.map((a) => (
            <Button key={a.id} size="sm" variant={aba === a.id ? "default" : "outline"} onClick={() => setAba(a.id)}>
              {a.label}
            </Button>
          ))}
          <div className="relative ml-auto w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por número, cliente ou vendedor"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Número</th>
                  <th className="text-left p-3">Cliente</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Prioridade</th>
                  <th className="text-right p-3">Solicitado</th>
                  <th className="text-right p-3">Aprovado</th>
                  <th className="text-left p-3">Validade</th>
                  <th className="text-left p-3">Vendedor</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {isFetching && !analises && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando…
                    </td>
                  </tr>
                )}
                {analises && lista.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      Nenhuma solicitação nesta visão.
                    </td>
                  </tr>
                )}
                {lista.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-2/60">
                    <td className="p-3 font-mono text-xs">{r.numero}</td>
                    <td className="p-3">
                      <div className="font-medium">{r.clienteNome || "—"}</div>
                      <div className="text-xs text-muted-foreground">{mascaraDoc(r.clienteDoc)}</div>
                    </td>
                    <td className="p-3">
                      <Badge variant={creditoStatusTom(r.status)}>{r.status}</Badge>
                      {r.conclusao && (
                        <Badge className="ml-1" variant={r.conclusao === "Liberado" ? "default" : "destructive"}>
                          {r.conclusao}
                        </Badge>
                      )}
                    </td>
                    <td className="p-3">{r.prioridade}</td>
                    <td className="p-3 text-right">{fmtBRL(r.creditoSolicitado)}</td>
                    <td className="p-3 text-right">{fmtBRL(r.creditoAprovado)}</td>
                    <td className="p-3">{dataBR(r.validade)}</td>
                    <td className="p-3 text-xs text-muted-foreground">{r.solicitadoPorNome || "—"}</td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => setAberta(r)}>
                        Analisar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AnalisarDialog
        analise={aberta}
        condicoes={(condicoes ?? []) as { codigo: string; descricao: string }[]}
        salvando={salvar.isPending}
        onClose={() => setAberta(null)}
        onSalvar={(v) => salvar.mutate(v)}
      />
    </AppLayout>
  );
}

function AnalisarDialog({
  analise, condicoes, salvando, onClose, onSalvar,
}: {
  analise: CreditoAnalise | null;
  condicoes: { codigo: string; descricao: string }[];
  salvando: boolean;
  onClose: () => void;
  onSalvar: (v: {
    id: string; status: string; prioridade?: string | null; conclusao?: string | null;
    restricao?: boolean | null; condicaoAprovada?: string | null; creditoAprovado?: number | null;
    serasa?: number | null; validade?: string | null; observacoesFinanceiro?: string | null;
    responsavelAnalise?: string | null; autorizacaoDiretoria?: string | null;
  }) => void;
}) {
  const [form, setForm] = useState<{
    status: string; prioridade: string; conclusao: string; restricao: boolean;
    condicaoAprovada: string; creditoAprovado: string; serasa: string; validade: string; obs: string;
    responsavel: string; diretoria: string;
  } | null>(null);

  const atual = form ?? (analise
    ? {
        status: analise.status,
        prioridade: analise.prioridade,
        conclusao: analise.conclusao ?? "",
        restricao: !!analise.restricao,
        condicaoAprovada: analise.condicaoAprovada ?? analise.condicaoSolicitada ?? "",
        creditoAprovado: analise.creditoAprovado != null ? String(analise.creditoAprovado) : "",
        serasa: analise.serasa != null ? String(analise.serasa) : "",
        validade: analise.validade ?? "",
        obs: analise.observacoesFinanceiro ?? "",
        responsavel: analise.responsavelAnalise ?? "",
        diretoria: analise.autorizacaoDiretoria ?? "",
      }
    : null);

  const set = (patch: Partial<NonNullable<typeof atual>>) =>
    atual && setForm({ ...atual, ...patch });

  const fechar = () => { setForm(null); onClose(); };

  return (
    <Dialog open={!!analise} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        {analise && atual && (
          <>
            <DialogHeader className="text-left">
              <DialogTitle className="pr-6">
                {analise.numero} · {analise.clienteNome || mascaraDoc(analise.clienteDoc)}
              </DialogTitle>
              <DialogDescription>
                Solicitado por {analise.solicitadoPorNome || "—"} em{" "}
                {new Date(analise.solicitadoEm).toLocaleString("pt-BR")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-surface/40 p-3 text-sm space-y-1">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Crédito solicitado</span>
                  <span className="font-medium">{fmtBRL(analise.creditoSolicitado)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Condição solicitada</span>
                  <span className="font-medium">{analise.condicaoSolicitada || "—"}</span>
                </div>
                {analise.propostaNumero && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Proposta</span>
                    <span className="font-medium">#{formatPropostaNumero(analise.propostaNumero)}</span>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Contato principal</span>
                  <span className="font-medium text-right">
                    {analise.contatoNome || "—"}
                    {(analise.contatoEmail || analise.contatoTelefone) && (
                      <span className="block text-xs text-muted-foreground">
                        {[analise.contatoEmail, analise.contatoTelefone].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </div>
                {analise.empresaSecundaria && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Empresa secundária</span>
                    <span className="font-medium text-right">
                      {analise.empresaSecundariaNome || "—"}
                      <span className="block text-xs text-muted-foreground">
                        {analise.empresaSecundariaDoc ? mascaraDoc(analise.empresaSecundariaDoc) : ""}
                      </span>
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Anexos</span>
                  <span className="text-right"><CreditoAnexosLista anexos={analise.anexos ?? []} /></span>
                </div>
                {analise.observacoesVendedor && (
                  <div className="pt-1 text-muted-foreground">
                    Observações do vendedor: <span className="text-foreground">{analise.observacoesVendedor}</span>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={atual.status} onValueChange={(v) => set({ status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CREDITO_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Prioridade</Label>
                  <Select value={atual.prioridade} onValueChange={(v) => set({ prioridade: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CREDITO_PRIORIDADES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {atual.status === "Análise Concluída" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Conclusão</Label>
                      <Select value={atual.conclusao} onValueChange={(v) => set({ conclusao: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {CREDITO_CONCLUSOES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Crédito aprovado (R$)</Label>
                      <Input
                        type="number" min="0" step="0.01" inputMode="decimal"
                        value={atual.creditoAprovado}
                        onChange={(e) => set({ creditoAprovado: e.target.value })}
                        disabled={atual.conclusao !== "Liberado"}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Condição aprovada</Label>
                      <Select
                        value={atual.condicaoAprovada || "__none"}
                        onValueChange={(v) => set({ condicaoAprovada: v === "__none" ? "" : v })}
                        disabled={atual.conclusao !== "Liberado"}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Sem restrição de condição</SelectItem>
                          {condicoes.map((c) => (
                            <SelectItem key={c.codigo} value={c.descricao}>
                              {c.codigo} · {c.descricao}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Validade do crédito</Label>
                      <Input
                        type="date" value={atual.validade}
                        onChange={(e) => set({ validade: e.target.value })}
                        disabled={atual.conclusao !== "Liberado"}
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label>Pontuação Serasa</Label>
                  <Input
                    type="number" min="0" step="1" inputMode="numeric"
                    value={atual.serasa} onChange={(e) => set({ serasa: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <div className="text-sm font-medium">Restrição encontrada</div>
                    <div className="text-xs text-muted-foreground">Protesto, pendência ou negativação</div>
                  </div>
                  <Switch checked={atual.restricao} onCheckedChange={(v) => set({ restricao: v })} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Responsável pela análise{atual.status === "Análise Concluída" ? " *" : ""}</Label>
                  <Input
                    value={atual.responsavel}
                    onChange={(e) => set({ responsavel: e.target.value })}
                    placeholder="Analista do Financeiro"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Autorização da diretoria</Label>
                  <Input
                    value={atual.diretoria}
                    onChange={(e) => set({ diretoria: e.target.value })}
                    placeholder="Quem autorizou (se houve)"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Observações do Financeiro</Label>
                <Textarea
                  rows={3} value={atual.obs}
                  onChange={(e) => set({ obs: e.target.value })}
                  placeholder="Parecer da análise, condições e ressalvas."
                />
              </div>

              {atual.status === "Análise Concluída" && atual.conclusao === "Liberado" && !atual.validade && (
                <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-warning" />
                  <span>Sem validade, o crédito fica liberado por tempo indeterminado.</span>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:justify-end">
              <Button variant="outline" onClick={fechar}>Cancelar</Button>
              <Button
                className="gap-2"
                disabled={salvando}
                onClick={() =>
                  onSalvar({
                    id: analise.id,
                    status: atual.status,
                    prioridade: atual.prioridade,
                    conclusao: atual.conclusao || null,
                    restricao: atual.restricao,
                    condicaoAprovada: atual.condicaoAprovada || null,
                    creditoAprovado: atual.creditoAprovado === "" ? null : Number(atual.creditoAprovado),
                    serasa: atual.serasa === "" ? null : Number(atual.serasa),
                    validade: atual.validade || null,
                    observacoesFinanceiro: atual.obs || null,
                    responsavelAnalise: atual.responsavel || null,
                    autorizacaoDiretoria: atual.diretoria || null,
                  })
                }
              >
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar análise
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
