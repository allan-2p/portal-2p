/**
 * Dossiê 360 — histórico do cliente lido do banco do Grupo 2P.
 *
 * A fonte é a tabela `propostas` (que já contém tanto as propostas criadas no
 * portal quanto as oportunidades importadas do Salesforce, nas colunas
 * `sfo_*`). Nada aqui chama a API do Salesforce.
 */
import { grupo2pRest } from "./grupo2p-db.server";
import { stage as stagePorStatus } from "./salesforce-stage";

export type DossieInstance = "solar" | "carregadores";

export type DossieNegocio = {
  id: string;
  numero: string | null;
  name: string;
  stage: string | null;
  status: string | null;
  amount: number;
  closeDate: string | null;
  createdDate: string | null;
  isClosed: boolean;
  isWon: boolean;
  owner: string | null;
  tipoNf: string | null;
  numeroSap: string | null;
  origem: "portal" | "importado";
};

export type DossieQuarter = {
  key: string;
  year: number;
  quarter: number;
  label: string;
  total: number;
  count: number;
};

export type DossieStage = { stage: string; count: number; total: number };

export type DossieHistorico = {
  quarters: DossieQuarter[];
  stages: DossieStage[];
  totalLifetime: number;
  totalCount: number;
  avgTicket: number;
  openCount: number;
  openValue: number;
  lostCount: number;
  lastPurchase: string | null;
  firstPurchase: string | null;
  wonRate: number;
};

export type DossieCliente = { historico: DossieHistorico; negocios: DossieNegocio[] };

const COLS = [
  "id",
  "numero",
  "numero_sap",
  "nome",
  "status",
  "organizacao",
  "totais",
  "tipo_nf",
  "consultor_nome",
  "criado_por_nome",
  "created_at",
  "previsao_fechamento",
  "faturado_em",
  "cancelado_em",
  "entregue_em",
  "sap_ov_numero",
  "sfo_name",
  "sfo_stage_name",
  "sfo_amount",
  "sfo_total__c",
  "sfo_close_date",
  "sfo_created_date",
  "sfo_is_closed",
  "sfo_is_won",
  "sfo_tipo_de_nf__c",
  "sfo_vendedor__c",
  "sfo_account_id",
].join(",");

const ORG_DA_INSTANCIA: Record<DossieInstance, string[]> = {
  solar: ["solar", "2P Solar", "Acessórios 2P"],
  carregadores: ["carregadores", "2P Carregadores"],
};

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};

const dia = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, 10) : null;
};

function ehGanho(stage: string) {
  return stage === "Pedido Concluído";
}
function ehPerdido(stage: string) {
  return /perd|cancel/i.test(stage);
}

function quartersVazios(): DossieQuarter[] {
  const now = new Date();
  const curY = now.getUTCFullYear();
  const curQ = Math.floor(now.getUTCMonth() / 3) + 1;
  const out: DossieQuarter[] = [];
  for (let i = 7; i >= 0; i--) {
    let y = curY;
    let q = curQ - i;
    while (q <= 0) {
      q += 4;
      y -= 1;
    }
    out.push({ key: `${y}-Q${q}`, year: y, quarter: q, label: `Q${q}/${String(y).slice(-2)}`, total: 0, count: 0 });
  }
  return out;
}

