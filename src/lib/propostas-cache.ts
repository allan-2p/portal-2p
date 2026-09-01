import type { QueryClient } from "@tanstack/react-query";

/**
 * Invalida tudo que exibe proposta/pedido (listas, detalhe, variações, logs).
 *
 * Antes cada tela invalidava só a própria chave: depois de salvar, a listagem
 * atualizava mas o detalhe (`["carregadores-proposta", id]`) continuava com a
 * cópia antiga em cache — o usuário via a proposta "sem as alterações" até
 * recarregar a página.
 */
export function invalidarCachePropostas(qc: QueryClient) {
  return qc.invalidateQueries({
    predicate: (query) => {
      const raiz = String(query.queryKey?.[0] ?? "").toLowerCase();
      return (
        raiz.includes("proposta") ||
        raiz.includes("proposals") ||
        raiz.includes("pedido") ||
        raiz === "variacoes"
      );
    },
    refetchType: "active",
  });
}
