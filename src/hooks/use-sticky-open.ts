import { useEffect, useState } from "react";

/**
 * Estado aberto/fechado de menus e toggles que **persiste** entre navegações e
 * recarregamentos.
 *
 * Dois níveis:
 * - cache em memória (módulo): o AppLayout é remontado a cada rota, então sem
 *   isso o menu voltaria ao estado inicial em toda navegação (com "piscada");
 * - `localStorage`: mantém a escolha entre sessões/reloads.
 *
 * O valor inicial vem do cache (igual no servidor e no cliente na primeira
 * renderização) e o `localStorage` é lido no `useEffect` para não causar
 * divergência de hidratação.
 */
const cache: Record<string, boolean> = {};

export function useStickyOpen(key: string, padrao: boolean) {
  const [aberto, setAberto] = useState<boolean>(() => cache[key] ?? padrao);

  useEffect(() => {
    if (key in cache) return;
    try {
      const salvo = localStorage.getItem(key);
      if (salvo !== null) {
        const v = salvo === "1";
        cache[key] = v;
        setAberto(v);
      }
    } catch {
      /* localStorage indisponível (modo privado): mantém o padrão */
    }
  }, [key]);

  const definir = (valor: boolean) => {
    cache[key] = valor;
    try {
      localStorage.setItem(key, valor ? "1" : "0");
    } catch {
      /* ignora */
    }
    setAberto(valor);
  };

  const alternar = () => definir(!aberto);

  return [aberto, alternar, definir] as const;
}
