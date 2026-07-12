import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ownerFilterClause, resolveSalesforceOwnerFilter } from "./scope.server";

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
  whoId: string | null;
  what: string | null;
  whatId: string | null;
  type: string | null;
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
  .handler(async ({ data, context }) => {
    const ownerClause = ownerFilterClause(
      await resolveSalesforceOwnerFilter(context.supabase, context.userId, data.ownerId),
    );
    const soql =
      `SELECT Id, Subject, Status, Priority, ActivityDate, Description, ` +
      `Who.Name, WhoId, What.Name, WhatId, Owner.Name, OwnerId ` +
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
      type: null,
      who: r.Who?.Name ?? null,
      whoId: r.WhoId ?? null,
      what: r.What?.Name ?? null,
      whatId: r.WhatId ?? null,
      owner: r.Owner?.Name ?? null,
      ownerId: r.OwnerId ?? null,
    }));
    return { records, totalSize: res?.totalSize ?? records.length };
  });

export type SalesforceInteraction = {
  id: string;
  date: string | null;
  subject: string;
  type: string | null;
  description: string | null;
  whatId: string | null;
  whoId: string | null;
  owner: string | null;
};

export const getSalesforceInteractionsFor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { whatIds?: string[]; whoIds?: string[]; sinceDays?: number }) => input ?? {})
  .handler(async ({ data }) => {
    const whatIds = (data.whatIds ?? []).filter(validId);
    const whoIds = (data.whoIds ?? []).filter(validId);
    if (whatIds.length === 0 && whoIds.length === 0) {
      return { records: [] as SalesforceInteraction[] };
    }
    const sinceDays = Math.max(1, Math.min(365, data.sinceDays ?? 90));
    const clauses: string[] = [`Status = 'Completed'`, `LastModifiedDate = LAST_N_DAYS:${sinceDays}`];
    const idClauses: string[] = [];
    if (whatIds.length) idClauses.push(`WhatId IN (${whatIds.map((i) => `'${i}'`).join(",")})`);
    if (whoIds.length) idClauses.push(`WhoId IN (${whoIds.map((i) => `'${i}'`).join(",")})`);
    clauses.push(`(${idClauses.join(" OR ")})`);
    const soql =
      `SELECT Id, Subject, ActivityDate, Description, WhatId, WhoId, Owner.Name ` +
      `FROM Task WHERE ${clauses.join(" AND ")} ORDER BY LastModifiedDate DESC LIMIT 500`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    const records: SalesforceInteraction[] = (res?.records ?? []).map((r: any) => ({
      id: r.Id,
      date: r.ActivityDate ?? null,
      subject: r.Subject ?? "(sem assunto)",
      type: null,
      description: r.Description ?? null,
      whatId: r.WhatId ?? null,
      whoId: r.WhoId ?? null,
      owner: r.Owner?.Name ?? null,
    }));
    return { records };
  });

