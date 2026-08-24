import { Skeleton } from "@/components/ui/skeleton";

/**
 * Linhas de skeleton para tabelas. Usado no primeiro carregamento das listas
 * (propostas, clientes) para dar percepção de velocidade em vez de um texto
 * "Carregando…".
 */
export function TableSkeletonRows({
  colunas,
  linhas = 6,
  larguras,
}: {
  colunas: number;
  linhas?: number;
  /** Largura relativa (classe tailwind) por coluna — opcional. */
  larguras?: string[];
}) {
  return (
    <>
      {Array.from({ length: linhas }).map((_, i) => (
        <tr key={i} className="border-b border-border/50">
          {Array.from({ length: colunas }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton className={`h-4 ${larguras?.[j] ?? (j === 1 ? "w-40" : "w-20")}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Classe utilitária: escurece/desabilita a tabela enquanto refaz a busca. */
export function fetchingClass(isFetching: boolean, isLoading = false) {
  return `transition-opacity duration-200 ${
    isFetching && !isLoading ? "opacity-50 pointer-events-none" : "opacity-100"
  }`;
}
