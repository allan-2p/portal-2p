import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";

function getSecrets() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const sfKey = process.env.SALESFORCE_API_KEY;
  if (!lovableKey || !sfKey) {
    throw new Error("Salesforce connector não está configurado.");
  }
  return { lovableKey, sfKey };
}

async function sfFetch(path: string, init?: RequestInit) {
  const { lovableKey, sfKey } = getSecrets();
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": sfKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = typeof body === "object" ? JSON.stringify(body) : String(body);
    throw new Error(`Salesforce ${res.status}: ${msg}`);
  }
  return body;
}

export const getSalesforceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const sfKey = process.env.SALESFORCE_API_KEY;
    if (!lovableKey || !sfKey) {
      return { connected: false as const, reason: "Nenhuma conexão do Salesforce vinculada ao projeto." };
    }

    try {
      // Verify credentials via the connector gateway
      const verifyRes = await fetch("https://connector-gateway.lovable.dev/api/v1/verify_credentials", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": sfKey,
        },
      });
      const verify = await verifyRes.json().catch(() => ({}));

      if (!verifyRes.ok || verify?.outcome === "failed") {
        return {
          connected: false as const,
          reason: verify?.error ?? `Falha ao verificar credenciais (HTTP ${verifyRes.status}).`,
        };
      }

      // Fetch a lightweight identity signal
      let orgName: string | null = null;
      let username: string | null = null;
      try {
        const identity = await sfFetch(
          `/query?q=${encodeURIComponent("SELECT Name FROM Organization LIMIT 1")}`,
        );
        orgName = identity?.records?.[0]?.Name ?? null;
      } catch { /* ignore */ }
      try {
        const me = await sfFetch(
          `/query?q=${encodeURIComponent("SELECT Username, Name FROM User WHERE Id = UserInfo.getUserId() LIMIT 1")}`,
        );
        username = me?.records?.[0]?.Username ?? null;
      } catch { /* ignore */ }

      return {
        connected: true as const,
        outcome: verify?.outcome ?? "verified",
        latencyMs: verify?.latency_ms ?? null,
        orgName,
        username,
      };
    } catch (e) {
      return {
        connected: false as const,
        reason: e instanceof Error ? e.message : "Erro desconhecido ao verificar Salesforce.",
      };
    }
  });

export const getSalesforceSample = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const data = await sfFetch(
      `/query?q=${encodeURIComponent("SELECT Id, Name, Industry FROM Account ORDER BY CreatedDate DESC LIMIT 5")}`,
    );
    return { records: data?.records ?? [] };
  });

export type SalesforceTask = {
  id: string;
  date: string; // YYYY-MM-DD
  subject: string;
  status: string | null;
  priority: string | null;
  description: string | null;
  who: string | null;
  what: string | null;
  owner: string | null;
};

export const getSalesforceTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { start: string; end: string }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start) || !/^\d{4}-\d{2}-\d{2}$/.test(input.end)) {
      throw new Error("Datas inválidas (formato esperado YYYY-MM-DD).");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const soql =
      `SELECT Id, Subject, Status, Priority, ActivityDate, Description, Who.Name, What.Name, Owner.Name ` +
      `FROM Task ` +
      `WHERE ActivityDate >= ${data.start} AND ActivityDate <= ${data.end} ` +
      `ORDER BY ActivityDate ASC LIMIT 500`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    const records: SalesforceTask[] = (res?.records ?? []).map((r: any) => ({
      id: r.Id,
      date: r.ActivityDate,
      subject: r.Subject ?? "(sem assunto)",
      status: r.Status ?? null,
      priority: r.Priority ?? null,
      description: r.Description ?? null,
      who: r.Who?.Name ?? null,
      what: r.What?.Name ?? null,
      owner: r.Owner?.Name ?? null,
    }));
    return { records, totalSize: res?.totalSize ?? records.length };
  });

