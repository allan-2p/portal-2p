import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


/** Guard por tela/ação (default deny) — admin, acesso total ou perfil com a tela. */
async function assertFeature(
  ctx: { supabase: any; userId: string },
  feature: any,
  action: any = "visualizar",
) {
  const { requireAdminFeature } = await import("@/lib/guards.server");
  await requireAdminFeature(ctx, feature, action);
}


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

/**
 * Registra um evento de atividade do usuário autenticado.
 *
 * A gravação é feita pelo servidor (service role) com e-mail, IP e user-agent
 * derivados da sessão/requisição — o cliente só informa evento e detalhe, e não
 * possui permissão de INSERT direto na tabela de logs.
 */
export const logUserActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LogInput.parse(d))
  .handler(async ({ data, context }) => {
    const { recordAudit } = await import("@/lib/audit.server");
    await recordAudit({
      userId: context.userId,
      event: data.event,
      detail: data.detail ?? null,
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
      await assertFeature(context, "admin.atividade", "visualizar");

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

export type ActivityDashboard = {
  totals: { logins: number; failures: number; integrations: number; activeUsers: number };
  trend: { bucket: string; logins: number; failures: number; integrations: number }[];
  failures: { reason: string; count: number }[];
  integrations: { name: string; count: number }[];
  topActions: { action: string; count: number }[];
};

const DashInput = z.object({
  days: z.number().int().min(1).max(365).default(30),
  granularity: z.enum(["day", "week", "month"]).default("day"),
});

export const adminActivityDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DashInput.parse(d))
  .handler(async ({ data, context }): Promise<ActivityDashboard> => {
    await assertFeature(context, "admin.atividade", "visualizar");

    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("user_activity_log")
      .select("user_id, event, detail, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(20000);
    if (error) throw new Error(error.message);

    const bucketOf = (iso: string) => {
      const d = new Date(iso);
      if (data.granularity === "month") return iso.slice(0, 7);
      if (data.granularity === "week") {
        const w = new Date(d);
        w.setUTCDate(w.getUTCDate() - ((w.getUTCDay() + 6) % 7));
        return w.toISOString().slice(0, 10);
      }
      return iso.slice(0, 10);
    };

    const trend = new Map<string, { logins: number; failures: number; integrations: number }>();
    const failures = new Map<string, number>();
    const integrations = new Map<string, number>();
    const actions = new Map<string, number>();
    const users = new Set<string>();
    let logins = 0;
    let failCount = 0;
    let integCount = 0;

    for (const r of (rows ?? []) as any[]) {
      const b = bucketOf(r.created_at);
      const cur = trend.get(b) ?? { logins: 0, failures: 0, integrations: 0 };
      if (r.event === "login") {
        cur.logins += 1;
        logins += 1;
        if (r.user_id) users.add(r.user_id);
      } else if (r.event === "login_failed") {
        cur.failures += 1;
        failCount += 1;
        const reason = (r.detail ?? "não informado").slice(0, 60);
        failures.set(reason, (failures.get(reason) ?? 0) + 1);
      } else if (r.event === "integration") {
        cur.integrations += 1;
        integCount += 1;
        const parts = String(r.detail ?? "").split("•").map((s) => s.trim());
        const name = parts[0] || "outros";
        integrations.set(name, (integrations.get(name) ?? 0) + 1);
        const action = parts.slice(0, 2).filter(Boolean).join(" • ") || name;
        actions.set(action, (actions.get(action) ?? 0) + 1);
      }
      trend.set(b, cur);
    }

    const sorted = (m: Map<string, number>, key: "reason" | "name" | "action") =>
      Array.from(m.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([k, count]) => ({ [key]: k, count })) as any[];

    return {
      totals: { logins, failures: failCount, integrations: integCount, activeUsers: users.size },
      trend: Array.from(trend.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([bucket, v]) => ({ bucket, ...v })),
      failures: sorted(failures, "reason"),
      integrations: sorted(integrations, "name"),
      topActions: sorted(actions, "action"),
    };
  });

export type SecurityAlert = {
  id: string;
  severity: "alta" | "media";
  kind: "ip_brute_force" | "email_brute_force" | "ip_multi_email" | "email_multi_ip";
  subject: string;
  count: number;
  distinct: number;
  firstAt: string;
  lastAt: string;
  samples: string[];
  message: string;
};

const AlertInput = z.object({
  windowMinutes: z.number().int().min(5).max(1440).default(60),
  failThreshold: z.number().int().min(3).max(50).default(5),
});

/** Detecta padrões suspeitos de autenticação (brute force por IP/e-mail). */
export const adminSecurityAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AlertInput.parse(d))
  .handler(async ({ data, context }): Promise<{ alerts: SecurityAlert[]; windowMinutes: number }> => {
    await assertFeature(context, "admin.atividade", "visualizar");

    const since = new Date(Date.now() - data.windowMinutes * 60_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("user_activity_log")
      .select("email, ip, detail, created_at")
      .eq("event", "login_failed")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);

    type Agg = { count: number; first: string; last: string; peers: Set<string>; reasons: Set<string> };
    const byIp = new Map<string, Agg>();
    const byEmail = new Map<string, Agg>();

    const push = (m: Map<string, Agg>, key: string, peer: string, r: any) => {
      const a = m.get(key) ?? {
        count: 0,
        first: r.created_at,
        last: r.created_at,
        peers: new Set<string>(),
        reasons: new Set<string>(),
      };
      a.count += 1;
      a.last = r.created_at;
      if (peer) a.peers.add(peer);
      if (r.detail) a.reasons.add(String(r.detail).slice(0, 60));
      m.set(key, a);
    };

    for (const r of (rows ?? []) as any[]) {
      const ip = (r.ip ?? "").trim();
      const email = (r.email ?? "").trim().toLowerCase();
      if (ip) push(byIp, ip, email, r);
      if (email) push(byEmail, email, ip, r);
    }

    const alerts: SecurityAlert[] = [];

    for (const [ip, a] of byIp) {
      if (a.count >= data.failThreshold) {
        alerts.push({
          id: `ip:${ip}`,
          severity: a.count >= data.failThreshold * 2 ? "alta" : "media",
          kind: "ip_brute_force",
          subject: ip,
          count: a.count,
          distinct: a.peers.size,
          firstAt: a.first,
          lastAt: a.last,
          samples: Array.from(a.peers).slice(0, 5),
          message: `${a.count} falhas de login vindas do IP ${ip}.`,
        });
      }
      if (a.peers.size >= 3) {
        alerts.push({
          id: `ip-multi:${ip}`,
          severity: "alta",
          kind: "ip_multi_email",
          subject: ip,
          count: a.count,
          distinct: a.peers.size,
          firstAt: a.first,
          lastAt: a.last,
          samples: Array.from(a.peers).slice(0, 5),
          message: `IP ${ip} tentou entrar com ${a.peers.size} e-mails diferentes (possível varredura).`,
        });
      }
    }

    for (const [email, a] of byEmail) {
      if (a.count >= data.failThreshold) {
        alerts.push({
          id: `email:${email}`,
          severity: a.count >= data.failThreshold * 2 ? "alta" : "media",
          kind: "email_brute_force",
          subject: email,
          count: a.count,
          distinct: a.peers.size,
          firstAt: a.first,
          lastAt: a.last,
          samples: Array.from(a.reasons).slice(0, 3),
          message: `${a.count} tentativas malsucedidas na conta ${email}.`,
        });
      }
      if (a.peers.size >= 3) {
        alerts.push({
          id: `email-multi:${email}`,
          severity: "alta",
          kind: "email_multi_ip",
          subject: email,
          count: a.count,
          distinct: a.peers.size,
          firstAt: a.first,
          lastAt: a.last,
          samples: Array.from(a.peers).slice(0, 5),
          message: `Conta ${email} recebeu tentativas de ${a.peers.size} IPs diferentes.`,
        });
      }
    }

    alerts.sort(
      (x, y) =>
        (x.severity === y.severity ? 0 : x.severity === "alta" ? -1 : 1) || y.count - x.count,
    );

    return { alerts: alerts.slice(0, 30), windowMinutes: data.windowMinutes };
  });

/* ------------------------------------------------------------------ *
 * Retenção e arquivamento de logs (compliance + performance)
 * ------------------------------------------------------------------ */

const RetentionInput = z.object({
  hotDays: z.number().int().min(7).max(3650),
  archiveDays: z.number().int().min(30).max(3650),
  enabled: z.boolean(),
});

/** Lê a política atual, últimas execuções e volumetria das tabelas. */
export const adminGetLogRetention = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFeature(context, "admin.logs.retencao", "visualizar");
    const [{ data: policy }, { data: runs }] = await Promise.all([
      context.supabase.from("log_retention_policy").select("*").eq("id", 1).maybeSingle(),
      context.supabase
        .from("log_retention_runs")
        .select("*")
        .order("ran_at", { ascending: false })
        .limit(10),
    ]);
    if (!policy) throw new Error("Acesso restrito a administradores.");

    const cutoff = new Date(Date.now() - policy.hot_days * 86400000).toISOString();
    const [hot, pending, archived] = await Promise.all([
      context.supabase.from("user_activity_log").select("id", { count: "exact", head: true }),
      context.supabase
        .from("user_activity_log")
        .select("id", { count: "exact", head: true })
        .lt("created_at", cutoff),
      context.supabase
        .from("user_activity_log_archive")
        .select("id", { count: "exact", head: true }),
    ]);

    return {
      policy: {
        hotDays: policy.hot_days,
        archiveDays: policy.archive_days,
        enabled: policy.enabled,
        updatedAt: policy.updated_at,
      },
      runs: runs ?? [],
      counts: {
        hot: hot.count ?? 0,
        pending: pending.count ?? 0,
        archived: archived.count ?? 0,
      },
    };
  });

/** Atualiza os prazos de retenção (somente admin, garantido por RLS). */
export const adminUpdateLogRetention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RetentionInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertFeature(context, "admin.logs.retencao", "editar");
    const { error } = await context.supabase
      .from("log_retention_policy")
      .update({
        hot_days: data.hotDays,
        archive_days: data.archiveDays,
        enabled: data.enabled,
        updated_by: context.userId,
      })
      .eq("id", 1)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Executa o arquivamento/expurgo imediatamente (somente admin). */
export const adminRunLogRetention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("apply_log_retention");
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return { archived: row?.archived ?? 0, purged: row?.purged ?? 0 };
  });
