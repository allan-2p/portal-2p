import { useEffect, useRef } from "react";
import { hardReload } from "@/lib/chunk-reload";

const ENDPOINT = "/api/public/app-version";
const INTERVALO_MS = 60_000;

/**
 * Detecta nova publicação do portal e força um refresh completo, para que
 * ninguém fique preso numa versão antiga em cache.
 */
export function useAppVersionRefresh() {
  const carregado = useRef<string | null>(null);
  const recarregando = useRef(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let cancelado = false;

    const checar = async () => {
      if (cancelado || recarregando.current || document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`${ENDPOINT}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const { buildId } = (await res.json()) as { buildId?: string };
        if (!buildId) return;
        if (carregado.current === null) {
          carregado.current = buildId;
          return;
        }
        if (buildId !== carregado.current) {
          recarregando.current = true;
          await hardReload();
        }
      } catch {
        /* offline / rede instável: tenta de novo no próximo ciclo */
      }
    };

    carregado.current = typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : null;
    void checar();
    const timer = window.setInterval(checar, INTERVALO_MS);
    const onFocus = () => void checar();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      cancelado = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);
}