/** Propostas/pedidos do cliente, do banco do Grupo 2P. */
export async function carregarNegociosCliente(opts: {
  instancia: DossieInstance;
  sfAccountId?: string | null;
  doc?: string | null;
}): Promise<DossieNegocio[]> {
  const alvos: string[] = [];
  const sf = String(opts.sfAccountId ?? "").trim();
  const doc = String(opts.doc ?? "").replace(/\D/g, "");
  if (sf) alvos.push(`sf_account_id.eq.${sf}`, `sfo_account_id.eq.${sf}`);
  if (doc) alvos.push(`cliente_doc.eq.${doc}`);
  if (alvos.length === 0) return [];

  const params = new URLSearchParams({
    select: COLS,
    or: `(${alvos.join(",")})`,
    order: "created_at.desc",
  });
  const orgs = ORG_DA_INSTANCIA[opts.instancia];
  params.set("organizacao", `in.(${orgs.map((o) => `"${o}"`).join(",")})`);

  const rows: Record<string, any>[] = [];
  for (let from = 0; from < 5000; from += 1000) {
    const { ok, status, text } = await grupo2pRest(`propostas?${params}`, {
      range: { from, to: from + 999 },
    });
    if (!ok) {
      if (status === 416) break;
      throw new Error(`Erro no banco (${status}): ${text.slice(0, 300)}`);
    }
    const lote = (JSON.parse(text || "[]") ?? []) as Record<string, any>[];
    rows.push(...lote);
    if (lote.length < 1000) break;
  }

  return rows.map((r) => {
    const importado = Boolean(r["sfo_account_id"]);
    const totais = (r["totais"] ?? {}) as Record<string, any>;
    const amount =
      num(r["sfo_total__c"]) ||
      num(r["sfo_amount"]) ||
      num(totais["valorTotal"]) ||
      num(totais["total"]) ||
      0;
    const stage = String(r["sfo_stage_name"] ?? "").trim() || stagePorStatus(r["status"]);
    const closeDate =
      dia(r["sfo_close_date"]) ??
      dia(r["faturado_em"]) ??
      dia(r["entregue_em"]) ??
      dia(r["cancelado_em"]) ??
      dia(r["previsao_fechamento"]) ??
      dia(r["created_at"]);
    return {
      id: String(r["id"]),
      numero: r["numero"] != null ? String(r["numero"]) : null,
      name: String(r["nome"] ?? r["sfo_name"] ?? `Proposta ${r["numero"] ?? ""}`).trim() || "Proposta",
      stage,
      status: (r["status"] as string | null) ?? null,
      amount,
      closeDate,
      createdDate: dia(r["created_at"]) ?? dia(r["sfo_created_date"]),
      isClosed: r["sfo_is_closed"] != null ? Boolean(r["sfo_is_closed"]) : ehGanho(stage) || ehPerdido(stage),
      isWon: r["sfo_is_won"] != null ? Boolean(r["sfo_is_won"]) : ehGanho(stage),
      owner: (r["consultor_nome"] as string | null) ?? (r["sfo_vendedor__c"] as string | null) ?? (r["criado_por_nome"] as string | null) ?? null,
      tipoNf: (r["tipo_nf"] as string | null) ?? (r["sfo_tipo_de_nf__c"] as string | null) ?? null,
      numeroSap: (r["sap_ov_numero"] as string | null) ?? (r["numero_sap"] as string | null) ?? null,
      origem: importado ? "importado" : "portal",
    } satisfies DossieNegocio;
  });
}

/** Agrega o histórico (trimestres, estágios, ticket médio) a partir dos negócios. */
export function agregarHistorico(negocios: DossieNegocio[]): DossieHistorico {
  const quarters = quartersVazios();
  const qIndex = new Map(quarters.map((q, i) => [q.key, i] as const));
  const stageMap = new Map<string, DossieStage>();

  let totalLifetime = 0;
  let totalCount = 0;
  let openCount = 0;
  let openValue = 0;
  let lostCount = 0;
  let lastPurchase: string | null = null;
  let firstPurchase: string | null = null;

  for (const n of negocios) {
    if ((n.tipoNf ?? "").toLowerCase().includes("bonifica")) continue;
    const stage = n.stage ?? "—";
    const s = stageMap.get(stage) ?? { stage, count: 0, total: 0 };
    s.count += 1;
    s.total += n.amount;
    stageMap.set(stage, s);

    if (ehGanho(stage)) {
      totalLifetime += n.amount;
      totalCount += 1;
      if (n.closeDate) {
        if (!lastPurchase || n.closeDate > lastPurchase) lastPurchase = n.closeDate;
        if (!firstPurchase || n.closeDate < firstPurchase) firstPurchase = n.closeDate;
        const d = new Date(`${n.closeDate}T12:00:00Z`);
        const idx = qIndex.get(`${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`);
        if (idx != null) {
          quarters[idx].total += n.amount;
          quarters[idx].count += 1;
        }
      }
    } else if (ehPerdido(stage)) {
      lostCount += 1;
    } else {
      openCount += 1;
      openValue += n.amount;
    }
  }

  const decided = totalCount + lostCount;
  return {
    quarters,
    stages: [...stageMap.values()].sort((a, b) => b.total - a.total),
    totalLifetime,
    totalCount,
    avgTicket: totalCount ? totalLifetime / totalCount : 0,
    openCount,
    openValue,
    lostCount,
    lastPurchase,
    firstPurchase,
    wonRate: decided ? totalCount / decided : 0,
  };
}

export async function carregarDossieCliente(opts: {
  instancia: DossieInstance;
  sfAccountId?: string | null;
  doc?: string | null;
}): Promise<DossieCliente> {
  const negocios = await carregarNegociosCliente(opts);
  return { negocios, historico: agregarHistorico(negocios) };
}
