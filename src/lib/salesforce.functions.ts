import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";

const OPPORTUNITY_STAGES = [
  "Projeto Fechado",
  "Projeto Não Fechado",
  "Em Negociação",
  "Estoque",
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];
export const opportunityStages = OPPORTUNITY_STAGES;

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
  const maxAttempts = 3;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
    if (res.ok) return body;
    const retryable = res.status === 502 || res.status === 503 || res.status === 504 || res.status === 429;
    const msg = typeof body === "object" ? JSON.stringify(body) : String(body);
    lastErr = new Error(`Salesforce ${res.status}: ${msg}`);
    if (!retryable || attempt === maxAttempts) throw lastErr;
    await new Promise((r) => setTimeout(r, 400 * attempt));
  }
  throw lastErr;
}


// Escape single quotes for SOQL string literals
function esc(v: string) {
  return v.replace(/'/g, "\\'");
}

function validId(v: string | null | undefined) {
  return typeof v === "string" && /^[a-zA-Z0-9]{15,18}$/.test(v);
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
      const verifyRes = await fetch("https://connector-gateway.lovable.dev/api/v1/verify_credentials", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": sfKey },
      });
      const verify = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok || verify?.outcome === "failed") {
        return { connected: false as const, reason: verify?.error ?? `Falha (HTTP ${verifyRes.status}).` };
      }
      let orgName: string | null = null;
      let username: string | null = null;
      try {
        const identity = await sfFetch(`/query?q=${encodeURIComponent("SELECT Name FROM Organization LIMIT 1")}`);
        orgName = identity?.records?.[0]?.Name ?? null;
      } catch {}
      try {
        const me = await sfFetch(`/query?q=${encodeURIComponent("SELECT Username FROM User WHERE Id = UserInfo.getUserId() LIMIT 1")}`);
        username = me?.records?.[0]?.Username ?? null;
      } catch {}
      return { connected: true as const, outcome: verify?.outcome ?? "verified", latencyMs: verify?.latency_ms ?? null, orgName, username };
    } catch (e) {
      return { connected: false as const, reason: e instanceof Error ? e.message : "Erro desconhecido." };
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
  date: string;
  subject: string;
  status: string | null;
  priority: string | null;
  description: string | null;
  who: string | null;
  what: string | null;
  owner: string | null;
  ownerId: string | null;
};

export const getSalesforceTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { start: string; end: string; ownerId?: string | null }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start) || !/^\d{4}-\d{2}-\d{2}$/.test(input.end)) {
      throw new Error("Datas inválidas (formato esperado YYYY-MM-DD).");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const ownerClause = validId(data.ownerId) ? ` AND OwnerId = '${data.ownerId}'` : "";
    const soql =
      `SELECT Id, Subject, Status, Priority, ActivityDate, Description, Who.Name, What.Name, Owner.Name, OwnerId ` +
      `FROM Task ` +
      `WHERE Status = 'Open' AND ActivityDate >= ${data.start} AND ActivityDate <= ${data.end}${ownerClause} ` +
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
      ownerId: r.OwnerId ?? null,
    }));
    return { records, totalSize: res?.totalSize ?? records.length };
  });

export type SalesforceSalesperson = { id: string; name: string; email: string | null };

export const getSalesforceSalespeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const soql =
      `SELECT Id, Name, Email FROM User ` +
      `WHERE IsActive = true AND Email LIKE '%@2pgroup.com.br' ` +
      `ORDER BY Name ASC LIMIT 200`;
    const [res, hiddenRes] = await Promise.all([
      sfFetch(`/query?q=${encodeURIComponent(soql)}`),
      context.supabase.from("hidden_salespeople").select("sf_user_id"),
    ]);
    const hidden = new Set<string>((hiddenRes.data ?? []).map((r: any) => r.sf_user_id));
    const records: SalesforceSalesperson[] = (res?.records ?? [])
      .filter((r: any) => !hidden.has(r.Id))
      .map((r: any) => ({
        id: r.Id,
        name: r.Name,
        email: r.Email ?? null,
      }));
    return { records };
  });

export type SalesforceOpportunity = {
  id: string;
  name: string;
  stage: string;
  amount: number | null;
  closeDate: string | null;
  forecastDate: string | null;
  probability: number | null;
  isClosed: boolean;
  account: string | null;
  owner: string | null;
  ownerId: string | null;
};

function mapOpp(r: any): SalesforceOpportunity {
  return {
    id: r.Id,
    name: r.Name,
    stage: r.StageName,
    amount: typeof r.Amount === "number" ? r.Amount : null,
    closeDate: r.CloseDate ?? null,
    forecastDate: r.Previsao_de_Fechamento__c ?? null,
    probability: typeof r.Probability === "number" ? r.Probability : null,
    isClosed: !!r.IsClosed,
    account: r.Account?.Name ?? null,
    owner: r.Owner?.Name ?? null,
    ownerId: r.OwnerId ?? null,
  };
}

