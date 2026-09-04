import { createFileRoute } from "@tanstack/react-router";
import { reprocessarFretefyFaturados } from "@/lib/sap-nfs.server";

export const Route = createFileRoute("/api/public/hooks/fretefy-backfill")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-cron-secret")?.trim() ?? request.headers.get("x-backfill-secret")?.trim();
        const expected = process.env["CRON_HOOK_SECRET_V2"]?.trim() ?? process.env["CRON_HOOK_SECRET"]?.trim();
        if (!expected || secret !== expected) {
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
