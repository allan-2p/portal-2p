import { createFileRoute } from "@tanstack/react-router";

/**
 * Versão do build em execução no servidor. O portal compara com a versão que
 * carregou no navegador e força um refresh completo quando muda (nova publicação).
 */
export const Route = createFileRoute("/api/public/app-version")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ buildId: __APP_BUILD_ID__ }), {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store, no-cache, must-revalidate",
          },
        }),
    },
  },
});
