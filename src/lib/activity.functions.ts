import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";

const LogInput = z.object({
  event: z.enum(["login", "logout", "page_view", "sensitive_action"]),
  detail: z.string().max(200).optional(),
});

const AuthFailInput = z.object({
  email: z.string().email().max(200),
  reason: z.string().max(120).optional(),
});

/**
 * Registra tentativa de login malsucedida. Endpoint público (o usuário ainda
 * não tem sessão), protegido por rate limit por IP e sem eco de dados.
 */
export const logAuthFailure = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AuthFailInput.parse(d))
  .handler(async ({ data }) => {
    const { enforceRateLimit, clientIp } = await import("@/lib/rate-limit.server");
    const { recordAudit } = await import("@/lib/audit.server");
    await enforceRateLimit(`auth_fail:${clientIp()}`, 20, 60, "tentativas de login");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();
    await recordAudit({
      userId: profile?.id ?? null,
      email: data.email,
      event: "login_failed",
      detail: data.reason ?? "credenciais inválidas",
    });
    return { ok: true };
  });

/** Registra um evento de atividade do usuário autenticado. */
export const logUserActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LogInput.parse(d))
  .handler(async ({ data, context }) => {
    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const ua = getRequestHeader("user-agent") ?? null;
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("email")
      .eq("id", context.userId)
      .maybeSingle();
    await context.supabase.from("user_activity_log").insert({
      user_id: context.userId,
      email: profile?.email ?? null,
      event: data.event,
      detail: data.detail ?? null,
      ip,
      user_agent: ua ? ua.slice(0, 300) : null,
    });
    return { ok: true };
  });

export type ActivityRow = {
  id: string;
  user_id: string;
  email: string | null;
  event: string;
  detail: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

export type ActivityUserSummary = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  logins: number;
  last_login: string | null;
  last_event: string | null;
};

const ListInput = z.object({
  event: z
    .enum(["all", "login", "logout", "login_failed", "page_view", "integration", "sensitive_action"])
    .default("all"),
  user_id: z.string().uuid().nullable().optional(),
  days: z.number().int().min(1).max(365).default(30),
  limit: z.number().int().min(10).max(500).default(200),
});

export const adminListUserActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ rows: ActivityRow[]; summary: ActivityUserSummary[] }> => {
      const { data: isAdmin } = await context.supabase.rpc("is_admin");
      if (!isAdmin) throw new Error("Forbidden: admin role required");

      const since = new Date(Date.now() - data.days * 86400_000).toISOString();
      let q = context.supabase
        .from("user_activity_log")
        .select("id, user_id, email, event, detail, ip, user_agent, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(data.limit);
      if (data.event !== "all") q = q.eq("event", data.event);
      if (data.user_id) q = q.eq("user_id", data.user_id);
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);

      // Resumo por usuário (período completo do filtro de dias)
      const { data: all } = await context.supabase
        .from("user_activity_log")
        .select("user_id, email, event, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);

      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, email, full_name");
      const nameById = new Map<string, { email: string | null; full_name: string | null }>(
        (profiles ?? []).map((p: any) => [p.id, { email: p.email, full_name: p.full_name }]),
      );

      const map = new Map<string, ActivityUserSummary>();
      for (const r of (all ?? []) as any[]) {
        const prof = nameById.get(r.user_id);
        const cur =
          map.get(r.user_id) ??
          ({
            user_id: r.user_id,
            email: prof?.email ?? r.email ?? null,
            full_name: prof?.full_name ?? null,
            logins: 0,
            last_login: null,
            last_event: null,
          } as ActivityUserSummary);
        if (r.event === "login") {
          cur.logins += 1;
          if (!cur.last_login) cur.last_login = r.created_at;
        }
        if (!cur.last_event) cur.last_event = r.created_at;
        map.set(r.user_id, cur);
      }

      return {
        rows: (rows ?? []) as ActivityRow[],
        summary: Array.from(map.values()).sort((a, b) =>
          (b.last_event ?? "").localeCompare(a.last_event ?? ""),
        ),
      };
    },
  );
