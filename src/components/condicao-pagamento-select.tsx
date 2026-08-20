import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listCondicoesPagamento } from "@/lib/condicoes-pagamento.functions";

/**
 * Seletor de condição de pagamento (ZTERM) do checkout.
 * Mostra apenas as condições ativas com parcelas automáticas.
 */
export function CondicaoPagamentoSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (codigo: string) => void;
  className?: string;
}) {
  const q = useQuery({
    queryKey: ["condicoes-pagamento", "checkout"],
    queryFn: () => listCondicoesPagamento({ data: { somenteCheckout: true } }),
    staleTime: 5 * 60_000,
  });

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={q.isLoading ? "Carregando…" : "Selecione a condição"} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {(q.data ?? []).map((c) => (
          <SelectItem key={c.codigo} value={c.codigo}>
            {c.codigo} — {c.descricao}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
