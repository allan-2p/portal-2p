/**
 * Ad-hoc rate limiting backed by the database.
 *
 * The platform has no native rate-limiting primitive, so counters live in
 * `public.rate_limit_hits` and are incremented through the `check_rate_limit`
 * function (service-role only). Fixed window per key.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: string | null;
};

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      _key: key,
      _limit: limit,
      _window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[rate-limit] rpc failed", error.message);
      // Fail open: never block legitimate traffic because of an infra hiccup.
      return { allowed: true, remaining: limit, resetAt: null };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: row?.allowed ?? true,
      remaining: row?.remaining ?? 0,
      resetAt: row?.reset_at ?? null,
    };
  } catch (err) {
    console.error("[rate-limit] unavailable", err);
    return { allowed: true, remaining: limit, resetAt: null };
  }
}

/** Throws a friendly error when the caller exceeded the limit. */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  label = "requisições",
): Promise<void> {
  const result = await checkRateLimit(key, limit, windowSeconds);
  if (!result.allowed) {
    const seconds = result.resetAt
      ? Math.max(1, Math.ceil((new Date(result.resetAt).getTime() - Date.now()) / 1000))
      : windowSeconds;
    throw new Error(
      `Muitas ${label} em pouco tempo. Tente novamente em ${seconds}s.`,
    );
  }
}
