import { useQuery } from "@tanstack/react-query";
import { docCanonico } from "@/lib/cnpj";
import { condicaoPagamentoClienteFn } from "@/lib/clientes.functions";
import { getCreditoVigente } from "@/lib/credito.functions";

/**
 * "Boleto a prazo" é oferecido quando o cliente tem condição de pagamento
 * cadastrada E o prazo já está concedido: ou pela condição de pagamento do
 * SAP (ZTERM diferente de 2P00 = à vista), ou por uma análise de crédito
 * concluída como Liberado e dentro da validade no portal.
 */
export function usePrazoLiberado(clienteDoc?: string | null) {
  const doc = docCanonico(String(clienteDoc ?? ""));
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
  const prazoNoSap = cadastro.data?.prazoNoSap === true;
  const creditoAprovado = Boolean(credito.data) || prazoNoSap;
  const liberado = valido && Boolean(condicaoCadastrada) && creditoAprovado;

  return {
    liberado,
    carregando: valido && (cadastro.isLoading || credito.isLoading),
    condicaoCadastrada,
    creditoAprovado,
    prazoNoSap,
    motivo: !valido
      ? "Selecione o cliente para liberar condições a prazo."
      : !condicaoCadastrada
        ? "Cliente sem condição de pagamento cadastrada."
        : !creditoAprovado
          ? "Cliente sem condição a prazo no SAP e sem crédito aprovado pelo Financeiro."
          : null,
  };
}
