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
  tipoInteracao?: string | null;
  conseguiuFalar?: "Sim" | "Não" | null;
  comments?: string | null;
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
  if (p.tipoInteracao) body.Tipo_de_Interacao__c = p.tipoInteracao;
  if (p.conseguiuFalar) body.Conseguiu_falar_com_o_cliente__c = p.conseguiuFalar;
  if (p.comments) {
    body.Description = body.Description ? `${body.Description}\n\n${p.comments}` : p.comments;
  }
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
    // Log a Call: mesmo comportamento do botão "Log a Call" no Salesforce —
    // grava uma Task concluída com TaskSubtype = 'Call' (chamada), não uma tarefa comum.
    (body as Record<string, unknown>).TaskSubtype = "Call";
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
  dataFaturamento: string | null;
  account: string | null;
  accountId: string | null;
  owner: string | null;
  ownerId: string | null;
  accountOwner: string | null;
  classification?: "novo" | "reativacao" | "carteira" | null;
  lastPurchaseBefore?: string | null;
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
    dataFaturamento: r.Data_de_Faturamento__c ? String(r.Data_de_Faturamento__c).slice(0, 10) : null,
    account: r.Account?.Name ?? null,
    accountId: r.AccountId ?? null,
    owner: r.Owner?.Name ?? null,
    ownerId: r.OwnerId ?? null,
    accountOwner: r.Account?.Owner?.Name ?? null,
  };
}


