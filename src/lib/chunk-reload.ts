/**
 * Recuperação de "versão antiga presa no navegador".
 *
 * Quando o portal é publicado, os arquivos JS antigos deixam de existir. Uma
 * aba aberta há horas continua tentando baixar o pedaço antigo ao navegar ou
 * ao abrir um filtro/tela carregada sob demanda — o download falha e a tela
 * de erro aparece. Nesses casos a resposta certa não é mostrar erro: é limpar
 * o cache e recarregar uma vez, sozinho.
 */

const MARCA = "portal2p-chunk-reload";
const JANELA_MS = 60_000;

const PADROES = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /chunkloaderror/i,
  /loading chunk \S+ failed/i,
  /loading css chunk/i,
  /'text\/html' is not a valid javascript mime type/i,
  /expected a javascript(-or-wasm)? module script/i,
];

/** O erro é "arquivo do app sumiu/mudou" (publicação nova) e não um bug real? */
export function ehErroDeVersaoAntiga(error: unknown): boolean {
  const msg =
    typeof error === "string"
      ? error
      : `${(error as { name?: string })?.name ?? ""} ${(error as Error)?.message ?? ""}`;
  return PADROES.some((p) => p.test(msg));
}

/** Limpa service workers e caches e recarrega (equivale ao ctrl+shift+r). */
export async function hardReload() {
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
 * Recarrega uma única vez por janela de tempo — evita laço infinito caso o
 * problema não seja de cache.
 */
export function recarregarPorVersaoAntiga(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ultimo = Number(sessionStorage.getItem(MARCA) ?? "0");
    if (Date.now() - ultimo < JANELA_MS) return false;
    sessionStorage.setItem(MARCA, String(Date.now()));
  } catch {
    /* sessionStorage indisponível: segue e recarrega mesmo assim */
  }
  void hardReload();
  return true;
}

/** Escuta falhas de carregamento de módulo em qualquer ponto da aplicação. */
export function ouvirErrosDeVersaoAntiga(): () => void {
  const trata = (motivo: unknown) => {
    if (ehErroDeVersaoAntiga(motivo)) recarregarPorVersaoAntiga();
  };
  const onRejection = (e: PromiseRejectionEvent) => trata(e.reason);
  const onError = (e: ErrorEvent) => trata(e.error ?? e.message);
  const onPreload = (e: Event) => trata((e as Event & { payload?: unknown }).payload);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("error", onError);
  window.addEventListener("vite:preloadError", onPreload);
  return () => {
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("error", onError);
    window.removeEventListener("vite:preloadError", onPreload);
  };
}
