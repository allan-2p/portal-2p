import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ownerFilterClause,
  resolveSalesforceOwnerFilter,
  assertAccountAccess,
  assertTaskOwnership,
  filterAllowedAccountIds,
  getScopeForUser,
} from "./scope.server";

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
  const maxAttempts = 5;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
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
      const retryable = res.status >= 500 || res.status === 429 || res.status === 408;
      const msg = typeof body === "object" ? JSON.stringify(body) : String(body);
      lastErr = new Error(`Salesforce ${res.status}: ${msg}`);
      if (!retryable || attempt === maxAttempts) throw lastErr;
    } catch (err) {
      // Network-level failure (connection reset) — also retryable
      lastErr = err;
      if (attempt === maxAttempts) throw lastErr;
    }
    // exponential backoff with jitter: ~0.6s, 1.2s, 2.4s, 4.8s
    const delay = 600 * 2 ** (attempt - 1) + Math.random() * 250;
    await new Promise((r) => setTimeout(r, delay));
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
  .handler(async ({ data, context }) => {
    const ownerFilter = await resolveSalesforceOwnerFilter(context.supabase, context.userId, null);
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
    const scopeClause = ownerFilterClause(ownerFilter).replace(/^ AND /, "");
    if (scopeClause) clauses.push(scopeClause);
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
  .handler(async ({ data, context }) => {
    const cur = await sfFetch(
      `/query?q=${encodeURIComponent(`SELECT Id, OwnerId FROM Task WHERE Id = '${esc(data.taskId)}' LIMIT 1`)}`,
    );
    await assertTaskOwnership(context.supabase, context.userId, cur?.records?.[0]?.OwnerId ?? null);
    await sfFetch(`/sobjects/Task/${data.taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ Status: "Completed" }),
    });
    return { ok: true };
  });

export const rescheduleSalesforceTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { taskId: string; newDate: string; reason?: string | null }) => {
    if (!validId(input.taskId)) throw new Error("ID de tarefa inválido.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.newDate)) throw new Error("Data inválida (YYYY-MM-DD).");
    // Só permite mover para frente (data >= hoje)
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [y, m, d] = input.newDate.split("-").map(Number);
    const target = new Date(y, m - 1, d);
    if (target.getTime() < today.getTime()) {
      throw new Error("A nova data precisa ser hoje ou futura.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const cur = await sfFetch(
      `/query?q=${encodeURIComponent(`SELECT Id, OwnerId FROM Task WHERE Id = '${esc(data.taskId)}' LIMIT 1`)}`,
    );
    await assertTaskOwnership(context.supabase, context.userId, cur?.records?.[0]?.OwnerId ?? null);
    const body: Record<string, unknown> = { ActivityDate: data.newDate };
    if (data.reason && data.reason.trim()) {
      // Anexa a justificativa na descrição para manter histórico no Salesforce.
      const stamp = new Date().toLocaleString("pt-BR");
      body.Description = `[Reagendado em ${stamp}] ${data.reason.trim()}`;
    }
    await sfFetch(`/sobjects/Task/${data.taskId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return { ok: true, newDate: data.newDate };
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
  .handler(async ({ data, context }) => {
    const body = buildTaskBody({ status: "Open", ...data });
    const res = await postTaskWithDefaults(body);
    const { auditIntegration } = await import("@/lib/audit.server");
    void auditIntegration(context.userId, "salesforce", "criou tarefa", data.subject);
    return { id: res?.id ?? null };
  });

export const logSalesforceInteraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: TaskPayload) => {
    if (!input.subject || !input.subject.trim()) throw new Error("Assunto é obrigatório.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const today = new Date();
    const activityDate =
      data.activityDate ||
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const body = buildTaskBody({ ...data, status: "Completed", activityDate });
    // Log a Call: mesmo comportamento do botão "Log a Call" no Salesforce —
    // grava uma Task concluída com TaskSubtype = 'Call' (chamada), não uma tarefa comum.
    (body as Record<string, unknown>).TaskSubtype = "Call";
    const res = await postTaskWithDefaults(body);
    const { auditIntegration } = await import("@/lib/audit.server");
    void auditIntegration(context.userId, "salesforce", "registrou interação", data.subject);
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
    const [res, hiddenRes, consultoresRes] = await Promise.all([
      sfFetch(`/query?q=${encodeURIComponent(soql)}`),
      context.supabase.from("hidden_salespeople").select("sf_user_id"),
      // Regra universal do portal: só entram usuários da organização Solar
      // (ou "grupo") marcados como consultores e com código SAP.
      context.supabase
        .from("profiles")
        .select("sf_user_id, numero_sap, organizacao, ativo, is_consultor")
        .eq("ativo", true)
        .eq("is_consultor", true)
        .in("organizacao", ["solar", "grupo"]),
    ]);
    const hidden = new Set<string>((hiddenRes.data ?? []).map((r: any) => r.sf_user_id));
    const consultores = new Set<string>(
      ((consultoresRes.data ?? []) as any[])
        .filter((p) => String(p.numero_sap ?? "").trim() !== "" && p.sf_user_id)
        .map((p) => String(p.sf_user_id)),
    );
    // Vendedor com escopo restrito só enxerga os vendedores da própria carteira.
    const scope = await getScopeForUser(context.supabase, context.userId);
    const allowed = scope.scope === "geral" ? null : new Set(scope.allowed_sf_ids ?? []);
    const records: SalesforceSalesperson[] = (res?.records ?? [])
      .filter(
        (r: any) =>
          consultores.has(r.Id) && !hidden.has(r.Id) && (!allowed || allowed.has(r.Id)),
      )
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
  /** Campos extras de cadastro (dossiê 360) */
  nomeFantasia?: string | null;
  email?: string | null;
  instagram?: string | null;
  nSap?: string | null;
  tipoCliente?: string | null;
  carteira?: string | null;
  condicaoPagamento?: string | null;
  tabelaPrecos?: string | null;
  regiao?: string | null;
  finalidadeUso?: string | null;
  statusConta?: string | null;
  regimeTributario?: string | null;
  contribuinte?: string | null;
  inscricaoEstadual?: string | null;
  primeiraCompra?: string | null;
  origem?: string | null;
  icp?: number | null;
  operacao?: string | null;
  porte?: string | null;
  organizacao?: string | null;
  planoFidelidade?: string | null;
  pontuacaoFidelidade?: number | null;
  ativo?: boolean | null;
};


function formatCnpj(v: string | null): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  if (d.length !== 14) return v;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`;
}

function _mapAccountSf(r: any): SalesforceAccount {
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

function mapAccountDb(r: any, ownerNames: Map<string, string>): SalesforceAccount {
  const cf = (r.custom_fields ?? {}) as Record<string, any>;
  const rawSeg = (cf.Segmentacao_Solar__c ?? "").toString().trim().toUpperCase();
  const segment = (["A", "B", "C", "D"] as const).includes(rawSeg as any)
    ? (rawSeg as "A" | "B" | "C" | "D")
    : null;
  const tubos = typeof cf.Segmentacao_Tubos__c === "string" && cf.Segmentacao_Tubos__c
    ? cf.Segmentacao_Tubos__c.split(";").map((s: string) => s.trim()).filter(Boolean)
    : [];
  const num = (v: any) => (typeof v === "number" ? v : null);
  return {
    id: r.id,
    name: r.name ?? "",
    cnpj: formatCnpj(cf.CNPJ__c ?? null),
    segment,
    tubos,
    ownerId: r.owner_id ?? null,
    ownerName: (r.owner_id && ownerNames.get(r.owner_id)) || null,
    createdAt: r.created_date ?? null,
    phone: r.phone ?? cf.Telefone__c ?? cf.Telefone_Empresa__c ?? null,
    website: r.website ?? null,
    industry: r.industry ?? null,
    observacoes: cf.Observacoes__c ?? null,
    description: r.description ?? null,
    quarterProjection: num(cf.Total_Vendido_Trimestre_Anterior__c),
    quarterSold: num(cf.Total_Vendido_Esse_Trimestre__c),
    nomeFantasia: cf.Nome_Fantasia__c ?? null,
    email: cf.Email__c ?? null,
    instagram: cf.Instagram__c ?? null,
    nSap: cf.N_SAP__c != null ? String(cf.N_SAP__c) : null,
    tipoCliente: cf.Tipo_de_Cliente__c ?? null,
    carteira: cf.Carteira_Atribuida__c ?? null,
    condicaoPagamento: cf.Condicao_de_Pagamento__c ?? null,
    tabelaPrecos: cf.Tabela_de_pre_os__c ?? null,
    regiao: cf.Regiao_de_Atuacao__c ?? null,
    finalidadeUso: cf.Finalidade_de_Uso__c ?? null,
    statusConta: cf.Status_da_Conta__c ?? null,
    regimeTributario: cf.Regime_Tributario_Detalhado__c ?? cf.Regime_Tributario__c ?? null,
    contribuinte: cf.Contribuinte_ICMS__c ?? null,
    inscricaoEstadual: cf.Inscri_o_Estadual__c != null ? String(cf.Inscri_o_Estadual__c) : null,
    primeiraCompra: cf.Data_da_Primeira_Compra__c ?? null,
    origem: cf.Origem__c ?? null,
    icp: num(cf.ICP__c),
    operacao: cf.Operacao__c ?? null,
    porte: cf.Porte__c ?? null,
    organizacao: cf.Org_Conta__c ?? null,
    planoFidelidade: cf.Plano_Fidelidade__c ?? null,
    pontuacaoFidelidade: num(cf.Pontuacao_Plano_Fidelidade__c),
    ativo: typeof cf.Ativo__c === "boolean" ? cf.Ativo__c : null,
  };

}

export const getSalesforceAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { instance?: "solar" | "carregadores" }) => d ?? {})
  .handler(async ({ data, context }) => {
    const instance = data?.instance === "carregadores" ? "carregadores" : "solar";
    // Fonte única: banco espelho (account_sf). Sem fallback para o Salesforce.
    const { fetchAccountsFromDb } = await import("@/lib/accounts-db.server");
    const [rows, profilesRes] = await Promise.all([
      fetchAccountsFromDb(instance),
      context.supabase.from("profiles").select("sf_user_id, full_name"),
    ]);
    const ownerNames = new Map<string, string>();
    for (const p of profilesRes.data ?? []) {
      if (p.sf_user_id && p.full_name) ownerNames.set(p.sf_user_id, p.full_name);
    }
    // Escopo de carteira aplicado no servidor: vendedor só recebe as contas dele.
    const scope = await getScopeForUser(context.supabase, context.userId);
    const visible =
      scope.scope === "geral"
        ? rows
        : rows.filter((r) => !!r.owner_id && (scope.allowed_sf_ids ?? []).includes(r.owner_id));
    return { records: visible.map((r) => mapAccountDb(r, ownerNames)) as SalesforceAccount[] };
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

/**
 * Coorte de conversão: TODAS as oportunidades criadas no período (independente do
 * estágio atual). Serve para medir "dos orçamentos gerados no período, quantos
 * viraram Pedido Concluído" — por isso a taxa nunca passa de 100%.
 */
export const getSalesforceOppsCriadas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { start?: string | null; end?: string | null; ownerId?: string | null }) => input ?? {})
  .handler(async ({ data, context }) => {
    const clauses: string[] = [`(Tipo_de_NF__c = null OR Tipo_de_NF__c != 'Bonificação')`];
    if (validDate(data.start)) clauses.push(`CreatedDate >= ${data.start}T00:00:00Z`);
    if (validDate(data.end)) clauses.push(`CreatedDate <= ${data.end}T23:59:59Z`);
    const ownerClause = ownerFilterClause(
      await resolveSalesforceOwnerFilter(context.supabase, context.userId, data.ownerId),
    );
    const soql =
      `SELECT ${OPP_COLS} FROM Opportunity WHERE ${clauses.join(" AND ")} ` +
      `${ownerClause} ORDER BY CreatedDate DESC LIMIT 2000`;
    let res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    const all: any[] = [...(res?.records ?? [])];
    let safety = 5;
    while (res && res.done === false && res.nextRecordsUrl && safety-- > 0) {
      const path = String(res.nextRecordsUrl).replace(/^\/services\/data\/v\d+\.\d+/, "");
      res = await sfFetch(path);
      all.push(...(res?.records ?? []));
    }
    return { records: all.map(mapOppRow) as SalesforceOppRow[] };
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

export type AccountHistoryQuarter = {
  key: string;   // e.g. "2025-Q3"
  year: number;
  quarter: number; // 1..4
  label: string;   // "Q3/25"
  total: number;
  count: number;
};

export type AccountStageBreakdown = {
  stage: string;
  count: number;
  total: number;
};

export type SalesforceAccountHistory = {
  quarters: AccountHistoryQuarter[];
  stages: AccountStageBreakdown[];
  totalLifetime: number;
  totalCount: number;
  avgTicket: number;
  openCount: number;
  openValue: number;
  lostCount: number;
  lastPurchase: string | null;
  firstPurchase: string | null;
  wonRate: number; // 0..1
};

function quarterOf(dateStr: string): { year: number; q: number } {
  const d = new Date(dateStr);
  return { year: d.getUTCFullYear(), q: Math.floor(d.getUTCMonth() / 3) + 1 };
}

export const getSalesforceAccountHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId: string }) => input)
  .handler(async ({ data, context }) => {
    const accountId = String(data.accountId ?? "").trim();
    if (!accountId || !/^[a-zA-Z0-9]{15,18}$/.test(accountId)) {
      throw new Error("accountId inválido");
    }
    await assertAccountAccess(context.supabase, context.userId, accountId);
    // ~2 years window
    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const soql =
      `SELECT Id, Amount, Total__c, StageName, CloseDate ` +
      `FROM Opportunity ` +
      `WHERE AccountId = '${esc(accountId)}' ` +
      `AND (Tipo_de_NF__c = null OR Tipo_de_NF__c != 'Bonificação') ` +
      `AND CloseDate >= ${cutoffStr} ` +
      `ORDER BY CloseDate DESC NULLS LAST LIMIT 1000`;

    const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    const rows = (res?.records ?? []) as Array<{
      Id: string;
      Amount: number | null;
      Total__c: number | null;
      StageName: string | null;
      CloseDate: string | null;
    }>;

    // Build quarter buckets covering the last 8 quarters (including current).
    const now = new Date();
    const curY = now.getUTCFullYear();
    const curQ = Math.floor(now.getUTCMonth() / 3) + 1;
    const quarters: AccountHistoryQuarter[] = [];
    for (let i = 7; i >= 0; i--) {
      let y = curY;
      let q = curQ - i;
      while (q <= 0) { q += 4; y -= 1; }
      quarters.push({
        key: `${y}-Q${q}`,
        year: y,
        quarter: q,
        label: `Q${q}/${String(y).slice(-2)}`,
        total: 0,
        count: 0,
      });
    }
    const qIndex = new Map(quarters.map((q, i) => [q.key, i] as const));

    const stageMap = new Map<string, AccountStageBreakdown>();
    let totalLifetime = 0;
    let totalCount = 0;
    let openCount = 0;
    let openValue = 0;
    let lostCount = 0;
    let lastPurchase: string | null = null;
    let firstPurchase: string | null = null;

    for (const r of rows) {
      const stage = r.StageName ?? "—";
      const val = (typeof r.Total__c === "number" ? r.Total__c : r.Amount) ?? 0;

      const s = stageMap.get(stage) ?? { stage, count: 0, total: 0 };
      s.count += 1;
      s.total += val;
      stageMap.set(stage, s);

      if (stage === "Pedido Concluído") {
        totalLifetime += val;
        totalCount += 1;
        if (r.CloseDate) {
          if (!lastPurchase || r.CloseDate > lastPurchase) lastPurchase = r.CloseDate;
          if (!firstPurchase || r.CloseDate < firstPurchase) firstPurchase = r.CloseDate;
          const { year, q } = quarterOf(r.CloseDate);
          const idx = qIndex.get(`${year}-Q${q}`);
          if (idx != null) {
            quarters[idx].total += val;
            quarters[idx].count += 1;
          }
        }
      } else if (stage === "Perdido" || stage === "Cancelado" || /perd/i.test(stage) || /cancel/i.test(stage)) {
        lostCount += 1;
      } else {
        openCount += 1;
        openValue += val;
      }
    }

    const stages = [...stageMap.values()].sort((a, b) => b.total - a.total);
    const decided = totalCount + lostCount;
    return {
      quarters,
      stages,
      totalLifetime,
      totalCount,
      avgTicket: totalCount ? totalLifetime / totalCount : 0,
      openCount,
      openValue,
      lostCount,
      lastPurchase,
      firstPurchase,
      wonRate: decided ? totalCount / decided : 0,
    } as SalesforceAccountHistory;
  });

export type SalesforceContact = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  department: string | null;
  description: string | null;
};

export const getSalesforceAccountContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId: string }) => input)
  .handler(async ({ data, context }) => {
    const accountId = String(data.accountId ?? "").trim();
    if (!validId(accountId)) throw new Error("accountId inválido");
    await assertAccountAccess(context.supabase, context.userId, accountId);
    const soql =
      `SELECT Id, Name, Title, Email, Phone, MobilePhone, Department ` +
      `FROM Contact WHERE AccountId = '${esc(accountId)}' ORDER BY Name ASC LIMIT 200`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
    const records: SalesforceContact[] = (res?.records ?? []).map((r: any) => ({
      id: r.Id,
      name: r.Name ?? "(sem nome)",
      title: r.Title ?? null,
      email: r.Email ?? null,
      phone: r.Phone ?? null,
      mobile: r.MobilePhone ?? null,
      department: r.Department ?? null,
      description: null,
    }));
    return { records };
  });

export type AgendaAccountInfo = {
  accountId: string;
  name: string | null;
  segment: "A" | "B" | "C" | "D" | null;
  contactName: string | null;
  contactPhone: string | null;
  openAmount: number;
  openCount: number;
};

/** Dados de apoio da Agenda: segmentação, contato principal e orçamentos em aberto por conta. */
export const getSalesforceAgendaAccountInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountIds: string[] }) => input ?? { accountIds: [] })
  .handler(async ({ data, context }) => {
    const requested = Array.from(new Set((data.accountIds ?? []).filter(validId))).slice(0, 200);
    const ids = await filterAllowedAccountIds(context.supabase, context.userId, requested);
    if (ids.length === 0) return { records: [] as AgendaAccountInfo[] };
    const inList = ids.map((i) => `'${esc(i)}'`).join(",");

    const [accRes, contactRes, oppRes] = await Promise.all([
      sfFetch(
        `/query?q=${encodeURIComponent(
          `SELECT Id, Name, Segmentacao_Solar__c, Phone FROM Account WHERE Id IN (${inList}) LIMIT 200`,
        )}`,
      ),
      sfFetch(
        `/query?q=${encodeURIComponent(
          `SELECT Id, AccountId, Name, Phone, MobilePhone, Title, CreatedDate FROM Contact ` +
            `WHERE AccountId IN (${inList}) ORDER BY CreatedDate ASC LIMIT 1000`,
        )}`,
      ),
      sfFetch(
        `/query?q=${encodeURIComponent(
          `SELECT Id, AccountId, Amount, Total__c FROM Opportunity ` +
            `WHERE AccountId IN (${inList}) AND IsClosed = false ` +
            `AND StageName != 'Pedido Concluído' ` +
            `AND (Tipo_de_NF__c = null OR Tipo_de_NF__c != 'Bonificação') LIMIT 2000`,
        )}`,
      ),
    ]);

    const contactByAccount = new Map<string, { name: string; phone: string | null }>();
    for (const c of contactRes?.records ?? []) {
      const acc = c.AccountId as string;
      if (!acc) continue;
      const phone = c.MobilePhone ?? c.Phone ?? null;
      const cur = contactByAccount.get(acc);
      // primeiro contato criado; prioriza quem tem telefone
      if (!cur || (!cur.phone && phone)) {
        contactByAccount.set(acc, { name: c.Name ?? "(sem nome)", phone });
      }
    }

    const oppByAccount = new Map<string, { amount: number; count: number }>();
    for (const o of oppRes?.records ?? []) {
      const acc = o.AccountId as string;
      if (!acc) continue;
      const v = typeof o.Total__c === "number" ? o.Total__c : typeof o.Amount === "number" ? o.Amount : 0;
      const cur = oppByAccount.get(acc) ?? { amount: 0, count: 0 };
      cur.amount += v;
      cur.count += 1;
      oppByAccount.set(acc, cur);
    }

    const records: AgendaAccountInfo[] = (accRes?.records ?? []).map((a: any) => {
      const rawSeg = (a.Segmentacao_Solar__c ?? "").toString().trim().toUpperCase();
      const segment = (["A", "B", "C", "D"] as const).includes(rawSeg as any)
        ? (rawSeg as "A" | "B" | "C" | "D")
        : null;
      const contact = contactByAccount.get(a.Id) ?? null;
      const opp = oppByAccount.get(a.Id) ?? { amount: 0, count: 0 };
      return {
        accountId: a.Id,
        name: a.Name ?? null,
        segment,
        contactName: contact?.name ?? null,
        contactPhone: contact?.phone ?? a.Phone ?? null,
        openAmount: opp.amount,
        openCount: opp.count,
      };
    });
    return { records };
  });



export type SalesforceActivity = {
  id: string;
  kind: "task" | "event";
  date: string | null;
  subject: string;
  status: string | null;
  priority: string | null;
  description: string | null;
  owner: string | null;
};

export const getSalesforceAccountActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId: string }) => input)
  .handler(async ({ data, context }) => {
    const accountId = String(data.accountId ?? "").trim();
    if (!validId(accountId)) throw new Error("accountId inválido");
    await assertAccountAccess(context.supabase, context.userId, accountId);
    const taskSoql =
      `SELECT Id, Subject, Status, Priority, ActivityDate, Description, Owner.Name ` +
      `FROM Task WHERE WhatId = '${esc(accountId)}' ` +
      `ORDER BY ActivityDate DESC NULLS LAST LIMIT 200`;
    const eventSoql =
      `SELECT Id, Subject, ActivityDate, Description, Owner.Name ` +
      `FROM Event WHERE WhatId = '${esc(accountId)}' ` +
      `ORDER BY ActivityDate DESC NULLS LAST LIMIT 100`;
    const [tRes, eRes] = await Promise.all([
      sfFetch(`/query?q=${encodeURIComponent(taskSoql)}`).catch(() => ({ records: [] })),
      sfFetch(`/query?q=${encodeURIComponent(eventSoql)}`).catch(() => ({ records: [] })),
    ]);
    const tasks: SalesforceActivity[] = (tRes?.records ?? []).map((r: any) => ({
      id: r.Id,
      kind: "task" as const,
      date: r.ActivityDate ?? null,
      subject: r.Subject ?? "(sem assunto)",
      status: r.Status ?? null,
      priority: r.Priority ?? null,
      description: r.Description ?? null,
      owner: r.Owner?.Name ?? null,
    }));
    const events: SalesforceActivity[] = (eRes?.records ?? []).map((r: any) => ({
      id: r.Id,
      kind: "event" as const,
      date: r.ActivityDate ?? null,
      subject: r.Subject ?? "(sem assunto)",
      status: null,
      priority: null,
      description: r.Description ?? null,
      owner: r.Owner?.Name ?? null,
    }));
    const records = [...tasks, ...events].sort((a, b) => {
      const da = a.date ?? "";
      const db = b.date ?? "";
      return db.localeCompare(da);
    });
    return { records };
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

export const OPP_DEFAULTS_VENDIDO_TRI: OppFilters = {
  ...OPP_DEFAULTS_VENDIDO_MES,
  dateLiteral: "THIS_QUARTER",
};

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

export const OPP_DEFAULTS_CARREGADORES_TRI: OppFilters = {
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
  ownerNameIn: ["Caroline Gimenez"],
  dateField: "CloseDate",
  dateLiteral: "THIS_QUARTER",
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
  .handler(async ({ data, context }) => {
    const ownerFilter = await resolveSalesforceOwnerFilter(context.supabase, context.userId, null);
    const clauses: string[] = [
      `StageName = 'Pedido Concluído'`,
      `(Tipo_de_NF__c = null OR Tipo_de_NF__c != 'Bonificação')`,
      `CloseDate >= ${data.start}`,
      `CloseDate <= ${data.end}`,
      `AccountId != null`,
    ];
    const scopeClause = ownerFilterClause(ownerFilter).replace(/^ AND /, "");
    if (scopeClause) clauses.push(scopeClause);
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
  "005U400000JmJobIAF", // Gabriel Sargiani
] as const;

// Filtro adicional por nome (para membros ainda sem SF User ID configurado).
export const MARKETING_OWNER_NAMES_EXTRA: readonly string[] = [];

export const MARKETING_OWNER_NAMES: Record<string, string> = {
  "005Dn000005whg0IAA": "Fernando Lira",
  "005U400000HmVKfIAN": "Gabriel Kendi",
  "005U400000HYBs5IAH": "Erika Aiello",
  "005U400000IClATIA1": "Ygor Andreis",
  "005U400000C9Gg9IAF": "Marketing 2P",
  "005U400000JmJobIAF": "Gabriel Sargiani",
};

// Nomes de todos os owners (para exibição e filtros SOQL por nome).
export const MARKETING_OWNER_ALL_NAMES: string[] = [
  ...Object.values(MARKETING_OWNER_NAMES),
  ...MARKETING_OWNER_NAMES_EXTRA,
];

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
    const extraNames = MARKETING_OWNER_NAMES_EXTRA.map((n) => `'${esc(n)}'`).join(",");
    const ownerClause = extraNames
      ? `(OwnerId IN (${ownerList}) OR Owner.Name IN (${extraNames}))`
      : `OwnerId IN (${ownerList})`;
    const startDT = `${data.start}T00:00:00Z`;
    const endDT = `${data.end}T23:59:59Z`;

    const [byStatus, byOrigem, bySub, byOwner, daily, dailyConv, convertedRes] = await Promise.all([
      sfFetch(`/query?q=${encodeURIComponent(
        `SELECT COUNT(Id) total, Status FROM Lead ` +
        `WHERE ${ownerClause} AND CreatedDate >= ${startDT} AND CreatedDate <= ${endDT} ` +
        `GROUP BY Status`,
      )}`),
      sfFetch(`/query?q=${encodeURIComponent(
        `SELECT COUNT(Id) total, Origem__c FROM Lead ` +
        `WHERE ${ownerClause} AND CreatedDate >= ${startDT} AND CreatedDate <= ${endDT} ` +
        `GROUP BY Origem__c ORDER BY COUNT(Id) DESC`,
      )}`),
      sfFetch(`/query?q=${encodeURIComponent(
        `SELECT COUNT(Id) total, Sub_Origem__c FROM Lead ` +
        `WHERE ${ownerClause} AND CreatedDate >= ${startDT} AND CreatedDate <= ${endDT} ` +
        `GROUP BY Sub_Origem__c ORDER BY COUNT(Id) DESC LIMIT 20`,
      )}`),
      sfFetch(`/query?q=${encodeURIComponent(
        `SELECT COUNT(Id) total, Owner.Name ownerName FROM Lead ` +
        `WHERE ${ownerClause} AND CreatedDate >= ${startDT} AND CreatedDate <= ${endDT} ` +
        `GROUP BY Owner.Name ORDER BY COUNT(Id) DESC`,
      )}`),
      sfFetch(`/query?q=${encodeURIComponent(
        `SELECT COUNT(Id) total, DAY_ONLY(CreatedDate) dia FROM Lead ` +
        `WHERE ${ownerClause} AND CreatedDate >= ${startDT} AND CreatedDate <= ${endDT} ` +
        `GROUP BY DAY_ONLY(CreatedDate) ORDER BY DAY_ONLY(CreatedDate) ASC`,
      )}`),
      sfFetch(`/query?q=${encodeURIComponent(
        `SELECT COUNT(Id) total, DAY_ONLY(CreatedDate) dia FROM Lead ` +
        `WHERE ${ownerClause} AND IsConverted = true AND CreatedDate >= ${startDT} AND CreatedDate <= ${endDT} ` +
        `GROUP BY DAY_ONLY(CreatedDate) ORDER BY DAY_ONLY(CreatedDate) ASC`,
      )}`),
      sfFetch(`/query?q=${encodeURIComponent(
        `SELECT Id, Name, ConvertedDate, ConvertedAccountId, Origem__c, Sub_Origem__c, Owner.Name ` +
        `FROM Lead ` +
        `WHERE ${ownerClause} AND IsConverted = true ` +
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
  vendido_tri: OPP_DEFAULTS_VENDIDO_TRI,
  gerado_mes: OPP_DEFAULTS_GERADO_MES,
  faturamento_mes: OPP_DEFAULTS_VENDAS,
  carregadores_tri: OPP_DEFAULTS_CARREGADORES_TRI,
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




// ============================================================
// PRÉ-VENDAS — funil e motivos de perda para o time de Marketing
// ============================================================

export type PreVendasFunilData = {
  range: { start: string; end: string };
  leads: { novos: number; amadurecimento: number; convertidos: number; naoConvertidos: number; total: number };
  motivosPerdaOpp: MarketingBucket[];
  motivosNaoConvertido: MarketingBucket[];
  faturamentoPorOwner: { owner: string; leadsConvertidos: number; contas: number; faturado: number }[];
  faturamentoTotal: number;
};

export const getPreVendasFunilData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { start: string; end: string }) => {
    if (!validDate(input.start) || !validDate(input.end)) throw new Error("Datas inválidas.");
    return input;
  })
  .handler(async ({ data }) => {
    const ownerIds = MARKETING_OWNER_IDS.map((id) => `'${id}'`).join(",");
    const extraNames = MARKETING_OWNER_NAMES_EXTRA.map((n) => `'${esc(n)}'`).join(",");
    const startDT = `${data.start}T00:00:00Z`;
    const endDT = `${data.end}T23:59:59Z`;
    // Aceita owners por Id OR por Nome (para membros sem SF User Id configurado).
    const ownerWhere = extraNames
      ? `(OwnerId IN (${ownerIds}) OR Owner.Name IN (${extraNames}))`
      : `OwnerId IN (${ownerIds})`;

    // Motivos de perda: tenta campos comuns; se falhar, retorna vazio.
    async function safeGroup(soql: string): Promise<MarketingBucket[]> {
      try {
        const r = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
        return (r?.records ?? []).map((rec: any) => {
          const label = Object.keys(rec).find((k) => k !== "attributes" && k !== "total");
          return {
            label: (label ? rec[label] : null) ?? "Sem informação",
            value: typeof rec.total === "number" ? rec.total : 0,
          };
        });
      } catch { return []; }
    }

    const [byStatus, mPerdaOpp, mNaoConv, convertedRes] = await Promise.all([
      sfFetch(`/query?q=${encodeURIComponent(
        `SELECT COUNT(Id) total, Status FROM Lead ` +
        `WHERE ${ownerWhere} AND CreatedDate >= ${startDT} AND CreatedDate <= ${endDT} ` +
        `GROUP BY Status`,
      )}`),
      safeGroup(
        `SELECT COUNT(Id) total, Motivo_da_Perda__c FROM Opportunity ` +
        `WHERE ${ownerWhere} AND StageName = 'Projeto Não Fechado' ` +
        `AND CloseDate >= ${data.start} AND CloseDate <= ${data.end} ` +
        `GROUP BY Motivo_da_Perda__c ORDER BY COUNT(Id) DESC LIMIT 20`,
      ),
      safeGroup(
        `SELECT COUNT(Id) total, Motivo_da_N_o_Convers_o__c FROM Lead ` +
        `WHERE ${ownerWhere} AND Status = 'Não Convertido' ` +
        `AND CreatedDate >= ${startDT} AND CreatedDate <= ${endDT} ` +
        `GROUP BY Motivo_da_N_o_Convers_o__c ORDER BY COUNT(Id) DESC LIMIT 20`,
      ),
      sfFetch(`/query?q=${encodeURIComponent(
        `SELECT Id, ConvertedAccountId, Owner.Name FROM Lead ` +
        `WHERE ${ownerWhere} AND IsConverted = true ` +
        `AND ConvertedDate >= ${data.start} AND ConvertedDate <= ${data.end} ` +
        `LIMIT 1000`,
      )}`),
    ]);

    let novos = 0, amadurecimento = 0, convertidos = 0, naoConvertidos = 0, total = 0;
    for (const r of (byStatus?.records ?? [])) {
      const t = typeof r.total === "number" ? r.total : 0;
      total += t;
      const s = String(r.Status ?? "");
      if (s === "Novo") novos += t;
      else if (s === "Amadurecimento") amadurecimento += t;
      else if (s === "Convertido") convertidos += t;
      else if (s === "Não Convertido") naoConvertidos += t;
    }

    // Faturamento por owner: soma Opportunity Total__c (Pedido Concluído no período) por conta,
    // depois agrega pelos owners dos leads convertidos.
    const convertedRecords: any[] = convertedRes?.records ?? [];
    const accountToOwner = new Map<string, string>();
    const ownerAccounts = new Map<string, Set<string>>();
    const ownerLeadCount = new Map<string, number>();
    for (const r of convertedRecords) {
      const owner = r.Owner?.Name ?? "Sem owner";
      ownerLeadCount.set(owner, (ownerLeadCount.get(owner) ?? 0) + 1);
      const acc = r.ConvertedAccountId;
      if (validId(acc)) {
        accountToOwner.set(acc, owner);
        if (!ownerAccounts.has(owner)) ownerAccounts.set(owner, new Set());
        ownerAccounts.get(owner)!.add(acc);
      }
    }

    const accountValueById = new Map<string, number>();
    const accountIds = Array.from(accountToOwner.keys());
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
        const v = typeof r.sumT === "number" ? r.sumT : typeof r.sumA === "number" ? r.sumA : 0;
        accountValueById.set(r.AccountId, v);
      }
    }

    const ownerFaturado = new Map<string, number>();
    for (const [acc, owner] of accountToOwner.entries()) {
      ownerFaturado.set(owner, (ownerFaturado.get(owner) ?? 0) + (accountValueById.get(acc) ?? 0));
    }
    // Garante que todos os owners com leads convertidos apareçam mesmo sem faturamento.
    for (const owner of ownerLeadCount.keys()) {
      if (!ownerFaturado.has(owner)) ownerFaturado.set(owner, 0);
    }

    const faturamentoPorOwner = Array.from(ownerFaturado.entries())
      .map(([owner, faturado]) => ({
        owner,
        leadsConvertidos: ownerLeadCount.get(owner) ?? 0,
        contas: ownerAccounts.get(owner)?.size ?? 0,
        faturado,
      }))
      .sort((a, b) => b.faturado - a.faturado);
    const faturamentoTotal = Array.from(accountValueById.values()).reduce((a, b) => a + b, 0);

    const result: PreVendasFunilData = {
      range: { start: data.start, end: data.end },
      leads: { novos, amadurecimento, convertidos, naoConvertidos, total },
      motivosPerdaOpp: mPerdaOpp,
      motivosNaoConvertido: mNaoConv,
      faturamentoPorOwner,
      faturamentoTotal,
    };
    return result;
  });

// ---------------------------------------------------------------------------
// Linha do tempo unificada do cliente (portal inteiro, sem separação de instância)
// ---------------------------------------------------------------------------

export type ClientTimelineKind = "pedido" | "interacao" | "visita" | "treinamento";

export type ClientTimelineEntry = {
  id: string;
  kind: ClientTimelineKind;
  date: string | null;
  title: string;
  description: string | null;
  status: string | null;
  owner: string | null;
  amount: number | null;
  source: "salesforce" | "carregadores";
};

/** Classifica uma atividade em visita, treinamento ou interação a partir do texto. */
function classificarAtividade(texto: string, isEvent: boolean): ClientTimelineKind {
  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/(trein|capacit|workshop|onboarding|curso)/.test(t)) return "treinamento";
  if (/(visita|presencial|in loco|visit)/.test(t)) return "visita";
  return isEvent ? "visita" : "interacao";
}

/**
 * Histórico consolidado do cliente: pedidos, interações, visitas e treinamentos.
 * Reúne Salesforce (oportunidades, tarefas e reuniões) e a base de Carregadores
 * (propostas e tarefas), sem separação por instância.
 */
export const getClientTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId?: string; clienteNome?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const accountId = String(data.accountId ?? "").trim();
    const clienteNome = String(data.clienteNome ?? "").trim().slice(0, 200);
    const entries: ClientTimelineEntry[] = [];

    if (accountId) {
      if (!validId(accountId)) throw new Error("accountId inválido");
      await assertAccountAccess(context.supabase, context.userId, accountId);

      const cutoff = new Date();
      cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 3);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      const oppSoql =
        `SELECT Id, Name, Amount, Total__c, StageName, CloseDate, Owner.Name ` +
        `FROM Opportunity WHERE AccountId = '${esc(accountId)}' ` +
        `AND CloseDate >= ${cutoffStr} ORDER BY CloseDate DESC NULLS LAST LIMIT 300`;
      const taskSoql =
        `SELECT Id, Subject, Status, ActivityDate, Description, Owner.Name ` +
        `FROM Task WHERE WhatId = '${esc(accountId)}' ` +
        `ORDER BY ActivityDate DESC NULLS LAST LIMIT 300`;
      const eventSoql =
        `SELECT Id, Subject, ActivityDate, Description, Owner.Name ` +
        `FROM Event WHERE WhatId = '${esc(accountId)}' ` +
        `ORDER BY ActivityDate DESC NULLS LAST LIMIT 200`;

      const [oRes, tRes, eRes] = await Promise.all([
        sfFetch(`/query?q=${encodeURIComponent(oppSoql)}`).catch(() => ({ records: [] })),
        sfFetch(`/query?q=${encodeURIComponent(taskSoql)}`).catch(() => ({ records: [] })),
        sfFetch(`/query?q=${encodeURIComponent(eventSoql)}`).catch(() => ({ records: [] })),
      ]);

      for (const r of (oRes?.records ?? []) as any[]) {
        entries.push({
          id: r.Id,
          kind: "pedido",
          date: r.CloseDate ?? null,
          title: r.Name ?? "Oportunidade",
          description: null,
          status: r.StageName ?? null,
          owner: r.Owner?.Name ?? null,
          amount: Number(r.Total__c ?? r.Amount ?? 0) || 0,
          source: "salesforce",
        });
      }
      for (const r of (tRes?.records ?? []) as any[]) {
        const subject = r.Subject ?? "(sem assunto)";
        entries.push({
          id: r.Id,
          kind: classificarAtividade(`${subject} ${r.Description ?? ""}`, false),
          date: r.ActivityDate ?? null,
          title: subject,
          description: r.Description ?? null,
          status: r.Status ?? null,
          owner: r.Owner?.Name ?? null,
          amount: null,
          source: "salesforce",
        });
      }
      for (const r of (eRes?.records ?? []) as any[]) {
        const subject = r.Subject ?? "(sem assunto)";
        entries.push({
          id: r.Id,
          kind: classificarAtividade(`${subject} ${r.Description ?? ""}`, true),
          date: r.ActivityDate ?? null,
          title: subject,
          description: r.Description ?? null,
          status: null,
          owner: r.Owner?.Name ?? null,
          amount: null,
          source: "salesforce",
        });
      }
    }

    if (clienteNome) {
      const propostasDoCliente = async () => {
        try {
          const { listarPropostas } = await import("./propostas-db.server");
          const alvo = clienteNome.toLowerCase();
          const rows = await listarPropostas({
            select: "id,numero,cliente_nome,status,totais,created_at",
            limit: 1000,
          });
          return {
            data: rows
              .filter((r: any) => String(r.cliente_nome ?? "").toLowerCase().includes(alvo))
              .slice(0, 100),
          };
        } catch {
          return { data: [] as any[] };
        }
      };
      const [props, tarefas] = await Promise.all([
        propostasDoCliente(),
        context.supabase
          .from("carregadores_tarefas")
          .select("id, titulo, descricao, cliente_nome, status, due_date, created_at")
          .ilike("cliente_nome", `%${clienteNome}%`)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      for (const p of props.data ?? []) {
        const totais = (p.totais ?? {}) as Record<string, unknown>;
        const total = Number(totais["totalProposta"] ?? totais["receitaBruta"] ?? 0) || null;
        entries.push({
          id: `carregadores-prop-${p.id}`,
          kind: "pedido",
          date: p.created_at?.slice(0, 10) ?? null,
          title: `Proposta ${p.numero ?? ""}`.trim() + ` — ${p.cliente_nome}`,
          description: null,
          status: p.status ?? null,
          owner: null,
          amount: total,
          source: "carregadores",
        });
      }
      for (const t of tarefas.data ?? []) {
        const texto = `${t.titulo} ${t.descricao ?? ""}`;
        entries.push({
          id: `carregadores-task-${t.id}`,
          kind: classificarAtividade(texto, false),
          date: t.due_date ?? t.created_at?.slice(0, 10) ?? null,
          title: t.titulo,
          description: t.descricao ?? null,
          status: t.status ?? null,
          owner: null,
          amount: null,
          source: "carregadores",
        });
      }
    }

    entries.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return { entries };
  });

// ---------------------------------------------------------------------------
// Dossiê 360 do cliente: oportunidades, casos, visitas, treinamentos e crédito
// ---------------------------------------------------------------------------

export type Account360Opportunity = {
  id: string;
  name: string;
  stage: string | null;
  amount: number;
  closeDate: string | null;
  createdDate: string | null;
  isClosed: boolean;
  isWon: boolean;
  owner: string | null;
  tipoNf: string | null;
};

export type Account360Case = {
  id: string;
  number: string | null;
  subject: string;
  status: string | null;
  priority: string | null;
  type: string | null;
  origin: string | null;
  createdDate: string | null;
  closedDate: string | null;
  description: string | null;
  owner: string | null;
};

export type Account360Visita = {
  id: string;
  numero: string | null;
  date: string | null;
  status: string | null;
  motivo: string | null;
  descricao: string | null;
  planoAcao: string | null;
  contato: string | null;
  owner: string | null;
  cidade: string | null;
};

export type Account360Treinamento = {
  id: string;
  nome: string | null;
  tipo: string | null;
  date: string | null;
  observacoes: string | null;
  contato: string | null;
  owner: string | null;
};

export type Account360Credito = {
  id: string;
  nome: string | null;
  status: string | null;
  conclusao: string | null;
  restricao: string | null;
  condicaoSolicitada: string | null;
  condicaoAprovada: string | null;
  creditoSolicitado: number | null;
  creditoAprovado: number | null;
  serasa: number | null;
  prioridade: string | null;
  solicitadoEm: string | null;
  concluidoEm: string | null;
  observacoesFinanceiro: string | null;
  observacoesVendedor: string | null;
};

export type Account360 = {
  opportunities: Account360Opportunity[];
  cases: Account360Case[];
  visitas: Account360Visita[];
  treinamentos: Account360Treinamento[];
  creditos: Account360Credito[];
};

/** Tudo o que o vendedor precisa ver sobre um cliente, em uma chamada só. */
export const getSalesforceAccount360 = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId: string }) => input)
  .handler(async ({ data, context }): Promise<Account360> => {
    const accountId = String(data.accountId ?? "").trim();
    if (!validId(accountId)) throw new Error("accountId inválido");
    await assertAccountAccess(context.supabase, context.userId, accountId);
    const id = esc(accountId);

    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 3);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const soqlOpp =
      `SELECT Id, Name, StageName, Amount, Total__c, CloseDate, CreatedDate, IsClosed, IsWon, ` +
      `Tipo_de_NF__c, Owner.Name FROM Opportunity WHERE AccountId = '${id}' ` +
      `AND CloseDate >= ${cutoffStr} ORDER BY CloseDate DESC NULLS LAST LIMIT 500`;
    const soqlCase =
      `SELECT Id, CaseNumber, Subject, Status, Priority, Type, Origin, CreatedDate, ClosedDate, ` +
      `Description, Owner.Name FROM Case WHERE AccountId = '${id}' ` +
      `ORDER BY CreatedDate DESC LIMIT 200`;
    const soqlVisita =
      `SELECT Id, N_da_Visita__c, Data_da_Visita__c, Status_da_Visita__c, Motivo_da_Visita__c, ` +
      `Descri_o_da_Visita__c, Plano_de_Acao__c, Contato__r.Name, Owner.Name, Destino__City__s ` +
      `FROM Visita__c WHERE Conta__c = '${id}' ORDER BY Data_da_Visita__c DESC NULLS LAST LIMIT 200`;
    const soqlTrein =
      `SELECT Id, Name, Tipo__c, Data_do_Treinamento__c, Observacoes_do_Treinamento__c, ` +
      `Contato__r.Name, Owner.Name FROM Treinamento__c WHERE Conta__c = '${id}' ` +
      `ORDER BY Data_do_Treinamento__c DESC NULLS LAST LIMIT 200`;
    const soqlCredito =
      `SELECT Id, Name, Status_da_Analise__c, Conclusao__c, Restricao__c, Condicao_Solicitada__c, ` +
      `Condicao_Aprovada__c, Credito_Solicitado_R__c, Credito_Aprovado_R__c, Pontuacao_no_Serasa__c, ` +
      `Prioridade__c, Solicitacao__c, Concluido__c, Observacoes_do_Financeiro__c, ` +
      `Observacoes_do_Vendedor__c FROM Analise_de_Credito__c WHERE Conta__c = '${id}' ` +
      `ORDER BY CreatedDate DESC LIMIT 100`;

    const run = (soql: string) =>
      sfFetch(`/query?q=${encodeURIComponent(soql)}`).catch(() => ({ records: [] }));

    const [oRes, cRes, vRes, tRes, crRes] = await Promise.all([
      run(soqlOpp),
      run(soqlCase),
      run(soqlVisita),
      run(soqlTrein),
      run(soqlCredito),
    ]);

    const numOrNull = (v: any) => (typeof v === "number" ? v : null);

    return {
      opportunities: ((oRes?.records ?? []) as any[]).map((r) => ({
        id: r.Id,
        name: r.Name ?? "Oportunidade",
        stage: r.StageName ?? null,
        amount: Number(r.Total__c ?? r.Amount ?? 0) || 0,
        closeDate: r.CloseDate ?? null,
        createdDate: r.CreatedDate ?? null,
        isClosed: Boolean(r.IsClosed),
        isWon: Boolean(r.IsWon),
        owner: r.Owner?.Name ?? null,
        tipoNf: r.Tipo_de_NF__c ?? null,
      })),
      cases: ((cRes?.records ?? []) as any[]).map((r) => ({
        id: r.Id,
        number: r.CaseNumber ?? null,
        subject: r.Subject ?? "(sem assunto)",
        status: r.Status ?? null,
        priority: r.Priority ?? null,
        type: r.Type ?? null,
        origin: r.Origin ?? null,
        createdDate: r.CreatedDate ?? null,
        closedDate: r.ClosedDate ?? null,
        description: r.Description ?? null,
        owner: r.Owner?.Name ?? null,
      })),
      visitas: ((vRes?.records ?? []) as any[]).map((r) => ({
        id: r.Id,
        numero: r.N_da_Visita__c ?? null,
        date: r.Data_da_Visita__c ?? null,
        status: r.Status_da_Visita__c ?? null,
        motivo: r.Motivo_da_Visita__c ?? null,
        descricao: r.Descri_o_da_Visita__c ?? null,
        planoAcao: r.Plano_de_Acao__c ?? null,
        contato: r.Contato__r?.Name ?? null,
        owner: r.Owner?.Name ?? null,
        cidade: r.Destino__City__s ?? null,
      })),
      treinamentos: ((tRes?.records ?? []) as any[]).map((r) => ({
        id: r.Id,
        nome: r.Name ?? null,
        tipo: r.Tipo__c ?? null,
        date: r.Data_do_Treinamento__c ?? null,
        observacoes: r.Observacoes_do_Treinamento__c ?? null,
        contato: r.Contato__r?.Name ?? null,
        owner: r.Owner?.Name ?? null,
      })),
      creditos: ((crRes?.records ?? []) as any[]).map((r) => ({
        id: r.Id,
        nome: r.Name ?? null,
        status: r.Status_da_Analise__c ?? null,
        conclusao: r.Conclusao__c ?? null,
        restricao: r.Restricao__c ?? null,
        condicaoSolicitada: r.Condicao_Solicitada__c ?? null,
        condicaoAprovada: r.Condicao_Aprovada__c ?? null,
        creditoSolicitado: numOrNull(r.Credito_Solicitado_R__c),
        creditoAprovado: numOrNull(r.Credito_Aprovado_R__c),
        serasa: numOrNull(r.Pontuacao_no_Serasa__c),
        prioridade: r.Prioridade__c ?? null,
        solicitadoEm: r.Solicitacao__c ?? null,
        concluidoEm: r.Concluido__c ?? null,
        observacoesFinanceiro: r.Observacoes_do_Financeiro__c ?? null,
        observacoesVendedor: r.Observacoes_do_Vendedor__c ?? null,
      })),
    };
  });
