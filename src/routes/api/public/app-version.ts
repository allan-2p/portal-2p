import { createFileRoute } from "@tanstack/react-router";

/** Injetado pelo Vite (define __APP_BUILD_ID__ em vite.config.ts). */
const BUILD_ID: string =
  (globalThis as Record<string, unknown>)["__APP_BUILD_ID__"] as string | undefined ?? "dev";

/**
 * Versão do build em execução no servidor. O portal compara com a versão que
 * carregou no navegador e força um refresh completo quando muda (nova publicação).
 */
export const Route = createFileRoute("/api/public/app-version")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ buildId: BUILD_ID }), {

          headers: {
            "content-type": "application/json",
            "cache-control": "no-store, no-cache, must-revalidate",
          },
        }),
    },
  },
});
