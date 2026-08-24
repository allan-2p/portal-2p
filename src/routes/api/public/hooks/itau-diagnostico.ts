import { createFileRoute } from "@tanstack/react-router";
import { cronSecretValido } from "@/lib/cron-auth.server";

/**
 * Diagnóstico read-only do proxy mTLS do Itaú.
 * Autenticação: header `x-cron-secret` (segredo CRON_HOOK_SECRET).
 * Não cria cobrança e não escreve no banco.
 */
export const Route = createFileRoute("/api/public/hooks/itau-diagnostico")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!cronSecretValido(request)) return new Response("Unauthorized", { status: 401 });

        const { diagnosticarItau } = await import("@/lib/itau-diagnostico.server");
        const resultado = await diagnosticarItau();

        return new Response(JSON.stringify(resultado), {
          status: resultado.ok ? 200 : 502,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
