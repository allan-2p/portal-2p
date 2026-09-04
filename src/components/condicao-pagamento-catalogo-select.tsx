import { useMemo, useState } from "react";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useListaIncremental, normalizarBusca } from "@/hooks/use-lista-incremental";

/**
 * Seletor do catálogo de condições de pagamento para o cadastro do cliente.
 *
 * Diferente do seletor do checkout, aqui não há regra de crédito: é só a
 * condição liberada no cadastro. Devolve o par completo (código interno + descrição)
 * para gravar `condicao_pgto_sap` e `condicao_pagamento` juntos.
 */
export function CondicaoPagamentoCatalogoSelect({
  codigo,
  descricao,
  onChange,
  className,
}: {
  codigo: string | null;
  descricao: string | null;
  onChange: (v: { codigo: string; descricao: string }) => void;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const q = useQuery({
    queryKey: ["condicoes-pagamento", "catalogo"],
    queryFn: () => listCondicoesPagamento({ data: {} }),
    staleTime: 5 * 60_000,
  });

  const opcoes = useMemo(() => (q.data ?? []).filter((c) => c.ativo), [q.data]);
  const [busca, setBusca] = useState("");
  const termo = useDebouncedValue(busca.trim(), 250);
  const filtradas = useMemo(() => {
    const t = normalizarBusca(termo);
    if (!t) return opcoes;
    return opcoes.filter((c) => normalizarBusca(`${c.codigo} ${c.descricao}`).includes(t));
  }, [opcoes, termo]);
  const lista = useListaIncremental(filtradas, { passo: 30, chave: termo });
  const cod = String(codigo ?? "").trim();
  const atual = opcoes.find((c) => c.codigo === cod);
  const rotulo = atual
    ? atual.descricao
    : descricao
      ? descricao
      : cod
        ? "Selecione a condição"
        : null;

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
            {rotulo ?? (q.isLoading ? "Carregando…" : "Selecione a condição")}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Busque pela condição de pagamento"
              value={busca}
              onValueChange={setBusca}
            />
            <CommandList className="max-h-72">
              <CommandEmpty>
                {q.isLoading ? "Carregando…" : "Nenhuma condição encontrada."}
              </CommandEmpty>
              {lista.visiveis.map((c) => (
                <CommandItem
                  key={c.codigo}
                  value={`${c.codigo} ${c.descricao}`}
                  onSelect={() => {
                    onChange({ codigo: c.codigo, descricao: c.descricao });
                    setAberto(false);
                  }}
                >
                  <Check className={cn("h-4 w-4", cod === c.codigo ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{c.descricao}</span>
                </CommandItem>
              ))}
              {lista.temMais ? (
                <div ref={lista.sentinelaRef} className="px-3 py-2">
                  <button
                    type="button"
                    onClick={lista.carregarMais}
                    className="w-full text-xs text-muted-foreground hover:text-foreground"
                  >
                    Carregar mais ({lista.restantes})
                  </button>
                </div>
              ) : null}
            </CommandList>
          </Command>
      </PopoverContent>
    </Popover>
  );
}
