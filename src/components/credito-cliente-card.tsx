import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck, Plus, AlertTriangle, Cloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { listCondicoesPagamento } from "@/lib/condicoes-pagamento.functions";
import {
  getCreditoHistoricoSf, listCreditoAnalises, solicitarCredito, cancelarCredito,
} from "@/lib/credito.functions";
import {
  CREDITO_PRIORIDADES, CREDITO_STATUS_ABERTOS, creditoStatusTom, fmtBRL, type CreditoAnexo,
} from "@/lib/credito";
import { CreditoAnexosUpload } from "@/components/credito-anexos";
import { Switch } from "@/components/ui/switch";

const dataBR = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

/**
 * Bloco de Análise de Crédito no cadastro do cliente: solicitações do portal
 * (fila do Financeiro) mais o histórico do objeto de crédito do Salesforce.
 */
export function CreditoClienteCard({
  instancia,
  clienteId,
  clienteDoc,
  clienteNome,
}: {
  instancia: "solar" | "carregadores";
  clienteId?: string | null;
  clienteDoc: string;
  clienteNome?: string | null;
}) {
  const qc = useQueryClient();
  const doc = String(clienteDoc ?? "").replace(/\D/g, "");
  const fetchAnalises = useServerFn(listCreditoAnalises);
  const fetchSf = useServerFn(getCreditoHistoricoSf);
  const criar = useServerFn(solicitarCredito);
  const cancelar = useServerFn(cancelarCredito);

  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState("");
  const [condicao, setCondicao] = useState("");
  const [prioridade, setPrioridade] = useState<string>("Normal");
  const [obs, setObs] = useState("");
  const [contatoNome, setContatoNome] = useState("");
  const [contatoEmail, setContatoEmail] = useState("");
  const [contatoTel, setContatoTel] = useState("");
  const [temSecundaria, setTemSecundaria] = useState(false);
  const [secNome, setSecNome] = useState("");
  const [secDoc, setSecDoc] = useState("");
  const [anexos, setAnexos] = useState<CreditoAnexo[]>([]);

  const analises = useQuery({
    queryKey: ["credito-analises", "cliente", doc],
    queryFn: () => fetchAnalises({ data: { doc } }),
    enabled: !!doc,
  });

  const sf = useQuery({
    queryKey: ["credito-sf", doc],
    queryFn: () => fetchSf({ data: { doc } }),
    enabled: !!doc,
    staleTime: 5 * 60_000,
  });

  const condicoes = useQuery({
    queryKey: ["condicoes-pagamento", "checkout"],
    queryFn: () => listCondicoesPagamento({ data: { somenteCheckout: true } }),
    staleTime: 5 * 60_000,
  });

  const emAberto = (analises.data ?? []).find((a) => CREDITO_STATUS_ABERTOS.includes(a.status));

  const podeEnviar =
    !!contatoNome.trim() && !!obs.trim() && (!temSecundaria || (!!secNome.trim() && !!secDoc.trim()));

  const enviar = useMutation({
    mutationFn: () =>
      criar({
        data: {
          instancia,
          clienteDoc: doc,
          clienteNome: clienteNome ?? null,
          clienteId: clienteId ?? null,
          creditoSolicitado: valor === "" ? null : Number(valor),
          condicaoSolicitada: condicao || null,
          prioridade,
          observacoesVendedor: obs || null,
          contatoNome: contatoNome || null,
          contatoEmail: contatoEmail || null,
          contatoTelefone: contatoTel || null,
          empresaSecundaria: temSecundaria,
          empresaSecundariaNome: temSecundaria ? secNome : null,
          empresaSecundariaDoc: temSecundaria ? secDoc : null,
          anexos,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Solicitação ${r.numero} enviada ao Financeiro.`);
      setAberto(false);
      setValor(""); setCondicao(""); setPrioridade("Normal"); setObs("");
      setContatoNome(""); setContatoEmail(""); setContatoTel("");
      setTemSecundaria(false); setSecNome(""); setSecDoc(""); setAnexos([]);
      qc.invalidateQueries({ queryKey: ["credito-analises"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelarMut = useMutation({
    mutationFn: (id: string) => cancelar({ data: { id } }),
    onSuccess: () => {
      toast.success("Solicitação cancelada.");
      qc.invalidateQueries({ queryKey: ["credito-analises"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-xl border border-border bg-surface/40 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" /> Análise de crédito
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={!doc} onClick={() => setAberto(true)}>
          <Plus className="h-3.5 w-3.5" /> Solicitar crédito
        </Button>
      </div>

      {emAberto && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2.5 text-sm">
          <Badge variant={creditoStatusTom(emAberto.status)}>{emAberto.status}</Badge>
          <span className="font-mono text-xs">{emAberto.numero}</span>
          <span className="text-muted-foreground">
            solicitado {fmtBRL(emAberto.creditoSolicitado)} · {dataBR(emAberto.solicitadoEm)}
          </span>
          <Button
            size="sm" variant="ghost" className="ml-auto text-destructive"
            disabled={cancelarMut.isPending}
            onClick={() => cancelarMut.mutate(emAberto.id)}
          >
            Cancelar
          </Button>
        </div>
      )}

      {analises.isLoading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando análises…
        </div>
      ) : (analises.data ?? []).length === 0 ? (
        <div className="text-sm text-muted-foreground">Nenhuma análise registrada no portal.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left py-1.5">Número</th>
                <th className="text-left py-1.5">Status</th>
                <th className="text-right py-1.5">Aprovado</th>
                <th className="text-left py-1.5">Condição</th>
                <th className="text-left py-1.5">Validade</th>
              </tr>
            </thead>
            <tbody>
              {(analises.data ?? []).map((a) => (
                <tr key={a.id} className="border-t border-border/60">
                  <td className="py-1.5 font-mono text-xs">{a.numero}</td>
                  <td className="py-1.5">
                    <Badge variant={creditoStatusTom(a.status)}>{a.conclusao ?? a.status}</Badge>
                    {a.restricao && (
                      <AlertTriangle className="inline h-3.5 w-3.5 ml-1 text-warning" aria-label="Restrição encontrada" />
                    )}
                  </td>
                  <td className="py-1.5 text-right">{fmtBRL(a.creditoAprovado)}</td>
                  <td className="py-1.5">{a.condicaoAprovada || a.condicaoSolicitada || "—"}</td>
                  <td className="py-1.5">{dataBR(a.validade)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pt-1 border-t border-border/60 space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Cloud className="h-3.5 w-3.5" /> Histórico do Salesforce
        </div>
        {sf.isLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando…
          </div>
        ) : sf.data?.erro ? (
          <div className="text-sm text-muted-foreground">{sf.data.erro}</div>
        ) : (sf.data?.registros ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhuma análise encontrada no Salesforce.</div>
        ) : (
          <ul className="space-y-1 text-sm">
            {(sf.data?.registros ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{r.nome ?? r.id}</span>
                <Badge variant="outline">{r.conclusao ?? r.status ?? "—"}</Badge>
                <span className="text-muted-foreground">
                  {fmtBRL(r.creditoAprovado)} · {r.condicaoAprovada || r.condicaoSolicitada || "—"} ·{" "}
                  {dataBR(r.concluidoEm ?? r.solicitadoEm)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="text-left">
            <DialogTitle>Solicitar análise de crédito</DialogTitle>
            <DialogDescription>
              O Financeiro recebe a solicitação na fila de Análise de Crédito e define o limite e a
              condição a prazo liberada para {clienteNome || "este cliente"}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Crédito solicitado (R$)</Label>
              <Input
                type="number" min="0" step="0.01" inputMode="decimal"
                value={valor} onChange={(e) => setValor(e.target.value)}
                placeholder="Ex.: 150000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Condição de pagamento pretendida</Label>
              <Select value={condicao || "__none"} onValueChange={(v) => setCondicao(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Não informar</SelectItem>
                  {(condicoes.data ?? []).map((c) => (
                    <SelectItem key={c.codigo} value={c.descricao}>{c.codigo} · {c.descricao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={setPrioridade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CREDITO_PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Observações para o Financeiro</Label>
              <Textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button className="gap-2" disabled={enviar.isPending} onClick={() => enviar.mutate()}>
              {enviar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Enviar solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
