import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CodigoCopiavel } from "@/components/cobranca-card";
import { PixQrCode } from "@/components/pix-qrcode";

export type ResultadoConclusao = {
  numero: string;
  status: string;
  erro?: string | null;
  sapOv?: {
    ok?: boolean;
    enviado?: boolean;
    vbeln?: string | null;
    mensagem?: string | null;
    motivo?: string | null;
  } | null;
  salesforce?: { ok?: boolean; enviado?: boolean; mensagem?: string | null; opportunityId?: string | null } | null;
  cobranca?: {
    gerada?: boolean;
    meio?: string | null;
    motivo?: string | null;
    erro?: string | null;
    pixCopiaCola?: string | null;
    linhaDigitavel?: string | null;
  } | null;
};

/**
 * Resultado do "Concluir pedido" — mesmo pop-up em Carregadores e Solar.
 *
 * Nunca fecha em silêncio: quando alguma integração falha, a linha aparece
 * como "Pendente" com o motivo devolvido pelo servidor.
 */
export function ResultadoConclusaoDialog({
  resultado,
  onClose,
  onIrParaLista,
  onVerProposta,
  rotuloLista = "Voltar para propostas",
}: {
  resultado: ResultadoConclusao | null;
  onClose: () => void;
  onIrParaLista: () => void;
  /** Abre a proposta concluída (detalhe). Quando ausente, o botão não aparece. */
  onVerProposta?: (() => void) | undefined;
  rotuloLista?: string;
}) {
  const linhas = [
    {
      nome: "Ordem de venda no SAP",
      ok: !!resultado?.sapOv?.ok,
      detalhe:
        resultado?.sapOv?.motivo === "nao_configurado"
          ? "Integração de ordem de venda não configurada — envie pelo painel de integrações do pedido."
          : (resultado?.sapOv?.vbeln
              ? `Ordem ${resultado.sapOv.vbeln} criada.`
              : resultado?.sapOv?.mensagem ?? resultado?.sapOv?.motivo) ?? "Não enviado.",
    },
    {
      nome: "Oportunidade no Salesforce",
      ok: !!resultado?.salesforce?.ok,
      detalhe: resultado?.salesforce?.mensagem ?? "Não enviado.",
    },
    {
      nome: "Cobrança",
      ok: !!resultado?.cobranca?.gerada,
      detalhe:
        resultado?.cobranca?.erro ??
        resultado?.cobranca?.motivo ??
        (resultado?.cobranca?.gerada ? `Gerada (${resultado.cobranca.meio ?? "—"}).` : "Não gerada."),
    },
  ];

  return (
    <Dialog open={!!resultado} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {resultado?.erro ? (
              <TriangleAlert className="h-5 w-5 text-destructive" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            )}
            {resultado?.erro ? "Não foi possível concluir o pedido" : `Pedido ${resultado?.numero ?? ""} concluído`}
          </DialogTitle>
          <DialogDescription>
            {resultado?.erro
              ? resultado.erro
              : `Status aplicado: ${resultado?.status ?? ""}. Veja abaixo o resultado de cada integração.`}
          </DialogDescription>
        </DialogHeader>
        {!resultado?.erro && resultado?.cobranca?.pixCopiaCola ? (
          <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Pague com Pix</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <PixQrCode valor={resultado.cobranca.pixCopiaCola} />
              <div className="min-w-0 flex-1">
                <CodigoCopiavel rot="Pix copia e cola" valor={resultado.cobranca.pixCopiaCola} />
              </div>
            </div>
          </div>
        ) : null}
        {!resultado?.erro && resultado?.cobranca?.linhaDigitavel ? (
          <CodigoCopiavel rot="Linha digitável do boleto" valor={resultado.cobranca.linhaDigitavel} />
        ) : null}
        {!resultado?.erro && (
          <div className="space-y-2 text-sm">
            {linhas.map((l) => (
              <div key={l.nome} className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{l.nome}</span>
                  <span className={cn("text-xs font-semibold", l.ok ? "text-emerald-600" : "text-amber-600")}>
                    {l.ok ? "OK" : "Pendente"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{l.detalhe}</p>
              </div>
            ))}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="outline" onClick={onIrParaLista}>
            {rotuloLista}
          </Button>
          {!resultado?.erro && onVerProposta ? (
            <Button onClick={onVerProposta}>Ver proposta concluída</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
