import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Renderização incremental de listas longas.
 *
 * Em vez de montar centenas/milhares de itens de uma vez (o que trava a
 * digitação no campo de busca), devolve só os primeiros `passo` itens e
 * aumenta a fatia conforme o usuário rola até o fim da lista — ou clica em
 * "Carregar mais".
 *
 * `chave` reinicia a contagem quando o filtro muda (normalmente o termo de
 * busca já com debounce).
 */
export function useListaIncremental<T>(
  itens: T[],
  { passo = 30, chave = "" }: { passo?: number; chave?: string } = {},
) {
  const [limite, setLimite] = useState(passo);
  const sentinelaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLimite(passo);
  }, [chave, passo]);

  const total = itens.length;
  const temMais = total > limite;

  const carregarMais = useCallback(() => {
    setLimite((l) => l + passo);
  }, [passo]);

  useEffect(() => {
    if (!temMais) return;
    const el = sentinelaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) carregarMais();
      },
      { rootMargin: "120px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [temMais, carregarMais, limite]);

  return {
    visiveis: temMais ? itens.slice(0, limite) : itens,
    total,
    temMais,
    restantes: Math.max(0, total - limite),
    carregarMais,
    sentinelaRef,
  };
}

/** Normaliza texto para busca: minúsculo e sem acentos. */
export function normalizarBusca(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