export const completeSalesforceTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { taskId: string }) => {
    if (!validId(input.taskId)) throw new Error("ID de tarefa inválido.");
    return input;
  })
  .handler(async ({ data }) => {
    await sfFetch(`/sobjects/Task/${data.taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ Status: "Completed" }),
    });
    return { ok: true };
  });

type TaskPayload = {
  subject: string;
  activityDate?: string | null;
  priority?: string | null;
  status?: string | null;
  type?: string | null;
  description?: string | null;
  whatId?: string | null;
  whoId?: string | null;
  ownerId?: string | null;
};

function buildTaskBody(p: TaskPayload) {
  const body: Record<string, unknown> = { Subject: p.subject };
  if (p.activityDate) body.ActivityDate = p.activityDate;
  // Priority é obrigatório por validação customizada da org — default "Normal".
  body.Priority = p.priority && p.priority.trim() ? p.priority : "Normal";
  if (p.status) body.Status = p.status;
  // Task.Type não existe nesta org; ignoramos p.type intencionalmente.
  if (p.description) body.Description = p.description;
  if (validId(p.whatId)) body.WhatId = p.whatId;
  if (validId(p.whoId)) body.WhoId = p.whoId;
  if (validId(p.ownerId)) body.OwnerId = p.ownerId;
  return body;
}

// Cache de valor default para Org_Atividade__c (picklist restrita e obrigatória nesta org).
// O describe global pode listar valores que não são válidos para o Record Type ativo
// (ex.: "Tubos 2P"), então usamos a UI API para buscar os valores por Record Type.
let cachedOrgAtividadeDefault: string | null | undefined;
async function getOrgAtividadeDefault(): Promise<string | null> {
  if (cachedOrgAtividadeDefault !== undefined) return cachedOrgAtividadeDefault;
  try {
    const desc = await sfFetch(`/sobjects/Task/describe`);
    const defaultRecordTypeId =
      desc?.defaultRecordTypeId ??
      (desc?.recordTypeInfos ?? []).find((rt: any) => rt.defaultRecordTypeMapping)?.recordTypeId ??
      (desc?.recordTypeInfos ?? []).find((rt: any) => rt.available && !rt.master)?.recordTypeId ??
      (desc?.recordTypeInfos ?? []).find((rt: any) => rt.available)?.recordTypeId ??
      "012000000000000AAA";

    try {
      const picklist = await sfFetch(
        `/ui-api/object-info/Task/picklist-values/${defaultRecordTypeId}/Org_Atividade__c`,
      );
      const values = (picklist?.values ?? []).filter((v: any) => v.active !== false);
      const def = values.find((v: any) => v.defaultValue) ?? values[0];
      cachedOrgAtividadeDefault = def?.value ?? null;
      return cachedOrgAtividadeDefault ?? null;
    } catch {
      const field = (desc?.fields ?? []).find((f: any) => f.name === "Org_Atividade__c");
      const values = (field?.picklistValues ?? []).filter((v: any) => v.active && v.value !== "Tubos 2P");
      const def = values.find((v: any) => v.defaultValue) ?? values[0];
      cachedOrgAtividadeDefault = def?.value ?? null;
      return cachedOrgAtividadeDefault ?? null;
    }
  } catch {
    cachedOrgAtividadeDefault = null;
    return null;
  }
}

async function postTaskWithDefaults(body: Record<string, unknown>) {
  const enriched: Record<string, unknown> = { ...body };
  const atividade = await getOrgAtividadeDefault();
  if (atividade && !enriched.Org_Atividade__c) enriched.Org_Atividade__c = atividade;
  return sfFetch(`/sobjects/Task`, { method: "POST", body: JSON.stringify(enriched) });
}

export const createSalesforceTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: TaskPayload) => {
    if (!input.subject || !input.subject.trim()) throw new Error("Assunto é obrigatório.");
    if (input.activityDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.activityDate)) {
      throw new Error("Data inválida (YYYY-MM-DD).");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const body = buildTaskBody({ status: "Open", ...data });
    const res = await postTaskWithDefaults(body);
    return { id: res?.id ?? null };
  });

export const logSalesforceInteraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: TaskPayload) => {
    if (!input.subject || !input.subject.trim()) throw new Error("Assunto é obrigatório.");
    return input;
  })
  .handler(async ({ data }) => {
    const today = new Date();
    const activityDate =
      data.activityDate ||
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const body = buildTaskBody({ ...data, status: "Completed", activityDate });
    const res = await postTaskWithDefaults(body);
    return { id: res?.id ?? null };
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
  createdDate: string | null;
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
    createdDate: r.CreatedDate ? String(r.CreatedDate).slice(0, 10) : null,
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
  .handler(async ({ data, context }) => {
    const stages = (data.stages ?? [...OPPORTUNITY_STAGES]).filter((s) =>
      (OPPORTUNITY_STAGES as readonly string[]).includes(s),
    );
    if (stages.length === 0) return { records: [] as SalesforceOpportunity[] };
    const stageList = stages.map((s) => `'${esc(s)}'`).join(",");
    const ownerClause = ownerFilterClause(
      await resolveSalesforceOwnerFilter(context.supabase, context.userId, data.ownerId),
    );
    const soql =
      `SELECT Id, Name, StageName, Amount, CloseDate, Previsao_de_Fechamento__c, Probability, IsClosed, CreatedDate, ` +
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
  .handler(async ({ data, context }) => {
    const ownerClause = ownerFilterClause(
      await resolveSalesforceOwnerFilter(context.supabase, context.userId, data.ownerId),
    );
    const soql =
      `SELECT Id, Name, StageName, Amount, CloseDate, Previsao_de_Fechamento__c, Probability, IsClosed, CreatedDate, ` +
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
  observacoes: string | null;
  description: string | null;
  quarterProjection: number | null;
  quarterSold: number | null;
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
  const num = (v: any) => (typeof v === "number" ? v : null);
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
    observacoes: r.Observacoes__c ?? null,
    description: r.Description ?? null,
    quarterProjection: num(r.Total_Vendido_Trimestre_Anterior__c),
    quarterSold: num(r.Total_Vendido_Esse_Trimestre__c),
  };
}

export const getSalesforceAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const soql =
      `SELECT Id, Name, CNPJ__c, Segmentacao_Solar__c, Segmentacao_Tubos__c, ` +
      `Industry, Phone, Website, OwnerId, Owner.Name, CreatedDate, ` +
      `Observacoes__c, Description, Total_Vendido_Trimestre_Anterior__c, Total_Vendido_Esse_Trimestre__c ` +
      `FROM Account ORDER BY Name ASC LIMIT 5000`;
    let res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    const all: any[] = [...(res?.records ?? [])];
    // SF devolve batches de ~1000 quando o payload é pesado — seguir nextRecordsUrl.
    let safety = 10;
    while (res && res.done === false && res.nextRecordsUrl && safety-- > 0) {
      const path = String(res.nextRecordsUrl).replace(/^\/services\/data\/v\d+\.\d+/, "");
      res = await sfFetch(path);
      all.push(...(res?.records ?? []));
    }
    return { records: all.map(mapAccount) as SalesforceAccount[] };
  });



export type SalesforceOppRow = {
  id: string;
  name: string;
  stage: string;
  status: string | null;
  tipoNf: string | null;
  amount: number | null;
  total: number | null;
  valorLiq: number | null;
  frete: number | null;
  desconto: number | null;
  closeDate: string | null;
  createdDate: string | null;
  account: string | null;
  accountId: string | null;
  owner: string | null;
  ownerId: string | null;
  accountOwner: string | null;
};

export const PEDIDO_STATUS = [
  "Aguardando Pagamento",
  "Processando",
  "Separação",
  "Faturado",
  "Coletado",
] as const;
export type PedidoStatus = (typeof PEDIDO_STATUS)[number];

function mapOppRow(r: any): SalesforceOppRow {
  const num = (v: any) => (typeof v === "number" ? v : null);
  return {
    id: r.Id,
    name: r.Name,
    stage: r.StageName,
    status: r.Status_do_Pedido__c ?? null,
    tipoNf: r.Tipo_de_NF__c ?? null,
    amount: num(r.Amount),
    total: num(r.Total__c),
    valorLiq: num(r.Valor_L_q__c),
    frete: num(r.Frete__c),
    desconto: num(r.Desconto__c),
    closeDate: r.CloseDate ?? null,
    createdDate: r.CreatedDate ? String(r.CreatedDate).slice(0, 10) : null,
    account: r.Account?.Name ?? null,
    accountId: r.AccountId ?? null,
    owner: r.Owner?.Name ?? null,
    ownerId: r.OwnerId ?? null,
    accountOwner: r.Account?.Owner?.Name ?? null,
  };
}

const OPP_COLS =
  `Id, Name, StageName, Status_do_Pedido__c, Tipo_de_NF__c, Amount, Total__c, Valor_L_q__c, Frete__c, Desconto__c, ` +
  `CloseDate, CreatedDate, AccountId, Account.Name, Account.Owner.Name, Owner.Name, OwnerId`;



function validDate(v: string | null | undefined) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export const getSalesforceOrcamentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { start?: string | null; end?: string | null; ownerId?: string | null }) => input ?? {})
  .handler(async ({ data, context }) => {
    const clauses: string[] = [
      `StageName != 'Pedido Concluído'`,
      `(Tipo_de_NF__c = null OR Tipo_de_NF__c != 'Bonificação')`,
    ];
    if (validDate(data.start)) clauses.push(`CreatedDate >= ${data.start}T00:00:00Z`);
    if (validDate(data.end)) clauses.push(`CreatedDate <= ${data.end}T23:59:59Z`);
    const ownerClause = ownerFilterClause(
      await resolveSalesforceOwnerFilter(context.supabase, context.userId, data.ownerId),
    );
    const soql =
      `SELECT ${OPP_COLS} FROM Opportunity WHERE ${clauses.join(" AND ")} ` +
      `${ownerClause} ORDER BY CreatedDate DESC LIMIT 1000`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    return { records: (res?.records ?? []).map(mapOppRow) as SalesforceOppRow[] };
  });

export const getSalesforceVendas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { start?: string | null; end?: string | null; ownerId?: string | null }) => input ?? {})
  .handler(async ({ data, context }) => {
    const clauses: string[] = [
      `StageName = 'Pedido Concluído'`,
      `(Tipo_de_NF__c = null OR Tipo_de_NF__c != 'Bonificação')`,
    ];
    if (validDate(data.start)) clauses.push(`CloseDate >= ${data.start}`);
    if (validDate(data.end)) clauses.push(`CloseDate <= ${data.end}`);
    const ownerClause = ownerFilterClause(
      await resolveSalesforceOwnerFilter(context.supabase, context.userId, data.ownerId),
    );
    const soql =
      `SELECT ${OPP_COLS} FROM Opportunity WHERE ${clauses.join(" AND ")} ` +
      `${ownerClause} ORDER BY CloseDate DESC NULLS LAST LIMIT 1000`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    return { records: (res?.records ?? []).map(mapOppRow) as SalesforceOppRow[] };
  });



export const OPP_DATE_LITERALS = [
  "TODAY",
  "YESTERDAY",
  "THIS_WEEK",
  "LAST_WEEK",
  "THIS_MONTH",
  "LAST_MONTH",
  "THIS_QUARTER",
  "LAST_QUARTER",
  "THIS_YEAR",
  "LAST_YEAR",
] as const;
// Backwards-compat alias
export const VENDIDO_DATE_LITERALS = OPP_DATE_LITERALS;

export type OppFilters = {
  stageEquals?: string;
  stageNotEquals?: string;
  statusIn?: string[];
  orgIn?: string[];
  tipoNfNotIn?: string[];
  accountNameNotIn?: string[];
  ownerNameNotIn?: string[];
  ownerId?: string | null;
  dateField?: "CloseDate" | "CreatedDate";
  dateLiteral?: string; // e.g. THIS_MONTH or "CUSTOM"
  dateFrom?: string;    // YYYY-MM-DD (when literal = CUSTOM)
  dateTo?: string;      // YYYY-MM-DD (when literal = CUSTOM)
};
// Backwards-compat alias
export type VendidoFilters = OppFilters;

export const OPP_DEFAULTS_VENDIDO_MES: OppFilters = {
  stageEquals: "Pedido Concluído",
  statusIn: [
    "Aguardando Pagamento",
    "Processando",
    "Separação",
    "Faturado",
    "Coletado",
    "Entregue",
    "Documentação Liberada",
    "Finalizado",
  ],
  tipoNfNotIn: ["Bonificação"],
  accountNameNotIn: ["2P ACESSORIOS LTDA"],
  orgIn: ["Acessórios 2P", "WD"],
  ownerNameNotIn: ["Caroline Gimenez"],
  dateField: "CloseDate",
  dateLiteral: "THIS_MONTH",
};
// Backwards-compat alias
export const VENDIDO_DEFAULTS = OPP_DEFAULTS_VENDIDO_MES;

export const OPP_DEFAULTS_ORCAMENTOS: OppFilters = {
  stageNotEquals: "Pedido Concluído",
  tipoNfNotIn: ["Bonificação"],
  statusIn: [],
  orgIn: [],
  accountNameNotIn: [],
  ownerNameNotIn: [],
  dateField: "CreatedDate",
  dateLiteral: "THIS_MONTH",
};

export const OPP_DEFAULTS_VENDAS: OppFilters = {
  stageEquals: "Pedido Concluído",
  tipoNfNotIn: ["Bonificação"],
  statusIn: [],
  orgIn: [],
  accountNameNotIn: [],
  ownerNameNotIn: [],
  dateField: "CloseDate",
  dateLiteral: "THIS_MONTH",
};

export const OPP_DEFAULTS_GERADO_MES: OppFilters = {
  // Qualquer stage e qualquer status do pedido
  tipoNfNotIn: ["Bonificação"],
  statusIn: [],
  orgIn: ["Acessórios 2P", "WD"],
  accountNameNotIn: ["2P ACESSORIOS LTDA"],
  ownerNameNotIn: ["Caroline Gimenez"],
  dateField: "CreatedDate",
  dateLiteral: "THIS_MONTH",
};

export const getSalesforceVendidoMesAtual = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => (input ?? {}) as OppFilters)
  .handler(async ({ data, context }) => {
    const f: OppFilters = data ?? {};
    const df = f.dateField === "CreatedDate" ? "CreatedDate" : "CloseDate";
    const suffixStart = df === "CreatedDate" ? "T00:00:00Z" : "";
    const suffixEnd = df === "CreatedDate" ? "T23:59:59Z" : "";
    const clauses: string[] = [];

    if (f.stageEquals && f.stageEquals.trim()) {
      clauses.push(`StageName = '${esc(f.stageEquals.trim())}'`);
    }
    if (f.stageNotEquals && f.stageNotEquals.trim()) {
      clauses.push(`StageName != '${esc(f.stageNotEquals.trim())}'`);
    }
    const statuses = (f.statusIn ?? []).filter(Boolean);
    if (statuses.length) {
      clauses.push(`Status_do_Pedido__c IN (${statuses.map((s) => `'${esc(s)}'`).join(",")})`);
    }
    for (const v of (f.tipoNfNotIn ?? []).filter(Boolean)) {
      clauses.push(`(Tipo_de_NF__c = null OR Tipo_de_NF__c != '${esc(v)}')`);
    }
    for (const v of (f.accountNameNotIn ?? []).filter(Boolean)) {
      clauses.push(`(Account.Name = null OR Account.Name != '${esc(v)}')`);
    }
    const orgs = (f.orgIn ?? []).filter(Boolean);
    if (orgs.length) {
      clauses.push(`Org_Oportunidade__c IN (${orgs.map((s) => `'${esc(s)}'`).join(",")})`);
    }
    for (const v of (f.ownerNameNotIn ?? []).filter(Boolean)) {
      clauses.push(`(Owner.Name = null OR Owner.Name != '${esc(v)}')`);
    }

    const literal = (f.dateLiteral ?? "").trim();
    if (literal === "CUSTOM") {
      if (f.dateFrom && validDate(f.dateFrom)) clauses.push(`${df} >= ${f.dateFrom}${suffixStart}`);
      if (f.dateTo && validDate(f.dateTo)) clauses.push(`${df} <= ${f.dateTo}${suffixEnd}`);
    } else if (literal) {
      clauses.push(`${df} = ${literal}`);
    }

    const ownerClause = ownerFilterClause(
      await resolveSalesforceOwnerFilter(context.supabase, context.userId, f.ownerId ?? null),
    );

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")} ` : "";
    const soql =
      `SELECT ${OPP_COLS} FROM Opportunity ${where}${ownerClause} ` +
      `ORDER BY ${df} DESC NULLS LAST LIMIT 1000`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    return { records: (res?.records ?? []).map(mapOppRow) as SalesforceOppRow[], soql };
  });


export const getSalesforcePedidos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ownerId?: string | null }) => input ?? {})
  .handler(async ({ data, context }) => {
    const statusList = PEDIDO_STATUS.map((s) => `'${esc(s)}'`).join(",");
    const ownerClause = ownerFilterClause(
      await resolveSalesforceOwnerFilter(context.supabase, context.userId, data.ownerId),
    );
    const clauses: string[] = [
      `Status_do_Pedido__c IN (${statusList})`,
      `(Tipo_de_NF__c = null OR Tipo_de_NF__c != 'Bonificação')`,
    ];
    const soql =
      `SELECT ${OPP_COLS} FROM Opportunity WHERE ${clauses.join(" AND ")}${ownerClause} ` +
      `ORDER BY CreatedDate DESC LIMIT 1000`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    return { records: (res?.records ?? []).map(mapOppRow) as SalesforceOppRow[] };
  });

