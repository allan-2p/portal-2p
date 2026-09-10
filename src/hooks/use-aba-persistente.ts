import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

/**
 * Mantém a aba ativa de qualquer tela de visualização/cadastro do portal.
 *
 * Regras do portal:
 * - ao alternar entre ver e editar um registro (ou reabrir a tela), o usuário
 *   permanece na mesma seção — nunca volta para a primeira aba;
 * - cada troca de aba vira uma entrada no histórico do navegador, então o botão
 *   "voltar" devolve o usuário exatamente para a aba anterior;
 * - links do menu lateral que apontam para uma aba (via hash) trocam a aba na
 *   hora, mesmo estando já na mesma tela.
 *
 * A leitura do armazenamento acontece só depois da hidratação para não gerar
 * divergência entre o HTML do servidor e o do cliente.
 */
export function useAbaPersistente(chave: string, padrao: string) {
  const storageKey = `portal:aba:${chave}`;
  const [aba, setAbaState] = useState(padrao);
  const abaRef = useRef(padrao);
  const navigate = useNavigate();
  const hashAtual = useRouterState({ select: (s) => s.location.hash });

  const lerDoHash = useCallback(
    (hash: string): string | null => {
      const limpo = (hash ?? "").replace(/^#/, "");
      if (!limpo) return null;
      return new URLSearchParams(limpo).get(`aba:${chave}`);
    },
    [chave],
  );

  const gravar = useCallback(
    (valor: string) => {
      try {
        // localStorage sobrevive a refresh e a reabertura do navegador.
        window.localStorage.setItem(storageKey, valor);
      } catch {
        /* ignora */
      }
      try {
        window.sessionStorage.setItem(storageKey, valor);
      } catch {
        /* ignora */
      }
    },
    [storageKey],
  );

  const lerArmazenado = useCallback((): string | null => {
    try {
      return (
        window.localStorage.getItem(storageKey) ??
        window.sessionStorage.getItem(storageKey)
      );
    } catch {
      return null;
    }
  }, [storageKey]);

  const aplicar = useCallback((valor: string) => {
    abaRef.current = valor;
    setAbaState(valor);
  }, []);

  // Estado inicial: sessão anterior (o hash é tratado no efeito abaixo).
  useEffect(() => {
    if (lerDoHash(window.location.hash)) return;
    const salvo = lerArmazenado();
    if (salvo) aplicar(salvo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // O hash da URL manda: deep link, menu lateral e voltar/avançar do navegador.
  useEffect(() => {
    const alvo = lerDoHash(hashAtual);
    if (alvo && alvo !== abaRef.current) {
      aplicar(alvo);
      gravar(alvo);
    }
  }, [hashAtual, lerDoHash, aplicar, gravar]);

  const setAba = useCallback(
    (valor: string) => {
      if (valor === abaRef.current) return;
      aplicar(valor);
      gravar(valor);
      const params = new URLSearchParams((hashAtual ?? "").replace(/^#/, ""));
      params.set(`aba:${chave}`, valor);
      void navigate({ hash: params.toString(), resetScroll: false } as any);
    },
    [chave, gravar, aplicar, hashAtual, navigate],
  );

  return [aba, setAba] as const;
}
