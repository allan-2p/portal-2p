/**
 * Boletos a prazo do pedido — PDFs publicados pelo financeiro no SharePoint
 * e espelhados no portal. O link do SharePoint nunca é exposto: o download
 * sai do Storage por URL assinada.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Download, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { baixarBoletoSharepoint } from "@/lib/boletos-sharepoint.functions";
import { toast } from "sonner";

export type BoletoSharepointItem = {
  nome: string;
  path: string;
  atualizado_em?: string | null;
};

type Props = {
  propostaId: string;
  formaPagamento?: string | null;
  nfNumero?: string | null;
  boletos?: BoletoSharepointItem[] | null;
  avisadoEm?: string | null;
};

function dataHora(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

export function BoletosSharepointCard({ propostaId, formaPagamento, nfNumero, boletos, avisadoEm }: Props) {
  const baixar = useServerFn(baixarBoletoSharepoint);
  const [carregando, setCarregando] = useState<string | null>(null);

  if (formaPagamento !== "n") return null;

  const lista = (boletos ?? []).filter((b) => b?.path);

  async function abrir(path: string) {
    setCarregando(path);
    try {
      const r = await baixar({ data: { propostaId, path } });
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir o boleto.");
    } finally {
      setCarregando(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" /> Boletos a prazo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {lista.length === 0 ? (
          <p className="text-muted-foreground flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            {nfNumero
              ? `Aguardando o financeiro publicar os boletos da NF ${nfNumero}. A busca é automática a cada hora.`
              : "Os boletos ficam disponíveis após o faturamento da nota fiscal."}
          </p>
        ) : (
          <>
            <p className="text-muted-foreground">
              {lista.length} arquivo(s) encontrado(s) · aviso enviado em {dataHora(avisadoEm)}
            </p>
            <ul className="space-y-2">
              {lista.map((b) => (
                <li
                  key={b.path}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
                >
                  <span className="min-w-0 break-all">{b.nome}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={carregando === b.path}
                    onClick={() => abrir(b.path)}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    {carregando === b.path ? "Abrindo…" : "Baixar"}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
