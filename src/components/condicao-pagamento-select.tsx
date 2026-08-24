import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Lock } from "lucide-react";
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
import { getCreditoVigente } from "@/lib/credito.functions";
import { condicaoEhAPrazo, fmtBRL, limiteCobre } from "@/lib/credito";

/**
 * Seletor de condição de pagamento (ZTERM) do checkout.
 * Mostra apenas as condições ativas com parcelas automáticas e permite
 * digitar para pesquisar pelo código ou pela descrição.
 *
 * Quando `clienteDoc` é informado, as condições a prazo só ficam disponíveis
 * se o cliente tiver crédito liberado pelo Financeiro e limite suficiente
 * para o valor da proposta.
 */
export function CondicaoPagamentoSelect({
  value,
  onChange,
  className,
  clienteDoc,
  valorTotal,
}: {
  value: string;
  onChange: (codigo: string) => void;
  className?: string;
  clienteDoc?: string | null;
  valorTotal?: number;
}) {
  const [aberto, setAberto] = useState(false);
  const q = useQuery({
    queryKey: ["condicoes-pagamento", "checkout"],
    queryFn: () => listCondicoesPagamento({ data: { somenteCheckout: true } }),
    staleTime: 5 * 60_000,
  });

  const doc = String(clienteDoc ?? "").replace(/\D/g, "");
  const credito = useQuery({
    queryKey: ["credito-vigente", doc],
    queryFn: () => getCreditoVigente({ data: { doc } }),
    enabled: doc.length === 11 || doc.length === 14,
    staleTime: 60_000,
  });

  const controlar = (doc.length === 11 || doc.length === 14) && credito.isSuccess;
  const vigente = credito.data ?? null;
  const cobre = limiteCobre(vigente, Number(valorTotal) || 0);

  const opcoes = (q.data ?? []).map((c) => {
    const aPrazo = condicaoEhAPrazo(c.parcelas);
    const bloqueada = controlar && aPrazo && !cobre;
    return {
      value: c.codigo,
      label: `${c.codigo} — ${c.descricao}`,
      aPrazo,
      bloqueada,
      motivo: !vigente
        ? "Sem crédito liberado pelo Financeiro"
        : `Limite aprovado ${fmtBRL(vigente.limite)} menor que o pedido`,
    };
  });
  const selecionada = opcoes.find((o) => o.value === value);

  return (
    <div className="space-y-1.5">
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
                  disabled={o.bloqueada}
                  title={o.bloqueada ? o.motivo : undefined}
                  onSelect={() => {
                    if (o.bloqueada) return;
                    onChange(o.value);
                    setAberto(false);
                  }}
                >
                  {o.bloqueada ? (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Check className={cn("h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  )}
                  <span className={cn("truncate", o.bloqueada && "text-muted-foreground")}>{o.label}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {controlar && !cobre && (
        <p className="text-xs text-muted-foreground">
          Condições a prazo bloqueadas:{" "}
          {vigente
            ? `limite aprovado de ${fmtBRL(vigente.limite)} (análise ${vigente.numero}) não cobre este pedido.`
            : "cliente sem crédito liberado. Peça a análise no cadastro do cliente."}
        </p>
      )}
      {controlar && cobre && vigente && (
        <p className="text-xs text-muted-foreground">
          Crédito liberado {fmtBRL(vigente.limite)} · análise {vigente.numero}
          {vigente.validade ? ` · válido até ${new Date(`${vigente.validade}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}
        </p>
      )}
    </div>
  );
}
