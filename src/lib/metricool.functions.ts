import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Integração com a API pública do Metricool.
 * Docs: https://app.metricool.com/api/v2
 * Auth: header `X-Mc-Auth: <token>` + query `userId=<id>&blogId=<brand>`.
 *
 * Cada brand (blogId) do Metricool corresponde a uma organização do Marketing:
 *   - solar        → METRICOOL_BRAND_SOLAR
 *   - carregadores → METRICOOL_BRAND_CARREGADORES
 *   - station      → METRICOOL_BRAND_STATION (opcional; retorna vazio se não configurada)
 */

export type MetricoolUnit = "solar" | "carregadores" | "station";

export type MetricoolFollowerRow = {
  network: "instagram" | "facebook" | "youtube" | "tiktok" | "linkedin" | "twitter";
  followers: number;
  growth: number; // variação no período
  engagementRate: number | null;
  reach: number | null;
  impressions: number | null;
};

export type MetricoolPost = {
  id: string;
  network: string;
  publishedAt: string | null;
  text: string;
  url: string | null;
  thumbnail: string | null;
  likes: number;
  comments: number;
  reach: number;
};

export type MetricoolAdsRow = {
  platform: "facebook_ads" | "google_ads" | "tiktok_ads" | "linkedin_ads";
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
};

export type MetricoolBrandData = {
  unit: MetricoolUnit;
  blogId: string | null;
  range: { start: string; end: string };
  followers: MetricoolFollowerRow[];
  posts: MetricoolPost[];
  ads: MetricoolAdsRow[];
  error: string | null;
};

const API_BASE = "https://app.metricool.com/api";

function getBrandId(unit: MetricoolUnit): string | null {
  const env = {
    solar: process.env.METRICOOL_BRAND_SOLAR,
    carregadores: process.env.METRICOOL_BRAND_CARREGADORES,
    station: process.env.METRICOOL_BRAND_STATION,
  } as const;
  return env[unit] ?? null;
}

function ymdCompact(date: string) {
  return date.replaceAll("-", "");
}

