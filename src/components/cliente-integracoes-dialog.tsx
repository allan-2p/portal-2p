import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClienteIntegracaoHistorico } from "@/components/cliente-integracao-historico";
import { reenviarClienteFn } from "@/lib/clientes.functions";
type Instancia = "solar" | "carregadores";

type ClienteResumo = {
  id: string;
  razao_social: string;
  numero_sap?: string | null;
  sap_status?: string | null;
  sap_erro?: string | null;
  sf_account_id?: string | null;
  sf_contact_id?: string | null;
  sf_status?: string | null;
  sf_erro?: string | null;
};

function Linha({ rot, val }: { rot: string; val?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{rot}</span>
      <span className="text-right font-medium break-words">{val && String(val).trim() ? val : "—"}</span>
    </div>
  );
}

/**
 * Integrações + auditoria de um cliente. Exclusivo de quem tem a permissão
 * "Clientes • Integrações e histórico" no perfil.
 */
export function ClienteIntegracoesDialog({
  cliente,
  instancia,
  open,
  onOpenChange,
}: {
  cliente: ClienteResumo | null;
  instancia: Instancia;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const reenviarFn = useServerFn(reenviarClienteFn);
  const reenviar = useMutation({
    mutationFn: (id: string) => reenviarFn({ data: { instancia, id } }),
    onSuccess: () => {
      toast.success("Reenvio solicitado.");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["cliente-integracao-historico"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao reenviar."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        {cliente && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6">Integrações · {cliente.razao_social}</DialogTitle>
              <DialogDescription>
                Status do SAP e do Salesforce, tentativas, payloads e histórico de alterações.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-surface/40 p-3 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-primary">SAP</div>
                <Linha rot="Código SAP" val={cliente.numero_sap ?? "Não enviado"} />
                <Linha rot="Status" val={cliente.sap_status ?? "—"} />
                {cliente.sap_erro && <Linha rot="Erro" val={cliente.sap_erro} />}
              </div>

              <div className="rounded-xl border border-border bg-surface/40 p-3 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-primary">Salesforce</div>
                <Linha rot="Conta" val={cliente.sf_account_id ?? "Não enviada"} />
                <Linha rot="Contato" val={cliente.sf_contact_id ?? "—"} />
                <Linha rot="Status" val={cliente.sf_status ?? "—"} />
                {cliente.sf_erro && <Linha rot="Erro" val={cliente.sf_erro} />}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => reenviar.mutate(cliente.id)}
                  disabled={reenviar.isPending}
                >
                  <RefreshCw className={`h-4 w-4 ${reenviar.isPending ? "animate-spin" : ""}`} />
                  Reenviar ao SAP / Salesforce
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <a href={`/admin/logs/integracoes?cliente=${encodeURIComponent(cliente.id)}`}>
                    Ver auditoria completa
                  </a>
                </Button>
              </div>

              <ClienteIntegracaoHistorico clienteId={cliente.id} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