export const getSalesforceOpportunities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { stages?: string[]; ownerId?: string | null }) => input)
  .handler(async ({ data }) => {
    const stages = (data.stages ?? [...OPPORTUNITY_STAGES]).filter((s) =>
      (OPPORTUNITY_STAGES as readonly string[]).includes(s),
    );
    if (stages.length === 0) return { records: [] as SalesforceOpportunity[] };
    const stageList = stages.map((s) => `'${esc(s)}'`).join(",");
    const ownerClause = validId(data.ownerId) ? ` AND OwnerId = '${data.ownerId}'` : "";
    const soql =
      `SELECT Id, Name, StageName, Amount, CloseDate, Previsao_de_Fechamento__c, Probability, IsClosed, ` +
      `Account.Name, Owner.Name, OwnerId ` +
      `FROM Opportunity ` +
      `WHERE StageName IN (${stageList})${ownerClause} ` +
      `ORDER BY CloseDate DESC LIMIT 500`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    return { records: (res?.records ?? []).map(mapOpp) };
  });

export const getSalesforceForecasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ownerId?: string | null }) => input)
  .handler(async ({ data }) => {
    const ownerClause = validId(data.ownerId) ? ` AND OwnerId = '${data.ownerId}'` : "";
    const soql =
      `SELECT Id, Name, StageName, Amount, CloseDate, Previsao_de_Fechamento__c, Probability, IsClosed, ` +
      `Account.Name, Owner.Name, OwnerId ` +
      `FROM Opportunity ` +
      `WHERE IsClosed = false AND Previsao_de_Fechamento__c != null${ownerClause} ` +
      `ORDER BY Previsao_de_Fechamento__c ASC LIMIT 500`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    return { records: (res?.records ?? []).map(mapOpp) };
  });

export type SalesforceAccount = {
  id: string;
  name: string;
  cnpj: string | null;
  segment: "A" | "B" | "C" | "D" | null;
  tubos: string[];
  ownerId: string | null;
  ownerName: string | null;
  createdAt: string | null;
  phone: string | null;
  website: string | null;
  industry: string | null;
};

function formatCnpj(v: string | null): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  if (d.length !== 14) return v;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`;
}

function mapAccount(r: any): SalesforceAccount {
  const rawSeg = (r.Segmentacao_Solar__c ?? "").toString().trim().toUpperCase();
  const segment = (["A","B","C","D"] as const).includes(rawSeg as any) ? (rawSeg as "A"|"B"|"C"|"D") : null;
  const tubos = typeof r.Segmentacao_Tubos__c === "string" && r.Segmentacao_Tubos__c
    ? r.Segmentacao_Tubos__c.split(";").map((s: string) => s.trim()).filter(Boolean)
    : [];
  return {
    id: r.Id,
    name: r.Name,
    cnpj: formatCnpj(r.CNPJ__c ?? null),
    segment,
    tubos,
    ownerId: r.OwnerId ?? null,
    ownerName: r.Owner?.Name ?? null,
    createdAt: r.CreatedDate ?? null,
    phone: r.Phone ?? null,
    website: r.Website ?? null,
    industry: r.Industry ?? null,
  };
}

export const getSalesforceAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const soql =
      `SELECT Id, Name, CNPJ__c, Segmentacao_Solar__c, Segmentacao_Tubos__c, ` +
      `Industry, Phone, Website, OwnerId, Owner.Name, CreatedDate ` +
      `FROM Account ORDER BY Name ASC LIMIT 2000`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    return { records: (res?.records ?? []).map(mapAccount) as SalesforceAccount[] };
  });

export type SalesforceOppRow = {
  id: string;
  name: string;
  stage: string;
  tipoNf: string | null;
  amount: number | null;
  closeDate: string | null;
  account: string | null;
  owner: string | null;
  ownerId: string | null;
};

function mapOppRow(r: any): SalesforceOppRow {
  return {
    id: r.Id,
    name: r.Name,
    stage: r.StageName,
    tipoNf: r.Tipo_de_NF__c ?? null,
    amount: typeof r.Amount === "number" ? r.Amount : null,
    closeDate: r.CloseDate ?? null,
    account: r.Account?.Name ?? null,
    owner: r.Owner?.Name ?? null,
    ownerId: r.OwnerId ?? null,
  };
}

const OPP_COLS =
  `Id, Name, StageName, Tipo_de_NF__c, Amount, CloseDate, Account.Name, Owner.Name, OwnerId`;

export const getSalesforceOrcamentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const soql =
      `SELECT ${OPP_COLS} FROM Opportunity ` +
      `WHERE StageName != 'Pedido Concluído' ` +
      `AND (Tipo_de_NF__c = null OR Tipo_de_NF__c != 'Bonificação') ` +
      `ORDER BY CloseDate DESC NULLS LAST LIMIT 1000`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    return { records: (res?.records ?? []).map(mapOppRow) as SalesforceOppRow[] };
  });

export const getSalesforceVendas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const soql =
      `SELECT ${OPP_COLS} FROM Opportunity ` +
      `WHERE StageName = 'Pedido Concluído' ` +
      `AND (Tipo_de_NF__c = null OR Tipo_de_NF__c != 'Bonificação') ` +
      `ORDER BY CloseDate DESC NULLS LAST LIMIT 1000`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    return { records: (res?.records ?? []).map(mapOppRow) as SalesforceOppRow[] };
  });