async function mcFetch(path: string, params: Record<string, string>) {
  const token = process.env.METRICOOL_USER_TOKEN;
  const userId = process.env.METRICOOL_USER_ID;
  if (!token || !userId) throw new Error("Metricool não configurado (token/userId ausentes).");
  const qs = new URLSearchParams({ userId, ...params }).toString();
  const url = `${API_BASE}${path}?${qs}`;
  const res = await fetch(url, {
    headers: { "X-Mc-Auth": token, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Metricool ${res.status}: ${body.slice(0, 240)}`);
  }
  return res.json();
}

async function safeCall<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.warn("[metricool]", (e as Error).message);
    return fallback;
  }
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

async function loadFollowers(blogId: string, start: string, end: string): Promise<MetricoolFollowerRow[]> {
  const params = { blogId, start: ymdCompact(start), end: ymdCompact(end), timezone: "America/Sao_Paulo" };
  const networks: Array<{ key: MetricoolFollowerRow["network"]; path: string }> = [
    { key: "instagram", path: "/stats/instagram" },
    { key: "facebook", path: "/stats/facebook" },
    { key: "youtube", path: "/stats/youtube" },
    { key: "tiktok", path: "/stats/tiktok" },
    { key: "linkedin", path: "/stats/linkedin" },
  ];
  const results = await Promise.all(
    networks.map(async (n) => {
      const data: any = await safeCall(() => mcFetch(n.path, params), null);
      if (!data) return null;
      // Metricool responde em formatos diferentes por rede; tentamos extrair
      // seguidores atuais e variação. Fallbacks garantem que a UI não quebre.
      const followers = num(
        data?.followers ?? data?.summary?.followers ?? data?.data?.followers ?? data?.metrics?.followers,
      );
      const growth = num(
        data?.followersGrowth ?? data?.summary?.followersGrowth ?? data?.data?.growth ?? 0,
      );
      const engagementRate = data?.engagementRate ?? data?.summary?.engagementRate ?? null;
      const reach = data?.reach ?? data?.summary?.reach ?? null;
      const impressions = data?.impressions ?? data?.summary?.impressions ?? null;
      return {
        network: n.key,
        followers,
        growth,
        engagementRate: engagementRate == null ? null : num(engagementRate),
        reach: reach == null ? null : num(reach),
        impressions: impressions == null ? null : num(impressions),
      } as MetricoolFollowerRow;
    }),
  );
  return results.filter((r): r is MetricoolFollowerRow => r != null && r.followers > 0);
}

async function loadPosts(blogId: string, start: string, end: string): Promise<MetricoolPost[]> {
  const data: any = await safeCall(
    () =>
      mcFetch("/stats/posts", {
        blogId,
        start: ymdCompact(start),
        end: ymdCompact(end),
        timezone: "America/Sao_Paulo",
      }),
    { data: [] },
  );
  const rows: any[] = data?.data ?? data?.posts ?? [];
  return rows.slice(0, 12).map((p: any) => ({
    id: String(p.id ?? p.postId ?? p.uuid ?? Math.random()),
    network: String(p.network ?? p.provider ?? p.type ?? "unknown"),
    publishedAt: p.publishedAt ?? p.date ?? null,
    text: String(p.text ?? p.caption ?? p.title ?? "").slice(0, 240),
    url: p.url ?? p.permalink ?? null,
    thumbnail: p.thumbnail ?? p.picture ?? p.image ?? null,
    likes: num(p.likes ?? p.reactions),
    comments: num(p.comments),
    reach: num(p.reach ?? p.impressions),
  }));
}

async function loadAds(blogId: string, start: string, end: string): Promise<MetricoolAdsRow[]> {
  const params = { blogId, start: ymdCompact(start), end: ymdCompact(end), timezone: "America/Sao_Paulo" };
  const platforms: Array<{ key: MetricoolAdsRow["platform"]; path: string }> = [
    { key: "facebook_ads", path: "/stats/facebookAds" },
    { key: "google_ads", path: "/stats/adwords" },
    { key: "tiktok_ads", path: "/stats/tiktokAds" },
    { key: "linkedin_ads", path: "/stats/linkedinAds" },
  ];
  const rows = await Promise.all(
    platforms.map(async (p) => {
      const data: any = await safeCall(() => mcFetch(p.path, params), null);
      if (!data) return null;
      const s = data?.summary ?? data;
      const spend = num(s?.spend ?? s?.cost);
      if (spend === 0 && !s?.impressions) return null;
      return {
        platform: p.key,
        spend,
        impressions: num(s?.impressions),
        clicks: num(s?.clicks),
        ctr: num(s?.ctr),
        cpc: num(s?.cpc),
        cpm: num(s?.cpm),
        conversions: num(s?.conversions ?? s?.results),
      } as MetricoolAdsRow;
    }),
  );
  return rows.filter((r): r is MetricoolAdsRow => r != null);
}

export const getMetricoolBrandData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { unit: MetricoolUnit; start: string; end: string }) => {
    if (!["solar", "carregadores", "station"].includes(input.unit)) throw new Error("Unidade inválida.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start) || !/^\d{4}-\d{2}-\d{2}$/.test(input.end)) {
      throw new Error("Datas inválidas (YYYY-MM-DD).");
    }
    return input;
  })
  .handler(async ({ data }): Promise<MetricoolBrandData> => {
    const blogId = getBrandId(data.unit);
    const empty: MetricoolBrandData = {
      unit: data.unit,
      blogId,
      range: { start: data.start, end: data.end },
      followers: [],
      posts: [],
      ads: [],
      error: null,
    };
    if (!blogId) {
      return { ...empty, error: `Brand ${data.unit} ainda não cadastrada no Metricool.` };
    }
    try {
      const [followers, posts, ads] = await Promise.all([
        loadFollowers(blogId, data.start, data.end),
        loadPosts(blogId, data.start, data.end),
        loadAds(blogId, data.start, data.end),
      ]);
      return { ...empty, followers, posts, ads };
    } catch (e) {
      return { ...empty, error: (e as Error).message };
    }
  });