const OPP_COLS =
  `Id, Name, StageName, Status_do_Pedido__c, Tipo_de_NF__c, Amount, Total__c, Valor_L_q__c, Frete__c, Desconto__c, ` +
  `CloseDate, CreatedDate, Data_de_Faturamento__c, AccountId, Account.Name, Account.Owner.Name, Owner.Name, OwnerId`;




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
  .inputValidator((input: { start?: string | null; end?: string | null; ownerId?: string | null; unscoped?: boolean }) => input ?? {})
  .handler(async ({ data, context }) => {
    const clauses: string[] = [
      `StageName = 'Pedido Concluído'`,
      `(Tipo_de_NF__c = null OR Tipo_de_NF__c != 'Bonificação')`,
    ];
    if (validDate(data.start)) clauses.push(`CloseDate >= ${data.start}`);
    if (validDate(data.end)) clauses.push(`CloseDate <= ${data.end}`);
    const ownerClause = data.unscoped
      ? ""
      : ownerFilterClause(
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
  ownerNameIn?: string[];
  lossReasonIn?: string[];
  lossReasonNotIn?: string[];
  ownerId?: string | null;
  dateField?: "CloseDate" | "CreatedDate" | "Data_de_Faturamento__c";
  dateLiteral?: string; // e.g. THIS_MONTH or "CUSTOM"
  dateFrom?: string;    // YYYY-MM-DD (when literal = CUSTOM)
  dateTo?: string;      // YYYY-MM-DD (when literal = CUSTOM)
  // Optional secondary date filter (applied in addition to the primary)
  dateField2?: "CloseDate" | "CreatedDate" | "Data_de_Faturamento__c";
  dateLiteral2?: string;
  dateFrom2?: string;
  dateTo2?: string;
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
  stageNotEquals: "Pedido Cancelado",
  tipoNfNotIn: ["Bonificação"],
  statusIn: ["Faturado", "Coletado", "Entregue"],
  orgIn: ["Acessórios 2P"],
  accountNameNotIn: [],
  ownerNameNotIn: ["Caroline Gimenez"],
  dateField: "Data_de_Faturamento__c",
  dateLiteral: "THIS_MONTH",
  dateField2: "CloseDate",
  dateLiteral2: "THIS_MONTH",
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
    const df: "CloseDate" | "CreatedDate" | "Data_de_Faturamento__c" =
      f.dateField === "CreatedDate"
        ? "CreatedDate"
        : f.dateField === "Data_de_Faturamento__c"
          ? "Data_de_Faturamento__c"
          : "CloseDate";
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
    const ownersIn = (f.ownerNameIn ?? []).filter(Boolean);
    if (ownersIn.length) {
      clauses.push(`Owner.Name IN (${ownersIn.map((s) => `'${esc(s)}'`).join(",")})`);
    }
    const lossIn = (f.lossReasonIn ?? []).filter(Boolean);
    if (lossIn.length) {
      clauses.push(`Loss_Reason__c IN (${lossIn.map((s) => `'${esc(s)}'`).join(",")})`);
    }
    for (const v of (f.lossReasonNotIn ?? []).filter(Boolean)) {
      clauses.push(`(Loss_Reason__c = null OR Loss_Reason__c != '${esc(v)}')`);
    }

    const literal = (f.dateLiteral ?? "").trim();
    if (literal === "CUSTOM") {
      if (f.dateFrom && validDate(f.dateFrom)) clauses.push(`${df} >= ${f.dateFrom}${suffixStart}`);
      if (f.dateTo && validDate(f.dateTo)) clauses.push(`${df} <= ${f.dateTo}${suffixEnd}`);
    } else if (literal) {
      clauses.push(`${df} = ${literal}`);
    }

    // Secondary date filter (optional, ANDed with primary)
    if (f.dateField2) {
      const df2 = f.dateField2;
      const suffixStart2 = df2 === "CreatedDate" ? "T00:00:00Z" : "";
      const suffixEnd2 = df2 === "CreatedDate" ? "T23:59:59Z" : "";
      const literal2 = (f.dateLiteral2 ?? "").trim();
      if (literal2 === "CUSTOM") {
        if (f.dateFrom2 && validDate(f.dateFrom2)) clauses.push(`${df2} >= ${f.dateFrom2}${suffixStart2}`);
        if (f.dateTo2 && validDate(f.dateTo2)) clauses.push(`${df2} <= ${f.dateTo2}${suffixEnd2}`);
      } else if (literal2) {
        clauses.push(`${df2} = ${literal2}`);
      }
    }

    const ownerClause = (f as OppFilters & { unscoped?: boolean }).unscoped
      ? ""
      : ownerFilterClause(
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

// ============================================================
// MARKETING — dados de leads/conversões da equipe de marketing
// ============================================================
export const MARKETING_OWNER_IDS = [
  "005Dn000005whg0IAA", // Fernando Lira
  "005U400000HmVKfIAN", // Gabriel Kendi
  "005U400000HYBs5IAH", // Erika Aiello
  "005U400000IClATIA1", // Ygor Andreis
  "005U400000C9Gg9IAF", // Marketing 2P
] as const;

export const MARKETING_OWNER_NAMES: Record<string, string> = {
  "005Dn000005whg0IAA": "Fernando Lira",
  "005U400000HmVKfIAN": "Gabriel Kendi",
  "005U400000HYBs5IAH": "Erika Aiello",
  "005U400000IClATIA1": "Ygor Andreis",
  "005U400000C9Gg9IAF": "Marketing 2P",
};

export type MarketingBucket = { label: string; value: number };
export type MarketingConvertedLead = {
  id: string;
  name: string;
  convertedDate: string | null;
  accountId: string | null;
  origem: string | null;
  subOrigem: string | null;
  owner: string | null;
  accountValue: number | null;
};
export type MarketingData = {
  range: { start: string; end: string };
  totals: {
    leads: number;
    convertidos: number;
    naoConvertidos: number;
    amadurecimento: number;
    novasContas: number;
    faturado: number;
  };
  porOrigem: MarketingBucket[];
  porSubOrigem: MarketingBucket[];
  porOwner: MarketingBucket[];
  statusBreakdown: MarketingBucket[];
  serieDiaria: { date: string; leads: number; convertidos: number }[];
  convertidos: MarketingConvertedLead[];
};

export const getMarketingSalesforceData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { start: string; end: string }) => {
    if (!validDate(input.start) || !validDate(input.end)) {
      throw new Error("Datas inválidas (YYYY-MM-DD).");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const ownerList = MARKETING_OWNER_IDS.map((id) => `'${id}'`).join(",");
    const startDT = `${data.start}T00:00:00Z`;
    const endDT = `${data.end}T23:59:59Z`;

    const [byStatus, byOrigem, bySub, byOwner, daily, dailyConv, convertedRes] = await Promise.all([
      sfFetch(`/query?q=${encodeURIComponent(
        `SELECT COUNT(Id) total, Status FROM Lead ` +
        `WHERE OwnerId IN (${ownerList}) AND CreatedDate >= ${startDT} AND CreatedDate <= ${endDT} ` +
        `GROUP BY Status`,
      )}`),
      sfFetch(`/query?q=${encodeURIComponent(
        `SELECT COUNT(Id) total, Origem__c FROM Lead ` +
        `WHERE OwnerId IN (${ownerList}) AND CreatedDate >= ${startDT} AND CreatedDate <= ${endDT} ` +
        `GROUP BY Origem__c ORDER BY COUNT(Id) DESC`,
      )}`),
      sfFetch(`/query?q=${encodeURIComponent(
        `SELECT COUNT(Id) total, Sub_Origem__c FROM Lead ` +
        `WHERE OwnerId IN (${ownerList}) AND CreatedDate >= ${startDT} AND CreatedDate <= ${endDT} ` +
        `GROUP BY Sub_Origem__c ORDER BY COUNT(Id) DESC LIMIT 20`,
      )}`),
      sfFetch(`/query?q=${encodeURIComponent(
        `SELECT COUNT(Id) total, Owner.Name ownerName FROM Lead ` +
        `WHERE OwnerId IN (${ownerList}) AND CreatedDate >= ${startDT} AND CreatedDate <= ${endDT} ` +
        `GROUP BY Owner.Name ORDER BY COUNT(Id) DESC`,
      )}`),
      sfFetch(`/query?q=${encodeURIComponent(
        `SELECT COUNT(Id) total, DAY_ONLY(CreatedDate) dia FROM Lead ` +
        `WHERE OwnerId IN (${ownerList}) AND CreatedDate >= ${startDT} AND CreatedDate <= ${endDT} ` +
        `GROUP BY DAY_ONLY(CreatedDate) ORDER BY DAY_ONLY(CreatedDate) ASC`,
      )}`),
      sfFetch(`/query?q=${encodeURIComponent(
        `SELECT COUNT(Id) total, DAY_ONLY(CreatedDate) dia FROM Lead ` +
        `WHERE OwnerId IN (${ownerList}) AND IsConverted = true AND CreatedDate >= ${startDT} AND CreatedDate <= ${endDT} ` +
        `GROUP BY DAY_ONLY(CreatedDate) ORDER BY DAY_ONLY(CreatedDate) ASC`,
      )}`),
      sfFetch(`/query?q=${encodeURIComponent(
        `SELECT Id, Name, ConvertedDate, ConvertedAccountId, Origem__c, Sub_Origem__c, Owner.Name ` +
        `FROM Lead ` +
        `WHERE OwnerId IN (${ownerList}) AND IsConverted = true ` +
        `AND ConvertedDate >= ${data.start} AND ConvertedDate <= ${data.end} ` +
        `ORDER BY ConvertedDate DESC LIMIT 500`,
      )}`),
    ]);

    // Sum accounts + total sold for the converted accounts, in the same window
    const convertedRecords: any[] = convertedRes?.records ?? [];
    const accountIds = Array.from(new Set(
      convertedRecords.map((r) => r.ConvertedAccountId).filter(validId),
    ));

    const accountValueById = new Map<string, number>();
    if (accountIds.length) {
      // chunk to avoid oversized SOQL
      for (let i = 0; i < accountIds.length; i += 100) {
        const chunk = accountIds.slice(i, i + 100);
        const inList = chunk.map((id) => `'${id}'`).join(",");
        const aggRes = await sfFetch(`/query?q=${encodeURIComponent(
          `SELECT AccountId, SUM(Total__c) sumT, SUM(Amount) sumA ` +
          `FROM Opportunity ` +
          `WHERE AccountId IN (${inList}) AND StageName = 'Pedido Concluído' ` +
          `AND (Tipo_de_NF__c = null OR Tipo_de_NF__c != 'Bonificação') ` +
          `AND CloseDate >= ${data.start} AND CloseDate <= ${data.end} ` +
          `GROUP BY AccountId`,
        )}`);
        for (const r of (aggRes?.records ?? [])) {
          const total = typeof r.sumT === "number" ? r.sumT : typeof r.sumA === "number" ? r.sumA : 0;
          accountValueById.set(r.AccountId, total);
        }
      }
    }

    const asBuckets = (records: any[], labelKey: string): MarketingBucket[] =>
      records.map((r) => ({
        label: (r[labelKey] ?? "Sem informação") as string,
        value: typeof r.total === "number" ? r.total : 0,
      }));

    const statusRecords: any[] = byStatus?.records ?? [];
    let convertidos = 0, naoConvertidos = 0, amadurecimento = 0, totalLeads = 0;
    for (const r of statusRecords) {
      const t = typeof r.total === "number" ? r.total : 0;
      totalLeads += t;
      const s = (r.Status ?? "").toString();
      if (s === "Convertido") convertidos += t;
      else if (s === "Não Convertido") naoConvertidos += t;
      else if (s === "Amadurecimento") amadurecimento += t;
    }

    const converted: MarketingConvertedLead[] = convertedRecords.map((r) => ({
      id: r.Id,
      name: r.Name ?? "(sem nome)",
      convertedDate: r.ConvertedDate ?? null,
      accountId: r.ConvertedAccountId ?? null,
      origem: r.Origem__c ?? null,
      subOrigem: r.Sub_Origem__c ?? null,
      owner: r.Owner?.Name ?? null,
      accountValue: r.ConvertedAccountId ? accountValueById.get(r.ConvertedAccountId) ?? 0 : null,
    }));

    const novasContas = new Set(convertedRecords.map((r) => r.ConvertedAccountId).filter(Boolean)).size;
    const faturado = Array.from(accountValueById.values()).reduce((a, b) => a + b, 0);

    const convByDay = new Map<string, number>();
    for (const r of (dailyConv?.records ?? [])) {
      convByDay.set(r.dia, typeof r.total === "number" ? r.total : 0);
    }
    const serieDiaria = (daily?.records ?? []).map((r: any) => ({
      date: r.dia,
      leads: typeof r.total === "number" ? r.total : 0,
      convertidos: convByDay.get(r.dia) ?? 0,
    }));

    const result: MarketingData = {
      range: { start: data.start, end: data.end },
      totals: {
        leads: totalLeads,
        convertidos,
        naoConvertidos,
        amadurecimento,
        novasContas,
        faturado,
      },
      porOrigem: asBuckets(byOrigem?.records ?? [], "Origem__c"),
      porSubOrigem: asBuckets(bySub?.records ?? [], "Sub_Origem__c"),
      porOwner: asBuckets(byOwner?.records ?? [], "ownerName"),
      statusBreakdown: asBuckets(statusRecords, "Status"),
      serieDiaria,
      convertidos: converted,
    };
    return result;
  });


// ============================================================
// PUBLIC (no-auth) endpoints — used ONLY by the shared TV dashboard.
// Design constraints (security):
//   • No client-supplied filter object. Callers pick a fixed server-side
//     preset from a small allow-list. This prevents an attacker from
//     issuing arbitrary SOQL over the pipeline (e.g. LAST_YEAR, empty
//     statusIn) via these unauthenticated endpoints.
//   • Response is stripped of PII (customer names, sales-rep names,
//     opportunity name) so it cannot be scraped as a sales roster.
//     Only aggregation-relevant fields ship: id, amount, total,
//     closeDate, createdDate, accountId (opaque SF ID).
//   • Vendas range is capped to ~400 days to limit bulk historical
//     exfiltration.
// ============================================================

export type PublicOppRow = {
  id: string;
  amount: number | null;
  total: number | null;
  closeDate: string | null;
  createdDate: string | null;
  accountId: string | null;
};

function mapPublicOppRow(r: any): PublicOppRow {
  const num = (v: any) => (typeof v === "number" ? v : null);
  return {
    id: r.Id,
    amount: num(r.Amount),
    total: num(r.Total__c),
    closeDate: r.CloseDate ?? null,
    createdDate: r.CreatedDate ? String(r.CreatedDate).slice(0, 10) : null,
    accountId: r.AccountId ?? null,
  };
}

const PUBLIC_OPP_COLS =
  `Id, Amount, Total__c, CloseDate, CreatedDate, AccountId`;

const PUBLIC_TV_PRESETS = {
  vendido_mes: OPP_DEFAULTS_VENDIDO_MES,
  gerado_mes: OPP_DEFAULTS_GERADO_MES,
  faturamento_mes: OPP_DEFAULTS_VENDAS,
} as const;

export type PublicTvVariant = keyof typeof PUBLIC_TV_PRESETS;

function buildPublicSoql(f: OppFilters): string {
  // Reuses the same SOQL construction as the private endpoint, but with the
  // reduced PUBLIC_OPP_COLS projection.
  const df: "CloseDate" | "CreatedDate" | "Data_de_Faturamento__c" =
    f.dateField === "CreatedDate"
      ? "CreatedDate"
      : f.dateField === "Data_de_Faturamento__c"
        ? "Data_de_Faturamento__c"
        : "CloseDate";
  const suffixStart = df === "CreatedDate" ? "T00:00:00Z" : "";
  const suffixEnd = df === "CreatedDate" ? "T23:59:59Z" : "";
  const clauses: string[] = [];

  if (f.stageEquals && f.stageEquals.trim()) clauses.push(`StageName = '${esc(f.stageEquals.trim())}'`);
  if (f.stageNotEquals && f.stageNotEquals.trim()) clauses.push(`StageName != '${esc(f.stageNotEquals.trim())}'`);
  const statuses = (f.statusIn ?? []).filter(Boolean);
  if (statuses.length) clauses.push(`Status_do_Pedido__c IN (${statuses.map((s) => `'${esc(s)}'`).join(",")})`);
  for (const v of (f.tipoNfNotIn ?? []).filter(Boolean)) clauses.push(`(Tipo_de_NF__c = null OR Tipo_de_NF__c != '${esc(v)}')`);
  for (const v of (f.accountNameNotIn ?? []).filter(Boolean)) clauses.push(`(Account.Name = null OR Account.Name != '${esc(v)}')`);
  const orgs = (f.orgIn ?? []).filter(Boolean);
  if (orgs.length) clauses.push(`Org_Oportunidade__c IN (${orgs.map((s) => `'${esc(s)}'`).join(",")})`);
  for (const v of (f.ownerNameNotIn ?? []).filter(Boolean)) clauses.push(`(Owner.Name = null OR Owner.Name != '${esc(v)}')`);
  const ownersIn = (f.ownerNameIn ?? []).filter(Boolean);
  if (ownersIn.length) clauses.push(`Owner.Name IN (${ownersIn.map((s) => `'${esc(s)}'`).join(",")})`);

  const literal = (f.dateLiteral ?? "").trim();
  if (literal && literal !== "CUSTOM") clauses.push(`${df} = ${literal}`);
  else if (f.dateFrom && validDate(f.dateFrom)) clauses.push(`${df} >= ${f.dateFrom}${suffixStart}`);
  if (literal === "CUSTOM" && f.dateTo && validDate(f.dateTo)) clauses.push(`${df} <= ${f.dateTo}${suffixEnd}`);

  if (f.dateField2) {
    const df2 = f.dateField2;
    const literal2 = (f.dateLiteral2 ?? "").trim();
    if (literal2 && literal2 !== "CUSTOM") clauses.push(`${df2} = ${literal2}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")} ` : "";
  return `SELECT ${PUBLIC_OPP_COLS} FROM Opportunity ${where}ORDER BY ${df} DESC NULLS LAST LIMIT 1000`;
}

export const getPublicSalesforceVendidoTv = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const v = (input as { variant?: unknown } | null)?.variant;
    if (typeof v !== "string" || !(v in PUBLIC_TV_PRESETS)) {
      throw new Error("variant inválido");
    }
    return { variant: v as PublicTvVariant };
  })
  .handler(async ({ data }) => {
    const soql = buildPublicSoql(PUBLIC_TV_PRESETS[data.variant]);
    const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    return { records: (res?.records ?? []).map(mapPublicOppRow) as PublicOppRow[] };
  });

const MAX_PUBLIC_RANGE_DAYS = 400;

export const getPublicSalesforceVendas = createServerFn({ method: "GET" })
  .inputValidator((input: { start?: string | null; end?: string | null } | null) => {
    const start = input?.start ?? null;
    const end = input?.end ?? null;
    if (!validDate(start) || !validDate(end)) {
      throw new Error("Datas obrigatórias (YYYY-MM-DD).");
    }
    const spanMs = new Date(end!).getTime() - new Date(start!).getTime();
    if (spanMs < 0 || spanMs > MAX_PUBLIC_RANGE_DAYS * 86_400_000) {
      throw new Error("Intervalo fora do permitido.");
    }
    return { start: start as string, end: end as string };
  })
  .handler(async ({ data }) => {
    const clauses: string[] = [
      `StageName = 'Pedido Concluído'`,
      `(Tipo_de_NF__c = null OR Tipo_de_NF__c != 'Bonificação')`,
      `CloseDate >= ${data.start}`,
      `CloseDate <= ${data.end}`,
    ];
    const soql =
      `SELECT ${PUBLIC_OPP_COLS} FROM Opportunity WHERE ${clauses.join(" AND ")} ` +
      `ORDER BY CloseDate DESC NULLS LAST LIMIT 1000`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    return { records: (res?.records ?? []).map(mapPublicOppRow) as PublicOppRow[] };
  });



// =============================================================
// Clientes Novos — oportunidades cujos clientes não possuem
// nenhuma venda concluída (StageName = 'Pedido Concluído') com
// CloseDate anterior ao início do período filtrado.
// =============================================================

export const OPP_DEFAULTS_CLIENTES_NOVOS: OppFilters = {
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

function resolveLiteralStartISO(literal: string, dateFrom?: string): string | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const iso = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  switch ((literal || "").trim()) {
    case "TODAY": return iso(new Date(y, m, d));
    case "YESTERDAY": return iso(new Date(y, m, d - 1));
    case "THIS_WEEK": return iso(new Date(y, m, d - now.getDay()));
    case "LAST_WEEK": return iso(new Date(y, m, d - now.getDay() - 7));
    case "THIS_MONTH": return iso(new Date(y, m, 1));
    case "LAST_MONTH": return iso(new Date(y, m - 1, 1));
    case "THIS_QUARTER": return iso(new Date(y, Math.floor(m / 3) * 3, 1));
    case "LAST_QUARTER": return iso(new Date(y, (Math.floor(m / 3) - 1) * 3, 1));
    case "THIS_YEAR": return iso(new Date(y, 0, 1));
    case "LAST_YEAR": return iso(new Date(y - 1, 0, 1));
    case "CUSTOM": return validDate(dateFrom) ? (dateFrom as string) : null;
    default: return null;
  }
}

async function runClientesNovos(f: OppFilters, ownerClause: string) {
    const df: "CloseDate" | "CreatedDate" | "Data_de_Faturamento__c" =
      f.dateField === "CreatedDate"
        ? "CreatedDate"
        : f.dateField === "Data_de_Faturamento__c"
          ? "Data_de_Faturamento__c"
          : "CloseDate";
    const suffixStart = df === "CreatedDate" ? "T00:00:00Z" : "";
    const suffixEnd = df === "CreatedDate" ? "T23:59:59Z" : "";
    const clauses: string[] = [];

    if (f.stageEquals && f.stageEquals.trim())
      clauses.push(`StageName = '${esc(f.stageEquals.trim())}'`);
    if (f.stageNotEquals && f.stageNotEquals.trim())
      clauses.push(`StageName != '${esc(f.stageNotEquals.trim())}'`);
    const statuses = (f.statusIn ?? []).filter(Boolean);
    if (statuses.length)
      clauses.push(`Status_do_Pedido__c IN (${statuses.map((s) => `'${esc(s)}'`).join(",")})`);
    for (const v of (f.tipoNfNotIn ?? []).filter(Boolean))
      clauses.push(`(Tipo_de_NF__c = null OR Tipo_de_NF__c != '${esc(v)}')`);
    for (const v of (f.accountNameNotIn ?? []).filter(Boolean))
      clauses.push(`(Account.Name = null OR Account.Name != '${esc(v)}')`);
    const orgs = (f.orgIn ?? []).filter(Boolean);
    if (orgs.length)
      clauses.push(`Org_Oportunidade__c IN (${orgs.map((s) => `'${esc(s)}'`).join(",")})`);
    for (const v of (f.ownerNameNotIn ?? []).filter(Boolean))
      clauses.push(`(Owner.Name = null OR Owner.Name != '${esc(v)}')`);
    const lossIn = (f.lossReasonIn ?? []).filter(Boolean);
    if (lossIn.length)
      clauses.push(`Loss_Reason__c IN (${lossIn.map((s) => `'${esc(s)}'`).join(",")})`);
    for (const v of (f.lossReasonNotIn ?? []).filter(Boolean))
      clauses.push(`(Loss_Reason__c = null OR Loss_Reason__c != '${esc(v)}')`);

    const literal = (f.dateLiteral ?? "").trim();
    if (literal === "CUSTOM") {
      if (f.dateFrom && validDate(f.dateFrom)) clauses.push(`${df} >= ${f.dateFrom}${suffixStart}`);
      if (f.dateTo && validDate(f.dateTo)) clauses.push(`${df} <= ${f.dateTo}${suffixEnd}`);
    } else if (literal) {
      clauses.push(`${df} = ${literal}`);
    }
    if (f.dateField2) {
      const df2 = f.dateField2;
      const s2 = df2 === "CreatedDate" ? "T00:00:00Z" : "";
      const e2 = df2 === "CreatedDate" ? "T23:59:59Z" : "";
      const l2 = (f.dateLiteral2 ?? "").trim();
      if (l2 === "CUSTOM") {
        if (f.dateFrom2 && validDate(f.dateFrom2)) clauses.push(`${df2} >= ${f.dateFrom2}${s2}`);
        if (f.dateTo2 && validDate(f.dateTo2)) clauses.push(`${df2} <= ${f.dateTo2}${e2}`);
      } else if (l2) {
        clauses.push(`${df2} = ${l2}`);
      }
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")} ` : "";
    const soql =
      `SELECT ${OPP_COLS} FROM Opportunity ${where}${ownerClause} ` +
      `ORDER BY CloseDate DESC NULLS LAST LIMIT 1000`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    const rows: SalesforceOppRow[] = (res?.records ?? []).map(mapOppRow);

    let rangeStart = resolveLiteralStartISO(literal, f.dateFrom);
    if (!rangeStart && f.dateField2) {
      rangeStart = resolveLiteralStartISO((f.dateLiteral2 ?? "").trim(), f.dateFrom2);
    }
    if (!rangeStart) {
      for (const r of rows) {
        if (r.closeDate && (!rangeStart || r.closeDate < rangeStart)) rangeStart = r.closeDate;
      }
    }
    if (!rangeStart) {
      return { records: [] as SalesforceOppRow[], newAccountsCount: 0, reactivationCount: 0, carteiraCount: 0, rangeStart: null };
    }

    const accountIds = Array.from(
      new Set(rows.map((r) => r.accountId).filter((v): v is string => !!v)),
    );
    if (accountIds.length === 0) {
      return {
        records: [] as SalesforceOppRow[],
        newAccountsCount: 0,
        reactivationCount: 0,
        carteiraCount: 0,
        rangeStart,
      };
    }

    const lastByAccount = new Map<string, string>();
    const CHUNK = 200;
    for (let i = 0; i < accountIds.length; i += CHUNK) {
      const chunk = accountIds.slice(i, i + CHUNK);
      const histSoql =
        `SELECT AccountId, MAX(CloseDate) maxClose FROM Opportunity ` +
        `WHERE StageName = 'Pedido Concluído' AND CloseDate < ${rangeStart} ` +
        `AND AccountId IN (${chunk.map((id) => `'${esc(id)}'`).join(",")}) ` +
        `GROUP BY AccountId LIMIT 2000`;
      const hres = await sfFetch(`/query?q=${encodeURIComponent(histSoql)}`);
      for (const rec of hres?.records ?? []) {
        if (rec.AccountId && rec.maxClose) {
          lastByAccount.set(rec.AccountId, String(rec.maxClose).slice(0, 10));
        }
      }
    }

    const [ry, rm, rd] = rangeStart.split("-").map((n) => parseInt(n, 10));
    const cutoff = new Date(ry, rm - 1 - 3, rd);
    const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

    const firstByAccount = new Map<string, SalesforceOppRow>();
    for (const r of rows) {
      if (!r.accountId) continue;
      const cur = firstByAccount.get(r.accountId);
      if (!cur) { firstByAccount.set(r.accountId, r); continue; }
      const a = r.closeDate ?? "";
      const b = cur.closeDate ?? "";
      if (a && (!b || a < b)) firstByAccount.set(r.accountId, r);
    }

    let novoCount = 0;
    let reativCount = 0;
    let carteiraCount = 0;
    const classified: SalesforceOppRow[] = Array.from(firstByAccount.values()).map((r) => {
      const last = r.accountId ? lastByAccount.get(r.accountId) ?? null : null;
      let classification: "novo" | "reativacao" | "carteira";
      if (!last) { classification = "novo"; novoCount++; }
      else if (last < cutoffIso) { classification = "reativacao"; reativCount++; }
      else { classification = "carteira"; carteiraCount++; }
      return { ...r, classification, lastPurchaseBefore: last };
    });

    classified.sort((a, b) => (b.closeDate ?? "").localeCompare(a.closeDate ?? ""));

    return {
      records: classified,
      newAccountsCount: novoCount,
      reactivationCount: reativCount,
      carteiraCount,
      rangeStart,
    };
}

export const getSalesforceClientesNovos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => (input ?? {}) as OppFilters)
  .handler(async ({ data, context }) => {
    const f: OppFilters = data ?? {};
    const ownerClause = (f as OppFilters & { unscoped?: boolean }).unscoped
      ? ""
      : ownerFilterClause(
          await resolveSalesforceOwnerFilter(context.supabase, context.userId, f.ownerId ?? null),
        );
    return runClientesNovos(f, ownerClause);
  });

export const getPublicClientesNovosTv = createServerFn({ method: "GET" }).handler(async () => {
  const r = await runClientesNovos(OPP_DEFAULTS_CLIENTES_NOVOS, "");
  return {
    novos: r.newAccountsCount ?? 0,
    reativacoes: r.reactivationCount ?? 0,
    carteira: r.carteiraCount ?? 0,
  };
});

// =============================================================
// Recorrência / Retenção — contas que compraram > R$ 15.000
// (Pedido Concluído, excluindo Bonificação) em um trimestre.
// =============================================================

const RECURRENCE_THRESHOLD = 15000;

function quarterRangeIso(year: number, quarter: number): { start: string; end: string } {
  let y = year;
  let q = quarter;
  if (q < 1) { q = 4; y = year - 1; }
  if (q > 4) { q = 1; y = year + 1; }
  const start = new Date(y, (q - 1) * 3, 1);
  const end = new Date(y, q * 3, 0);
  const iso = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return { start: iso(start), end: iso(end) };
}

export type RecurrenceAccountRow = {
  accountId: string;
  accountName: string | null;
  owner: string | null;
  ownerId: string | null;
  total: number;
  orders: number;
};

async function aggregateByAccount(
  start: string,
  end: string,
  ownerClause: string,
): Promise<Map<string, { total: number; orders: number; name: string | null; owner: string | null; ownerId: string | null }>> {
  // Agregação usando SOQL GROUP BY (sem risco do teto de 1000 linhas).
  const clauses = [
    `StageName = 'Pedido Concluído'`,
    `(Tipo_de_NF__c = null OR Tipo_de_NF__c != 'Bonificação')`,
    `CloseDate >= ${start}`,
    `CloseDate <= ${end}`,
    `AccountId != null`,
  ];
  const soql =
    `SELECT AccountId, Account.Name accName, Owner.Name ownerName, OwnerId, ` +
    `SUM(Total__c) sumT, SUM(Amount) sumA, COUNT(Id) cnt ` +
    `FROM Opportunity WHERE ${clauses.join(" AND ")}${ownerClause} ` +
    `GROUP BY AccountId, Account.Name, Owner.Name, OwnerId LIMIT 5000`;
  const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
  const map = new Map<string, { total: number; orders: number; name: string | null; owner: string | null; ownerId: string | null }>();
  for (const r of res?.records ?? []) {
    const total = typeof r.sumT === "number" ? r.sumT : typeof r.sumA === "number" ? r.sumA : 0;
    const existing = map.get(r.AccountId);
    if (existing) {
      existing.total += total;
      existing.orders += typeof r.cnt === "number" ? r.cnt : 0;
    } else {
      map.set(r.AccountId, {
        total,
        orders: typeof r.cnt === "number" ? r.cnt : 0,
        name: r.accName ?? null,
        owner: r.ownerName ?? null,
        ownerId: r.OwnerId ?? null,
      });
    }
  }
  return map;
}

export const getSalesforceRecorrencia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { year: number; quarter: number; ownerId?: string | null }) => {
    if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 3000) {
      throw new Error("Ano inválido.");
    }
    if (!Number.isInteger(input.quarter) || input.quarter < 1 || input.quarter > 4) {
      throw new Error("Trimestre inválido.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { start, end } = quarterRangeIso(data.year, data.quarter);
    const ownerClause = ownerFilterClause(
      await resolveSalesforceOwnerFilter(context.supabase, context.userId, data.ownerId ?? null),
    );
    const agg = await aggregateByAccount(start, end, ownerClause);
    const records: RecurrenceAccountRow[] = [];
    for (const [accountId, v] of agg) {
      if (v.total > RECURRENCE_THRESHOLD) {
        records.push({
          accountId,
          accountName: v.name,
          owner: v.owner,
          ownerId: v.ownerId,
          total: v.total,
          orders: v.orders,
        });
      }
    }
    records.sort((a, b) => b.total - a.total);
    return {
      records,
      threshold: RECURRENCE_THRESHOLD,
      range: { start, end },
    };
  });

export type RetentionAccountRow = RecurrenceAccountRow & { previousTotal: number };

export const getSalesforceRetencao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { year: number; quarter: number; ownerId?: string | null }) => {
    if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 3000) {
      throw new Error("Ano inválido.");
    }
    if (!Number.isInteger(input.quarter) || input.quarter < 1 || input.quarter > 4) {
      throw new Error("Trimestre inválido.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const cur = quarterRangeIso(data.year, data.quarter);
    const prev = quarterRangeIso(data.year, data.quarter - 1);
    const ownerClause = ownerFilterClause(
      await resolveSalesforceOwnerFilter(context.supabase, context.userId, data.ownerId ?? null),
    );
    const [curAgg, prevAgg] = await Promise.all([
      aggregateByAccount(cur.start, cur.end, ownerClause),
      aggregateByAccount(prev.start, prev.end, ownerClause),
    ]);
    const prevQualified = new Set<string>();
    let prevQualifiedCount = 0;
    for (const [accId, v] of prevAgg) {
      if (v.total > RECURRENCE_THRESHOLD) {
        prevQualified.add(accId);
        prevQualifiedCount++;
      }
    }
    const records: RetentionAccountRow[] = [];
    for (const accId of prevQualified) {
      const c = curAgg.get(accId);
      if (c && c.total > RECURRENCE_THRESHOLD) {
        records.push({
          accountId: accId,
          accountName: c.name,
          owner: c.owner,
          ownerId: c.ownerId,
          total: c.total,
          orders: c.orders,
          previousTotal: prevAgg.get(accId)?.total ?? 0,
        });
      }
    }
    records.sort((a, b) => b.total - a.total);
    return {
      records,
      threshold: RECURRENCE_THRESHOLD,
      previousQualifiedCount: prevQualifiedCount,
      retentionRate: prevQualifiedCount > 0 ? records.length / prevQualifiedCount : 0,
      range: { current: cur, previous: prev },
    };
  });

function currentQuarterInfo(): { year: number; quarter: number } {
  const now = new Date();
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

export const getPublicRecorrenciaTv = createServerFn({ method: "GET" }).handler(async () => {
  const { year, quarter } = currentQuarterInfo();
  const { start, end } = quarterRangeIso(year, quarter);
  const agg = await aggregateByAccount(start, end, "");
  let count = 0;
  for (const [, v] of agg) if (v.total > RECURRENCE_THRESHOLD) count++;
  return { count, threshold: RECURRENCE_THRESHOLD };
});

export const getPublicRetencaoTv = createServerFn({ method: "GET" }).handler(async () => {
  const { year, quarter } = currentQuarterInfo();
  const cur = quarterRangeIso(year, quarter);
  const prev = quarterRangeIso(year, quarter - 1);
  const [curAgg, prevAgg] = await Promise.all([
    aggregateByAccount(cur.start, cur.end, ""),
    aggregateByAccount(prev.start, prev.end, ""),
  ]);
  let previousQualifiedCount = 0;
  const prevQualified = new Set<string>();
  for (const [accId, v] of prevAgg) {
    if (v.total > RECURRENCE_THRESHOLD) { prevQualified.add(accId); previousQualifiedCount++; }
  }
  let count = 0;
  for (const accId of prevQualified) {
    const c = curAgg.get(accId);
    if (c && c.total > RECURRENCE_THRESHOLD) count++;
  }
  return { count, previousQualifiedCount, threshold: RECURRENCE_THRESHOLD };
});