export type SalesforceSalesByAccount = { accountId: string; total: number };

// Agregação por conta usando SOQL GROUP BY — evita o teto de 1000 pedidos
// e garante que TODAS as contas do trimestre entrem no cálculo de segmentação.
export const getSalesforceSalesByAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { start: string; end: string }) => {
    if (!validDate(input.start) || !validDate(input.end)) throw new Error("Datas inválidas.");
    return input;
  })
  .handler(async ({ data }) => {
    const clauses: string[] = [
      `StageName = 'Pedido Concluído'`,
      `(Tipo_de_NF__c = null OR Tipo_de_NF__c != 'Bonificação')`,
      `CloseDate >= ${data.start}`,
      `CloseDate <= ${data.end}`,
      `AccountId != null`,
    ];
    const soql =
      `SELECT AccountId, SUM(Total__c) sumT, SUM(Amount) sumA ` +
      `FROM Opportunity WHERE ${clauses.join(" AND ")} ` +
      `GROUP BY AccountId LIMIT 2000`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    const records: SalesforceSalesByAccount[] = (res?.records ?? []).map((r: any) => ({
      accountId: r.AccountId,
      total: typeof r.sumT === "number" ? r.sumT : typeof r.sumA === "number" ? r.sumA : 0,
    }));
    return { records };
  });


