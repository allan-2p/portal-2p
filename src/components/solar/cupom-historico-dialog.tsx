import { useQuery } from "@tanstack/react-query";
import { History, Truck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export type CupomUso = {
  id: string;
  proposta_id: string | null;
  proposta_numero: string | null;
  cliente_nome: string | null;
  cliente_doc: string | null;
  desconto: number | null;
  frete_gratis: boolean | null;
  valor_total: number | null;
  user_nome: string | null;
  created_at: string;
};

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Auditoria de campanhas: quando o cupom foi aplicado e em quais propostas. */
export function CupomHistoricoDialog({
  cupomId,
  codigo,
  open,
  onOpenChange,
}: {
  cupomId: string | null;
  codigo: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const q = useQuery({
    queryKey: ["solar-cupom-usos", cupomId],
    enabled: open && !!cupomId,
    queryFn: async (): Promise<CupomUso[]> => {
      const { data, error } = await supabase
        .from("solar_cupom_usos")
        .select(
          "id, proposta_id, proposta_numero, cliente_nome, cliente_doc, desconto, frete_gratis, valor_total, user_nome, created_at",
        )
        .eq("cupom_id", cupomId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CupomUso[];
    },
  });

  const usos = q.data ?? [];
  const totalDesconto = usos.reduce((s, u) => s + Number(u.desconto ?? 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> Histórico de uso — {codigo ?? ""}
          </DialogTitle>
          <DialogDescription>
            Quando o cupom foi aplicado, em quais propostas e por quem.
          </DialogDescription>
        </DialogHeader>

        {q.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : usos.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Este cupom ainda não foi aplicado em nenhuma proposta.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Aplicações</p>
                <p className="text-lg font-semibold">{usos.length}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Desconto concedido</p>
                <p className="text-lg font-semibold">{fmtBRL(totalDesconto)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Último uso</p>
                <p className="text-sm font-medium">{fmtData(usos[0]!.created_at)}</p>
              </div>
            </div>

            <div className="max-h-[45vh] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Data</th>
                    <th className="px-3 py-2 text-left font-medium">Proposta</th>
                    <th className="px-3 py-2 text-left font-medium">Cliente</th>
                    <th className="px-3 py-2 text-right font-medium">Desconto</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 text-left font-medium">Aplicado por</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {usos.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {fmtData(u.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">
                        {u.proposta_numero ?? "—"}
                      </td>
                      <td className="px-3 py-2">{u.cliente_nome ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {fmtBRL(Number(u.desconto ?? 0))}
                        {u.frete_gratis && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-500">
                            <Truck className="h-3 w-3" /> frete
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {fmtBRL(Number(u.valor_total ?? 0))}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{u.user_nome ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
