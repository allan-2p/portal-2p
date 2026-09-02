import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PropostaDetalheDialog } from "@/components/proposta-detalhe";
import { BotaoDarPerda } from "@/components/propostas/dar-perda";
import { vincularPropostasSfFn } from "@/lib/propostas.functions";

export type PropostaVinculo = {
  id: string;
  numero: string | null;
  status: string | null;
  organizacao: string | null;
  motivo_perda: string | null;
  perdida_em: string | null;
  sf_opp_id: string | null;
};

/**
 * Resolve, em lote, quais oportunidades do Salesforce têm proposta no portal.
 * Assim a home e o perfil do cliente abrem a mesma visualização do "olhinho"
 * das listas de propostas e liberam o "dar perda" na própria linha.
 */
export function usePropostasVinculadas(
  refs: { sfOppId?: string | null; numero?: string | null }[],
) {
  const sfOppIds = useMemo(
    () => [...new Set(refs.map((r) => String(r.sfOppId ?? "").trim()).filter(Boolean))].sort(),
    [refs],
  );
  const numeros = useMemo(
    () => [...new Set(refs.map((r) => String(r.numero ?? "").trim()).filter(Boolean))].sort(),
    [refs],
  );

  const q = useQuery({
    queryKey: ["propostas-vinculo", sfOppIds, numeros],
    enabled: sfOppIds.length > 0 || numeros.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: () => vincularPropostasSfFn({ data: { sfOppIds, numeros } }),
  });

  return useMemo(() => {
    const porOpp = new Map<string, PropostaVinculo>();
    const porNumero = new Map<string, PropostaVinculo>();
    for (const r of (q.data ?? []) as PropostaVinculo[]) {
      if (r.sf_opp_id) porOpp.set(String(r.sf_opp_id), r);
      if (r.numero) porNumero.set(String(r.numero), r);
    }
    return {
      carregando: q.isLoading,
      recarregar: () => void q.refetch(),
      buscar: (ref: { sfOppId?: string | null; numero?: string | null }) => {
        const opp = String(ref.sfOppId ?? "").trim();
        const num = String(ref.numero ?? "").trim();
        return (opp && porOpp.get(opp)) || (num && porNumero.get(num)) || null;
      },
    };
  }, [q.data, q.isLoading, q.refetch]);
}

/**
 * Botões de ação de uma oportunidade: abrir a proposta (mesma visualização do
 * olhinho) e dar perda. Quando não há proposta no portal, nada é exibido.
 */
export function AcoesOportunidade({
  proposta,
  onFeito,
  className,
}: {
  proposta: PropostaVinculo | null;
  onFeito?: () => void;
  className?: string;
}) {
  const [detalheId, setDetalheId] = useState<string | null>(null);
  if (!proposta) return null;
  return (
    <span className={className ?? "inline-flex items-center gap-0.5"}>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        aria-label="Ver proposta"
        title="Ver proposta"
        onClick={(e) => {
          e.stopPropagation();
          setDetalheId(proposta.id);
        }}
      >
        <Eye className="h-4 w-4" />
      </Button>
      <BotaoDarPerda proposta={proposta as unknown as Record<string, any>} onFeito={onFeito} />
      <PropostaDetalheDialog
        id={detalheId ?? undefined}
        onOpenChange={(open) => !open && setDetalheId(null)}
      />
    </span>
  );
}
