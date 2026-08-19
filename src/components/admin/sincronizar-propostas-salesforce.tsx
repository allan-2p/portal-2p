/**
 * Backfill manual: envia/atualiza no Salesforce todas as propostas já
 * existentes. A partir de agora o envio é automático a cada salvamento —
 * este botão serve para regularizar o histórico e reprocessar falhas.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sincronizarPropostasSalesforceLoteFn } from "@/lib/propostas.functions";

type Resultado = {
  total: number;
  sincronizados: number;
  falhas: number;
  detalhes: { id: string; numero: string | null; ok: boolean; mensagem: string | null }[];
};

export function SincronizarPropostasSalesforce() {
  const rodar = useServerFn(sincronizarPropostasSalesforceLoteFn);
  const [carregando, setCarregando] = useState<"todas" | "pendentes" | null>(null);
  const [res, setRes] = useState<Resultado | null>(null);

  async function executar(somentePendentes: boolean) {
    setCarregando(somentePendentes ? "pendentes" : "todas");
    try {
      const r = (await rodar({ data: { somentePendentes } })) as Resultado;
      setRes(r);
      if (r.falhas === 0) toast.success(`${r.sincronizados} proposta(s) sincronizada(s) no Salesforce.`);
      else toast.warning(`${r.sincronizados} sincronizada(s), ${r.falhas} com erro.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(null);
    }
  }

  const falhas = (res?.detalhes ?? []).filter((d) => !d.ok).slice(0, 10);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Propostas no Salesforce</h2>
          <p className="text-sm text-muted-foreground">
            As propostas passam a ser criadas/atualizadas no Salesforce a cada salvamento. Use os
            botões abaixo para regularizar o histórico.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!!carregando} onClick={() => executar(true)}>
            {carregando === "pendentes" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sincronizar pendentes
          </Button>
          <Button disabled={!!carregando} onClick={() => executar(false)}>
            {carregando === "todas" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sincronizar todas
          </Button>
        </div>
      </div>

      {res && (
        <div className="mt-4 space-y-2 text-sm">
          <div className="text-muted-foreground">
            {res.total} proposta(s) processada(s) • {res.sincronizados} ok • {res.falhas} com erro
          </div>
          {falhas.length > 0 && (
            <ul className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive">
              {falhas.map((d) => (
                <li key={d.id}>
                  • {d.numero ?? d.id}: {d.mensagem}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
