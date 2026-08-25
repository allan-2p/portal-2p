import { useCallback, useEffect, useState } from "react";

/**
 * Mantém a aba ativa de qualquer tela de visualização/cadastro do portal.
 *
 * Regra do portal: ao alternar entre ver e editar um registro (ou reabrir a
 * tela), o usuário permanece na mesma seção em que estava — nunca volta para
 * a primeira aba.
 *
 * A leitura do armazenamento acontece só depois da hidratação para não gerar
 * divergência entre o HTML do servidor e o do cliente.
 */
export function useAbaPersistente(chave: string, padrao: string) {
  const storageKey = `portal:aba:${chave}`;
  const [aba, setAbaState] = useState(padrao);

  useEffect(() => {
    try {
      const salva = window.sessionStorage.getItem(storageKey);
      if (salva) setAbaState(salva);
    } catch {
      /* sessionStorage indisponível: segue com o padrão */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const setAba = useCallback(
    (valor: string) => {
      setAbaState(valor);
      try {
        window.sessionStorage.setItem(storageKey, valor);
      } catch {
        /* ignora */
      }
    },
    [storageKey],
  );

  return [aba, setAba] as const;
}
