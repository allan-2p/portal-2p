import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Mantém a aba ativa de qualquer tela de visualização/cadastro do portal.
 *
 * Regras do portal:
 * - ao alternar entre ver e editar um registro (ou reabrir a tela), o usuário
 *   permanece na mesma seção — nunca volta para a primeira aba;
 * - cada troca de aba vira uma entrada no histórico do navegador, então o botão
 *   "voltar" devolve o usuário exatamente para a aba anterior.
 *
 * A leitura do armazenamento acontece só depois da hidratação para não gerar
 * divergência entre o HTML do servidor e o do cliente.
 */
export function useAbaPersistente(chave: string, padrao: string) {
  const storageKey = `portal:aba:${chave}`;
  const [aba, setAbaState] = useState(padrao);
  const abaRef = useRef(padrao);

  const lerHash = useCallback((): string | null => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    return params.get(`aba:${chave}`);
  }, [chave]);

  const aplicar = useCallback((valor: string) => {
    abaRef.current = valor;
    setAbaState(valor);
  }, []);

  // Estado inicial: hash da URL (deep link / restauração) e depois a sessão.
  useEffect(() => {
    let inicial: string | null = null;
    try {
      inicial = lerHash();
      if (!inicial) inicial = window.sessionStorage.getItem(storageKey);
    } catch {
      /* armazenamento indisponível: segue com o padrão */
    }
    if (inicial) aplicar(inicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Voltar/avançar no navegador devolve a aba correspondente à entrada.
  useEffect(() => {
    function onPop() {
      const doHash = lerHash();
      const alvo = doHash ?? padrao;
      if (alvo !== abaRef.current) {
        aplicar(alvo);
        try {
          window.sessionStorage.setItem(storageKey, alvo);
        } catch {
          /* ignora */
        }
      }
    }
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
  }, [lerHash, padrao, storageKey, aplicar]);

  const setAba = useCallback(
    (valor: string) => {
      if (valor === abaRef.current) return;
      aplicar(valor);
      try {
        window.sessionStorage.setItem(storageKey, valor);
      } catch {
        /* ignora */
      }
      try {
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        params.set(`aba:${chave}`, valor);
        const url = `${window.location.pathname}${window.location.search}#${params.toString()}`;
        window.history.pushState(window.history.state, "", url);
      } catch {
        /* ignora */
      }
    },
    [chave, storageKey, aplicar],
  );

  return [aba, setAba] as const;
}
