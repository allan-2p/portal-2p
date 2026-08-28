/**
 * Documentos fiscais do pedido: DANFE (abre inline), XML da NF-e (download) e
 * boleto (quando a forma de pagamento gera um). Os arquivos vêm do bucket
 * privado; se ainda não existirem, o portal busca no SAP sob demanda.
 */
import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileText, FileCode2, Receipt, Loader2 } from "lucide-react";
import { baixarDocumentoNf } from "@/lib/nf-documentos.functions";

type Tipo = "danfe" | "xml" | "boleto";

const STATUS_COM_NF = ["Faturado", "Coletado", "Entregue"];

/** Regra única: os documentos só existem depois que o SAP fatura a NF. */
export function temNotaFiscal(proposta: Record<string, any>) {
  const status = String(proposta['status'] ?? "");
  const nfNumero = String(proposta['nf_numero'] ?? "").trim();
  return STATUS_COM_NF.includes(status) || !!nfNumero;
}

/** Baixa de um documento fiscal — reutilizada pelo bloco de NF e pelo de cobrança. */
export function useDocumentoNf(propostaId: string) {
  const baixar = useServerFn(baixarDocumentoNf);
  const [carregando, setCarregando] = useState<Tipo | null>(null);

  const abrir = async (tipo: Tipo) => {
    if (!propostaId) return;
    setCarregando(tipo);
    try {
      const r = await baixar({ data: { propostaId, tipo } });
      const a = document.createElement("a");
      a.href = r.url;
      a.target = "_blank";
      a.rel = "noopener";
      if (!r.inline) a.download = r.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error("Não foi possível abrir o documento", {
        description: e instanceof Error ? e.message : String(e),
        duration: Infinity,
        closeButton: true,
      });
    } finally {
      setCarregando(null);
    }
  };

  return { abrir, carregando };
}

function BotaoDoc({
  tipo,
  icone: Icone,
  rotulo,
  disponivel,
  carregando,
  onClick,
}: {
  tipo: Tipo;
  icone: any;
  rotulo: string;
  disponivel: boolean;
  carregando: Tipo | null;
  onClick: (t: Tipo) => void;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-10 w-full justify-center gap-2 sm:h-9 sm:w-auto"
      disabled={!disponivel || carregando !== null}
      onClick={() => onClick(tipo)}
      title={disponivel ? rotulo : "Disponível somente após o faturamento da nota fiscal."}
    >
      {carregando === tipo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icone className="h-4 w-4" />}
      {rotulo}
    </Button>
  );
}

/** Botão isolado do boleto emitido pelo SAP — usado no bloco de cobrança. */
export function BotaoBoletoNf({ proposta }: { proposta: Record<string, any> }) {
  const { abrir, carregando } = useDocumentoNf(String(proposta['id'] ?? ""));
  return (
    <BotaoDoc
      tipo="boleto"
      icone={Receipt}
      rotulo="Boleto (PDF)"
      disponivel={temNotaFiscal(proposta)}
      carregando={carregando}
      onClick={abrir}
    />
  );
}

/**
 * Bloco de Nota fiscal — dados da NF, faturamento/entrega (via `children`) e
 * os documentos DANFE/XML. O boleto vive no bloco de Cobrança.
 */
export function NfDocumentosCard({
  proposta,
  children,
}: {
  proposta: Record<string, any>;
  children?: ReactNode;
}) {
  const { abrir, carregando } = useDocumentoNf(String(proposta['id'] ?? ""));
  const status = String(proposta['status'] ?? "");
  const nfNumero = String(proposta['nf_numero'] ?? "").trim();
  const temNf = temNotaFiscal(proposta);

  return (
    <div className="glass rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Faturamento e nota fiscal
        </h3>
        {temNf ? (
          <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
            NF emitida
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            Aguardando faturamento
          </span>
        )}
      </div>

      {children}

      <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-4 text-sm sm:gap-4 md:grid-cols-3">
        <Campo label="Nº da NF" value={nfNumero || "—"} />
        <Campo label="Série" value={String(proposta['nf_serie'] ?? "") || "—"} />
        <div className="col-span-2 md:col-span-1">
          <Campo label="Chave de acesso" value={String(proposta['nf_chave'] ?? "") || "—"} mono />
        </div>

      </div>

      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        <BotaoDoc tipo="danfe" icone={FileText} rotulo="DANFE (PDF)" disponivel={temNf} carregando={carregando} onClick={abrir} />
        <BotaoDoc tipo="xml" icone={FileCode2} rotulo="XML da NF-e" disponivel={temNf} carregando={carregando} onClick={abrir} />
      </div>

      {!temNf ? (
        <p className="text-xs text-muted-foreground">
          Pedido em {status.toLowerCase() || "andamento"} — os documentos ficam disponíveis quando o
          SAP emitir a nota fiscal.
        </p>
      ) : null}
    </div>
  );
}

function Campo({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-medium break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}
