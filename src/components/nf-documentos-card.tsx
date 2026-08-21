/**
 * Documentos fiscais do pedido: DANFE (abre inline), XML da NF-e (download) e
 * boleto (quando a forma de pagamento gera um). Os arquivos vêm do bucket
 * privado; se ainda não existirem, o portal busca no SAP sob demanda.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileText, FileCode2, Receipt, Loader2 } from "lucide-react";
import { baixarDocumentoNf } from "@/lib/nf-documentos.functions";

type Tipo = "danfe" | "xml" | "boleto";

const STATUS_COM_NF = ["Faturado", "Coletado", "Entregue"];

export function NfDocumentosCard({ proposta }: { proposta: Record<string, any> }) {
  const baixar = useServerFn(baixarDocumentoNf);
  const [carregando, setCarregando] = useState<Tipo | null>(null);

  const id = String(proposta['id'] ?? "");
  const status = String(proposta['status'] ?? "");
  const nfNumero = String(proposta['nf_numero'] ?? "").trim();
  const temNf = STATUS_COM_NF.includes(status) || !!nfNumero;
  const formaPagamento = String(proposta['forma_pagamento'] ?? "");
  const mostraBoleto = formaPagamento.startsWith("boleto");

  if (!temNf && !STATUS_COM_NF.includes(status) && !nfNumero && !proposta['sap_ov_numero']) return null;

  const abrir = async (tipo: Tipo) => {
    if (!id) return;
    setCarregando(tipo);
    try {
      const r = await baixar({ data: { propostaId: id, tipo } });
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

  const Botao = ({ tipo, icone: Icone, rotulo }: { tipo: Tipo; icone: any; rotulo: string }) => (
    <Button
      variant="outline"
      size="sm"
      disabled={!temNf || carregando !== null}
      onClick={() => abrir(tipo)}
      title={temNf ? rotulo : "Disponível somente após o faturamento da nota fiscal."}
    >
      {carregando === tipo ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icone className="h-4 w-4" />
      )}
      {rotulo}
    </Button>
  );

  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Nota fiscal
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <Campo label="Nº da NF" value={nfNumero || "—"} />
        <Campo label="Série" value={String(proposta['nf_serie'] ?? "") || "—"} />
        <Campo
          label="Chave de acesso"
          value={String(proposta['nf_chave'] ?? "") || "—"}
          mono
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Botao tipo="danfe" icone={FileText} rotulo="DANFE (PDF)" />
        <Botao tipo="xml" icone={FileCode2} rotulo="XML da NF-e" />
        {mostraBoleto ? <Botao tipo="boleto" icone={Receipt} rotulo="Boleto (PDF)" /> : null}
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
