import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { listCondicoesPagamento } from "@/lib/condicoes-pagamento.functions";

/**
 * Seletor de condição de pagamento (ZTERM) do checkout.
 * Mostra apenas as condições ativas com parcelas automáticas e permite
 * digitar para pesquisar pelo código ou pela descrição.
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
  const [aberto, setAberto] = useState(false);
  const q = useQuery({
    queryKey: ["condicoes-pagamento", "checkout"],
    queryFn: () => listCondicoesPagamento({ data: { somenteCheckout: true } }),
    staleTime: 5 * 60_000,
  });

  const opcoes = (q.data ?? []).map((c) => ({
    value: c.codigo,
    label: `${c.codigo} — ${c.descricao}`,
  }));
  const selecionada = opcoes.find((o) => o.value === value);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={aberto}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate">
            {selecionada?.label ?? (q.isLoading ? "Carregando…" : "Selecione a condição")}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Digite o código ou a descrição" />
          <CommandList className="max-h-72">
            <CommandEmpty>Nenhuma condição encontrada.</CommandEmpty>
            {opcoes.map((o) => (
              <CommandItem
                key={o.value}
                value={o.label}
                onSelect={() => {
                  onChange(o.value);
                  setAberto(false);
                }}
              >
                <Check className={cn("h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{o.label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
