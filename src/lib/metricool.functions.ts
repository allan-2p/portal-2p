import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Cliente do Metricool (API v2) para o portal 2P.
 *
 * Autenticação: header `X-Mc-Auth: <userToken>` + query `userId=<id>&blogId=<brand>`.
 * Docs empíricos (validados neste projeto):
 *   - GET /v2/analytics/timelines?network=<Network>&metric=<Metric>&subject=account
 *   - GET /v2/analytics/posts/instagram
 *   - GET /v2/analytics/reels/instagram
 *   - GET /v2/analytics/stories/instagram
 *
 * Cada brand (blogId) representa uma organização de marketing:
 *   solar        → METRICOOL_BRAND_SOLAR
 *   carregadores → METRICOOL_BRAND_CARREGADORES
 *   station      → METRICOOL_BRAND_STATION (opcional)
 */

export type MetricoolUnit = "solar" | "carregadores" | "station";

export type NetworkKey = "instagram" | "facebook" | "youtube" | "tiktok" | "linkedin" | "twitter";

export type MetricoolFollowerRow = {
  network: NetworkKey;
  followers: number;
  growth: number; // variação absoluta no período
  reach: number | null;
  engaged: number | null;
};

export type MetricoolPost = {
  id: string;
  network: NetworkKey;
  publishedAt: string | null;
  text: string;
  url: string | null;
  thumbnail: string | null;
  likes: number;
  comments: number;
  reach: number;
  interactions: number;
  engagement: number; // %
};

export type MetricoolBrandData = {
  unit: MetricoolUnit;
  blogId: string | null;
  range: { start: string; end: string };
  followers: MetricoolFollowerRow[];
  posts: MetricoolPost[];
  error: string | null;
};

const API_BASE = "https://app.metricool.com/api";

function getBrandId(unit: MetricoolUnit): string | null {
  const env: Record<MetricoolUnit, string | undefined> = {
    solar: process.env.METRICOOL_BRAND_SOLAR,
    carregadores: process.env.METRICOOL_BRAND_CARREGADORES,
    station: process.env.METRICOOL_BRAND_STATION,
  };
  return env[unit] ?? null;
}

async function mcFetch(path: string, params: Record<string, string>) {
  const token = process.env.METRICOOL_USER_TOKEN;
  const userId = process.env.METRICOOL_USER_ID;
  if (!token || !userId) throw new Error("Metricool não configurado (token/userId ausentes).");
  const qs = new URLSearchParams({ userId, ...params }).toString();
  const res = await fetch(`${API_BASE}${path}?${qs}`, {
    headers: { "X-Mc-Auth": token, Accept: "application/json" },
  });
  const body = await res.text();
  if (!res.ok) {
    // 403 = rede desconectada nessa brand; devolve null pra deixar UI vazia sem quebrar.
    if (res.status === 403 || res.status === 404) return null;
    throw new Error(`Metricool ${res.status}: ${body.slice(0, 240)}`);
  }
  try { return JSON.parse(body); } catch { return null; }
}

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> {
  try { return await fn(); } catch (e) { console.warn("[metricool]", (e as Error).message); return fb; }
}

type Timeline = { data?: Array<{ metric: string; values: Array<{ dateTime: string; value: number }> }> };

function latestValue(t: Timeline | null): number {
  const values = t?.data?.[0]?.values ?? [];
  if (!values.length) return 0;
  // Metricool retorna a série ordenada; pegamos a mais recente por dateTime.
  const sorted = [...values].sort((a, b) => a.dateTime.localeCompare(b.dateTime));
  return Math.round(sorted[sorted.length - 1]?.value ?? 0);
}

function growthValue(t: Timeline | null): number {
  const values = t?.data?.[0]?.values ?? [];
  if (values.length < 2) return 0;
  const sorted = [...values].sort((a, b) => a.dateTime.localeCompare(b.dateTime));
  return Math.round((sorted[sorted.length - 1]?.value ?? 0) - (sorted[0]?.value ?? 0));
}

function sumValues(t: Timeline | null): number {
  const values = t?.data?.[0]?.values ?? [];
  return Math.round(values.reduce((a, b) => a + (b.value ?? 0), 0));
}

function baseParams(blogId: string, start: string, end: string) {
  // Metricool exige datetime ISO até segundos: yyyy-MM-ddTHH:mm:ss
  const from = `${start}T00:00:00`;
  const to = `${end}T23:59:59`;
  return { blogId, from, to, timezone: "America/Sao_Paulo" } as Record<string, string>;
}

