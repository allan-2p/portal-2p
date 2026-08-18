import { useEffect, useRef } from "react";

const ENDPOINT = "/api/public/app-version";
const INTERVALO_MS = 60_000;

/** Limpa tudo que pode segurar a versão antiga e recarrega (equivale ao ctrl+shift+r). */
async function hardReload() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* noop */
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* noop */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("v", String(Date.now()));
  window.location.replace(url.toString());
}

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
