import { useEffect } from "react";

/**
 * Dispara uma ação quando a URL chega com um hash específico (ex.: `#novo`).
 *
 * Usado pelos dropdowns do menu de topo ("Nova tarefa", "Novo cliente"…),
 * que só navegam para a página e pedem a abertura do diálogo de criação.
 * O hash é limpo logo em seguida para não reabrir ao recarregar.
 */
export function useHashAction(hash: string, action: () => void) {
  useEffect(() => {
    const alvo = `#${hash.replace(/^#/, "")}`;
    const checar = () => {
      if (window.location.hash !== alvo) return;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      action();
    };
    checar();
    window.addEventListener("hashchange", checar);
    return () => window.removeEventListener("hashchange", checar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);
}
