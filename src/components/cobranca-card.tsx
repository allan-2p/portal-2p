import { useState } from "react";
import { Check, Copy, ExternalLink, FileDown, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtBRL } from "@/lib/carregadores";
import { PixQrCode } from "@/components/pix-qrcode";
import { boletoGuiaHtml, imprimirBoletoGuia } from "@/lib/boleto-guia-pdf";

export type CobrancaInfo = {
  forma?: string | null;
  meio?: string | null;
  status?: string | null;
  valor?: number | null;
  vencimento?: string | null;
  linhaDigitavel?: string | null;
  codigoBarras?: string | null;
  nossoNumero?: string | null;
  pixCopiaCola?: string | null;
  url?: string | null;
  atualizado_em?: string | null;
  mensagem?: string | null;
  aplicavel?: boolean;
  numeroPedido?: string | null;
  clienteNome?: string | null;
  clienteDoc?: string | null;
};

const fmtData = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export function labelStatusCobranca(status?: string | null) {
  switch (String(status ?? "")) {
    case "pendente":
      return "Aguardando pagamento";
    case "pago":
      return "Pago";
    case "erro":
      return "Falha na emissão";
    case "cancelado":
      return "Cancelada";
    default:
      return "Não emitida";
  }
}

/** Campo com código longo (linha digitável / Pix copia e cola) e botão de cópia. */
export function CodigoCopiavel({ rot, valor }: { rot: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{rot}</p>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-muted/60 p-2 text-xs">{valor}</code>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(valor);
              setCopiado(true);
              toast.success("Código copiado.");
              setTimeout(() => setCopiado(false), 2000);
            } catch {
              toast.error("Não foi possível copiar. Selecione o código manualmente.");
            }
          }}
        >
          {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

/**
 * Cobrança do pedido (boleto à vista ou Pix): situação, códigos para pagamento
 * e motivo da falha quando o Itaú recusa a emissão.
 */
export function CobrancaCard({ cobranca, acoes }: { cobranca: CobrancaInfo; acoes?: React.ReactNode }) {
  const c = cobranca ?? {};
  const emitida = Boolean(c.linhaDigitavel || c.pixCopiaCola);
  const erro = c.status === "erro";
  const aplicavel = c.aplicavel ?? (c.forma === "boleto_vista" || c.forma === "pix");

  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary">
          <QrCode className="h-3.5 w-3.5" /> Cobrança • {c.meio === "pix" || c.forma === "pix" ? "Pix" : "Boleto"}
        </div>
        <Badge variant={emitida ? "secondary" : erro ? "destructive" : "outline"}>
          {labelStatusCobranca(c.status)}
        </Badge>
      </div>

      {!aplicavel && (
        <p className="text-sm text-muted-foreground">
          Esta forma de pagamento não gera cobrança automática pelo portal (tratada pelo financeiro/SAP).
        </p>
      )}

      {aplicavel && (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <Info rot="Valor" val={c.valor ? fmtBRL(c.valor) : "—"} />
          <Info rot="Vencimento" val={c.vencimento ? fmtData(c.vencimento) : "—"} />
          {c.nossoNumero ? <Info rot="Nosso número" val={c.nossoNumero} /> : null}
          <Info
            rot="Atualizado em"
            val={c.atualizado_em ? new Date(c.atualizado_em).toLocaleString("pt-BR") : "—"}
          />
        </div>
      )}

      {c.linhaDigitavel ? <CodigoCopiavel rot="Linha digitável" valor={c.linhaDigitavel} /> : null}
      {c.codigoBarras && c.status !== "pago" ? (
        <CodigoCopiavel rot="Código de barras" valor={c.codigoBarras} />
      ) : null}
      {/* Instruções do boleto: ficam visíveis até a confirmação do pagamento. */}
      {c.linhaDigitavel && c.status !== "pago" ? (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          <p className="font-semibold text-foreground">Como pagar</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>Pague em qualquer banco, app ou lotérica usando a linha digitável acima.</li>
            <li>Vencimento em {fmtData(c.vencimento)} — após essa data o boleto pode não ser aceito.</li>
            <li>
              O pedido entra em separação no próximo dia útil após a confirmação do pagamento pelo banco.
            </li>
            {c.nossoNumero ? <li>Informe o nosso número {c.nossoNumero} em caso de dúvida.</li> : null}
          </ul>
        </div>
      ) : null}
      {c.pixCopiaCola ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          {c.status !== "pago" ? <PixQrCode valor={c.pixCopiaCola} /> : null}
          <div className="min-w-0 flex-1">
            <CodigoCopiavel rot="Pix copia e cola" valor={c.pixCopiaCola} />
          </div>
        </div>
      ) : null}


      {erro && c.mensagem ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
          <p className="font-semibold">Retorno do banco</p>
          <p className="mt-0.5 break-words">{c.mensagem}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {c.url ? (
          <Button size="sm" variant="outline" asChild>
            <a href={c.url} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-3.5 w-3.5" /> Abrir cobrança
            </a>
          </Button>
        ) : null}
        {acoes}
      </div>
    </section>
  );
}

function Info({ rot, val }: { rot: string; val: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{rot}</span>
      <span className="break-words text-right font-medium">{val}</span>
    </div>
  );
}
