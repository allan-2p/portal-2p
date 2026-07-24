import { createFileRoute } from "@tanstack/react-router";

// TEMP: inspecionar shape da resposta do Metricool. Remover após ajustar parser.
export const Route = createFileRoute("/api/public/metricool-debug")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const path = url.searchParams.get("path") || "/v2/analytics/timelines/instagram";
        const brand = url.searchParams.get("brand") || "solar";
        const days = Number(url.searchParams.get("days") || 30);
        const token = process.env.METRICOOL_USER_TOKEN;
        const userId = process.env.METRICOOL_USER_ID;
        const blogIds: Record<string, string | undefined> = {
          solar: process.env.METRICOOL_BRAND_SOLAR,
          carregadores: process.env.METRICOOL_BRAND_CARREGADORES,
          station: process.env.METRICOOL_BRAND_STATION,
        };
        const blogId = blogIds[brand];
        if (!token || !userId || !blogId) {
          return Response.json({ error: "missing env", have: { token: !!token, userId: !!userId, blogId: !!blogId, brand } }, { status: 400 });
        }
        const end = new Date();
        const start = new Date(); start.setDate(end.getDate() - days);
        const fmt = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");
        const qs = new URLSearchParams({ userId, blogId, start: fmt(start), end: fmt(end), timezone: "America/Sao_Paulo" });
        const full = `https://app.metricool.com/api${path}?${qs}`;
        const res = await fetch(full, { headers: { "X-Mc-Auth": token, Accept: "application/json" } });
        const body = await res.text();
        return new Response(
          JSON.stringify({ status: res.status, url: full.replace(token, "***"), body: body.slice(0, 20000) }, null, 2),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
