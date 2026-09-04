import { createFileRoute } from "@tanstack/react-router";
import { cronSecretValido } from "@/lib/cron-auth.server";
import { reprocessarFretefyFaturados } from "@/lib/sap-nfs.server";

export const Route = createFileRoute("/api/public/hooks/fretefy-backfill")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!cronSecretValido(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const limite = Number(body["limite"] ?? 50) || 50;
        const r = await reprocessarFretefyFaturados(limite);
        return Response.json(r);
      },
    },
  },
});
