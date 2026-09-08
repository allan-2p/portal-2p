import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Paginação simples e reaproveitável para listas grandes (tarefas, etc).
 * Mantém a página válida quando a lista muda de tamanho ou de filtro.
 */
export function usePaginacao<T>(itens: T[], porPaginaInicial = 10, chaveReset?: unknown) {
  const [porPagina, setPorPagina] = useState(porPaginaInicial);
  const [pagina, setPagina] = useState(1);

  const total = itens.length;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  useEffect(() => {
    setPagina(1);
  }, [chaveReset, porPagina]);

  useEffect(() => {
    setPagina((p) => Math.min(p, Math.max(1, Math.ceil(total / porPagina))));
  }, [total, porPagina]);

  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * porPagina;
  const pageItens = useMemo(
    () => itens.slice(inicio, inicio + porPagina),
    [itens, inicio, porPagina],
  );

  return {
    pageItens,
    props: {
      pagina: paginaAtual,
      totalPaginas,
      total,
      porPagina,
      inicio,
      onPagina: setPagina,
      onPorPagina: setPorPagina,
    },
  };
}

export type PaginacaoProps = {
  pagina: number;
  totalPaginas: number;
  total: number;
  porPagina: number;
  inicio: number;
  onPagina: (p: number) => void;
  onPorPagina: (n: number) => void;
  className?: string;
};

export function Paginacao({
  pagina,
  totalPaginas,
  total,
  porPagina,
  inicio,
  onPagina,
  onPorPagina,
  className,
}: PaginacaoProps) {
  if (total === 0) return null;
  const fim = Math.min(inicio + porPagina, total);

  const paginas: (number | "…")[] = [];
  for (let p = 1; p <= totalPaginas; p++) {
    if (p === 1 || p === totalPaginas || Math.abs(p - pagina) <= 1) paginas.push(p);
    else if (paginas[paginas.length - 1] !== "…") paginas.push("…");
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border",
        className,
      )}
    >
      <div className="text-xs text-muted-foreground">
        Mostrando {inicio + 1}–{fim} de {total}
      </div>
      <div className="flex items-center gap-2">
        <Select value={String(porPagina)} onValueChange={(v) => onPorPagina(Number(v))}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50, 100].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} por página
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={() => onPagina(Math.max(1, pagina - 1))}
          disabled={pagina <= 1}
          aria-label="Página anterior"
          className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-2 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {paginas.map((p, i) =>
          p === "…" ? (
            <span key={`s${i}`} className="text-xs text-muted-foreground px-1">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPagina(p)}
              className={cn(
                "min-w-8 h-8 px-2 rounded-lg border text-xs font-medium",
                p === pagina
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-surface border-border hover:bg-surface-2",
              )}
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onPagina(Math.min(totalPaginas, pagina + 1))}
          disabled={pagina >= totalPaginas}
          aria-label="Próxima página"
          className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-2 disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