async function loadTimeline(blogId: string, start: string, end: string, network: string, metric: string) {
  return safe<Timeline | null>(
    () => mcFetch("/v2/analytics/timelines", { ...baseParams(blogId, start, end), network, metric, subject: "account" }) as Promise<Timeline | null>,
    null,
  );
}

async function loadInstagram(blogId: string, start: string, end: string): Promise<MetricoolFollowerRow | null> {
  const [followers, reach, engaged] = await Promise.all([
    loadTimeline(blogId, start, end, "Instagram", "Followers"),
    loadTimeline(blogId, start, end, "Instagram", "reach"),
    loadTimeline(blogId, start, end, "Instagram", "accounts_engaged"),
  ]);
  const current = latestValue(followers);
  if (!current) return null;
  return {
    network: "instagram",
    followers: current,
    growth: growthValue(followers),
    reach: sumValues(reach) || null,
    engaged: sumValues(engaged) || null,
  };
}

async function loadFacebook(blogId: string, start: string, end: string): Promise<MetricoolFollowerRow | null> {
  const [followers, reach] = await Promise.all([
    loadTimeline(blogId, start, end, "Facebook", "pageFollows"),
    loadTimeline(blogId, start, end, "Facebook", "pageImpressions"),
  ]);
  const current = latestValue(followers);
  if (!current) return null;
  return {
    network: "facebook",
    followers: current,
    growth: growthValue(followers),
    reach: sumValues(reach) || null,
    engaged: null,
  };
}

async function loadYoutube(blogId: string, start: string, end: string): Promise<MetricoolFollowerRow | null> {
  const [subs, views] = await Promise.all([
    loadTimeline(blogId, start, end, "Youtube", "totalSubscribers"),
    loadTimeline(blogId, start, end, "Youtube", "views"),
  ]);
  const current = latestValue(subs);
  if (!current) return null;
  return {
    network: "youtube",
    followers: current,
    growth: growthValue(subs),
    reach: sumValues(views) || null,
    engaged: null,
  };
}

async function loadTiktok(blogId: string, start: string, end: string): Promise<MetricoolFollowerRow | null> {
  const t = await loadTimeline(blogId, start, end, "Tiktok", "followers");
  const current = latestValue(t);
  if (!current) return null;
  return { network: "tiktok", followers: current, growth: growthValue(t), reach: null, engaged: null };
}

async function loadLinkedin(blogId: string, start: string, end: string): Promise<MetricoolFollowerRow | null> {
  const t = await loadTimeline(blogId, start, end, "Linkedin", "followers");
  const current = latestValue(t);
  if (!current) return null;
  return { network: "linkedin", followers: current, growth: growthValue(t), reach: null, engaged: null };
}

async function loadInstagramPosts(blogId: string, start: string, end: string): Promise<MetricoolPost[]> {
  const data: any = await safe(
    () => mcFetch("/v2/analytics/posts/instagram", baseParams(blogId, start, end)),
    null,
  );
  const rows: any[] = data?.data ?? [];
  return rows
    .map((p) => ({
      id: String(p.postId ?? Math.random()),
      network: "instagram" as const,
      publishedAt: p.publishedAt?.dateTime ?? null,
      text: String(p.content ?? "").slice(0, 240),
      url: p.url ?? null,
      thumbnail: p.imageUrl ?? null,
      likes: Number(p.likes ?? 0),
      comments: Number(p.comments ?? 0),
      reach: Number(p.reach ?? 0),
      interactions: Number(p.interactions ?? 0),
      engagement: Number(p.engagement ?? 0),
    }))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, 12);
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
      error: null,
    };
    if (!blogId) {
      return { ...empty, error: `Brand ${data.unit} ainda não cadastrada no Metricool.` };
    }
    try {
      const [ig, fb, yt, tt, li, posts] = await Promise.all([
        loadInstagram(blogId, data.start, data.end),
        loadFacebook(blogId, data.start, data.end),
        loadYoutube(blogId, data.start, data.end),
        loadTiktok(blogId, data.start, data.end),
        loadLinkedin(blogId, data.start, data.end),
        loadInstagramPosts(blogId, data.start, data.end),
      ]);
      const followers = [ig, fb, yt, tt, li].filter((r): r is MetricoolFollowerRow => r != null);
      return { ...empty, followers, posts };
    } catch (e) {
      return { ...empty, error: (e as Error).message };
    }
  });
