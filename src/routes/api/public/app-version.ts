import { createFileRoute } from "@tanstack/react-router";

/** Injetado pelo Vite (define __APP_BUILD_ID__ em vite.config.ts). */
declare const __APP_BUILD_ID__: string;
const BUILD_ID: string = typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "dev";


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
