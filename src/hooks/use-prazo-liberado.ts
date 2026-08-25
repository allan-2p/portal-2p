import { useQuery } from "@tanstack/react-query";
import { condicaoPagamentoClienteFn } from "@/lib/clientes.functions";
import { getCreditoVigente } from "@/lib/credito.functions";

/**
 * "Boleto a prazo" só é oferecido na proposta quando o cliente tem condição de
 * pagamento cadastrada no cadastro E crédito aprovado (análise concluída como
 * Liberado e dentro da validade). Sem isso, o checkout mostra apenas as demais
 * formas de pagamento.
 */
export function usePrazoLiberado(clienteDoc?: string | null) {
  const doc = String(clienteDoc ?? "").replace(/\D/g, "");
  const valido = doc.length === 11 || doc.length === 14;

  const cadastro = useQuery({
    queryKey: ["cliente-condicao-pagamento", doc],
    queryFn: () => condicaoPagamentoClienteFn({ data: { doc } }),
    enabled: valido,
    staleTime: 60_000,
  });

  const credito = useQuery({
    queryKey: ["credito-vigente", doc],
    queryFn: () => getCreditoVigente({ data: { doc } }),
    enabled: valido,
    staleTime: 60_000,
  });

  const condicaoCadastrada = cadastro.data?.condicao ?? null;
  const creditoAprovado = Boolean(credito.data);
  const liberado = valido && Boolean(condicaoCadastrada) && creditoAprovado;

  return {
    liberado,
    carregando: valido && (cadastro.isLoading || credito.isLoading),
    condicaoCadastrada,
    creditoAprovado,
    motivo: !valido
      ? "Selecione o cliente para liberar condições a prazo."
      : !condicaoCadastrada
        ? "Cliente sem condição de pagamento cadastrada."
        : !creditoAprovado
          ? "Cliente sem crédito aprovado pelo Financeiro."
          : null,
  };
}
