import { useMemo, useState } from "react";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useListaIncremental, normalizarBusca } from "@/hooks/use-lista-incremental";

export type ComboboxOpcao = { value: string; label: string; descricao?: string };

/**
 * Combobox com busca por digitação (debounce) e renderização incremental.
 *
 * Pensado para catálogos grandes: filtra só depois que o usuário para de
 * digitar e monta poucos itens por vez, carregando mais conforme a rolagem.
 */
export function ComboboxBusca({
  value,
  onChange,
  opcoes,
  placeholder = "Selecione",
  buscaPlaceholder = "Digite para pesquisar…",
  vazio = "Nada encontrado.",
  disabled,
  carregando,
  className,
  passo = 40,
}: {
  value: string;
  onChange: (value: string) => void;
  opcoes: ComboboxOpcao[];
  placeholder?: string;
  buscaPlaceholder?: string;
  vazio?: string;
  disabled?: boolean;
  carregando?: boolean;
  className?: string;
  passo?: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const termo = useDebouncedValue(busca.trim(), 250);

  const filtradas = useMemo(() => {
    const t = normalizarBusca(termo);
    if (!t) return opcoes;
    return opcoes.filter((o) => normalizarBusca(`${o.label} ${o.descricao ?? ""}`).includes(t));
  }, [opcoes, termo]);

  const lista = useListaIncremental(filtradas, { passo, chave: termo });
  const selecionada = opcoes.find((o) => o.value === value);

  return (
    <Popover open={disabled ? false : aberto} onOpenChange={(o) => !disabled && setAberto(o)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={aberto}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            disabled && "opacity-100 cursor-not-allowed",
            className,
          )}
        >
          <span className="truncate text-left">
            {selecionada?.label ?? (carregando ? "Carregando…" : placeholder)}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder={buscaPlaceholder} value={busca} onValueChange={setBusca} />
          <CommandList className="max-h-72">
            <CommandEmpty>{carregando ? "Carregando…" : vazio}</CommandEmpty>
            {lista.visiveis.map((o) => (
              <CommandItem
                key={o.value}
                value={o.value}
                onSelect={() => {
                  onChange(o.value);
                  setAberto(false);
                }}
              >
                <Check className={cn("h-4 w-4 shrink-0", value === o.value ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.descricao ? (
                    <span className="block truncate text-xs text-muted-foreground">{o.descricao}</span>
                  ) : null}
                </span>
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
