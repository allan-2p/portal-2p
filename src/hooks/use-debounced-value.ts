import { useEffect, useState } from "react";

/**
 * Retorna o valor com atraso: enquanto o valor muda rapidamente (digitação),
 * só propaga depois de `delay` ms sem novas mudanças. O primeiro valor é
 * devolvido imediatamente, sem atraso.
 */
export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (Object.is(value, debounced)) return;
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay, debounced]);

  return debounced;
}
