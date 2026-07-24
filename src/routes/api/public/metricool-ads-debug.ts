import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/metricool-ads-debug")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const brand = url.searchParams.get("brand") || process.env.METRICOOL_BRAND_SOLAR!;
        const from = url.searchParams.get("from") || "2026-06-01T00:00:00";
        const to = url.searchParams.get("to") || "2026-07-24T23:59:59";
        const token = process.env.METRICOOL_USER_TOKEN!;
        const userId = process.env.METRICOOL_USER_ID!;

        const paths = [
          `/v2/analytics/campaigns/adwords?userId=${userId}&blogId=${brand}&from=${from}&to=${to}&timezone=America/Sao_Paulo`,
          `/v2/analytics/campaigns/facebookAds?userId=${userId}&blogId=${brand}&from=${from}&to=${to}&timezone=America/Sao_Paulo`,
          `/v2/analytics/timelines?userId=${userId}&blogId=${brand}&from=${from}&to=${to}&timezone=America/Sao_Paulo&network=Adwords&metric=cost&subject=account`,
          `/v2/analytics/timelines?userId=${userId}&blogId=${brand}&from=${from}&to=${to}&timezone=America/Sao_Paulo&network=FacebookAds&metric=spend&subject=account`,
          `/v2/analytics/timelines?userId=${userId}&blogId=${brand}&from=${from}&to=${to}&timezone=America/Sao_Paulo&network=Adwords&metric=impressions&subject=account`,
          `/v2/analytics/timelines?userId=${userId}&blogId=${brand}&from=${from}&to=${to}&timezone=America/Sao_Paulo&network=Adwords&metric=clicks&subject=account`,
          `/v2/analytics/timelines?userId=${userId}&blogId=${brand}&from=${from}&to=${to}&timezone=America/Sao_Paulo&network=Adwords&metric=conversions&subject=account`,
          `/v2/analytics/timelines?userId=${userId}&blogId=${brand}&from=${from}&to=${to}&timezone=America/Sao_Paulo&network=FacebookAds&metric=impressions&subject=account`,
          `/v2/analytics/timelines?userId=${userId}&blogId=${brand}&from=${from}&to=${to}&timezone=America/Sao_Paulo&network=FacebookAds&metric=clicks&subject=account`,
          `/v2/analytics/campaigns/googleAds?userId=${userId}&blogId=${brand}&from=${from}&to=${to}&timezone=America/Sao_Paulo`,
          `/v2/analytics/campaigns/metaAds?userId=${userId}&blogId=${brand}&from=${from}&to=${to}&timezone=America/Sao_Paulo`,
        ];
        const out: Record<string, unknown> = {};
        for (const p of paths) {
          const r = await fetch(`https://app.metricool.com/api${p}`, {
            headers: { "X-Mc-Auth": token, Accept: "application/json" },
          });
          const body = await r.text();
          out[p.split("?")[0] + "?" + (new URLSearchParams(p.split("?")[1]).get("network") || "campaigns") + "&" + (new URLSearchParams(p.split("?")[1]).get("metric") || "")] = {
            status: r.status,
            body: body.slice(0, 400),
          };
        }
        return Response.json(out);
      },
    },
  },
});
