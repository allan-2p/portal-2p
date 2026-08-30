/**
 * Camada de dados do Atlas (chat e radar de alertas).
 *
 * Tudo aqui já respeita o escopo do usuário: consultor enxerga só a carteira
 * dele; quem tem "View All Records" (admin/diretor) enxerga tudo. O banco do
 * Grupo 2P é acessado com service role, então o filtro é aplicado em código.
 */
import { escopoDoConsultor, registroNoEscopo, type EscopoDono } from "./escopo-consultor.server";
import { getPerm } from "./object-perms.server";
import { listarPropostas } from "./propostas-db.server";
import { grupo2pRest } from "./grupo2p-db.server";
import { docCanonico } from "./cnpj";

export type Instancia = "solar" | "carregadores";
export const INSTANCIAS: Instancia[] = ["solar", "carregadores"];

export type Ctx = { supabase: any; userId: string };

export type ClienteAtlas = {
  id: string;
  nome: string;
  doc: string;
  instancia: string;
  cidade: string | null;
  uf: string | null;
  consultor_nome: string | null;
  consultor_id: string | null;
  sf_account_id: string | null;
  numero_sap: string | null;
};

export type PropostaAtlas = {
  id: string;
  numero: string | null;
  status: string | null;
  organizacao: string | null;
  cliente_doc: string | null;
  cliente_nome: string | null;
  consultor_id: string | null;
  consultor_nome: string | null;
  created_by: string | null;
  sap_vendedor_codigo: string | null;
  created_at: string | null;
  valor: number;
};

const CAMPOS_PROPOSTA =
  "id,numero,status,organizacao,cliente_doc,cliente_nome,consultor_id,consultor_nome,created_by,sap_vendedor_codigo,created_at,totais";

/** Valor do pedido: usa o total com impostos quando existir. */
export function valorProposta(row: Record<string, any>): number {
  const t = (row?.["totais"] ?? {}) as Record<string, unknown>;
  const n = Number(t["valorTotal"] ?? t["valor"] ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Pedidos que contam como faturamento gerado (exclui salvos e cancelados). */
export const STATUS_GERACAO = [
  "Aguardando Pagamento",
  "Processando",
  "Separação",
  "Faturado",
  "Coletado",
  "Entregue",
];

export type EscopoAtlas = {
  verTudo: boolean;
  porInstancia: Record<Instancia, EscopoDono>;
};

/** Escopo do usuário nas duas unidades (uma consulta por unidade). */
export async function escopoAtlas(ctx: Ctx): Promise<EscopoAtlas> {
  const porInstancia = {} as Record<Instancia, EscopoDono>;
  let verTudo = true;
  for (const inst of INSTANCIAS) {
    const perm = await getPerm(ctx as any, inst, "propostas");
    porInstancia[inst] = await escopoDoConsultor(ctx as any, inst, perm);
    if (porInstancia[inst].userId) verTudo = false;
  }
  return { verTudo, porInstancia };
}

function noEscopo(row: Record<string, any>, escopo: EscopoAtlas): boolean {
  const inst = (String(row["organizacao"] ?? "solar") as Instancia) ?? "solar";
  const alvo = escopo.porInstancia[inst] ?? escopo.porInstancia["solar"];
  return registroNoEscopo(row, alvo);
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

function mapCliente(r: Record<string, any>): ClienteAtlas {
  return {
    id: String(r["id"]),
    nome: String(r["razao_social"] ?? r["nome_fantasia"] ?? "(sem nome)"),
    doc: docCanonico(String(r["doc"] ?? "")),
    instancia: String(r["instancia"] ?? r["organizacao"] ?? ""),
    cidade: r["cidade"] ?? null,
    uf: r["uf"] ?? null,
    consultor_nome: r["consultor_nome"] ?? null,
    consultor_id: r["consultor_id"] ?? null,
    sf_account_id: r["sf_account_id"] ?? null,
    numero_sap: r["numero_sap"] ?? null,
  };
}

async function clientesRest(params: URLSearchParams, limite: number): Promise<ClienteAtlas[]> {
  const { ok, text } = await grupo2pRest(`clientes?${params}`, {
    range: { from: 0, to: Math.max(limite - 1, 0) },
  });
  if (!ok) return [];
  const rows: Record<string, any>[] = text ? JSON.parse(text) : [];
  return rows.map(mapCliente);
}

/** Busca clientes por nome, documento ou código SAP (respeitando o escopo). */
export async function buscarClientes(
  ctx: Ctx,
  opts: { termo?: string; limite?: number } = {},
): Promise<ClienteAtlas[]> {
  const escopo = await escopoAtlas(ctx);
  const limite = Math.min(Math.max(opts.limite ?? 10, 1), 50);
  const termo = (opts.termo ?? "").replace(/[(),*]/g, " ").trim();

  const params = new URLSearchParams({
    select:
      "id,razao_social,nome_fantasia,doc,cidade,uf,instancia,organizacao,consultor_nome,consultor_id,sf_account_id,numero_sap,created_by,consultor_sap",
    order: "razao_social.asc.nullslast",
  });
  const grupos: string[] = [];
  if (termo) {
    const digitos = termo.replace(/\D/g, "");
    const alvos = [
      `razao_social.ilike.*${termo}*`,
      `nome_fantasia.ilike.*${termo}*`,
      `cidade.ilike.*${termo}*`,
    ];
    if (digitos.length >= 3) {
      alvos.push(`doc.ilike.*${digitos}*`);
      alvos.push(`numero_sap.ilike.*${digitos}*`);
    }
    grupos.push(`or(${alvos.join(",")})`);
  }
  if (grupos.length) params.set("and", `(${grupos.join(",")})`);

  const rows = await clientesRest(params, limite * 4);
  if (escopo.verTudo) return rows.slice(0, limite);
  const docs = new Set(
    INSTANCIAS.flatMap((i) => escopo.porInstancia[i].docs ?? []).map((d) => docCanonico(d)),
  );
  return rows.filter((c) => docs.has(c.doc) || c.consultor_id === ctx.userId).slice(0, limite);
}

/** Cadastro do cliente por documento (qualquer unidade). */
export async function clientePorDoc(doc: string): Promise<ClienteAtlas | null> {
  const d = docCanonico(doc);
  if (!d) return null;
  const params = new URLSearchParams({
    select:
      "id,razao_social,nome_fantasia,doc,cidade,uf,instancia,organizacao,consultor_nome,consultor_id,sf_account_id,numero_sap",
    doc: `ilike.*${d}*`,
    limit: "5",
  });
  const rows = await clientesRest(params, 5);
  return rows.find((r) => r.doc === d) ?? rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Propostas / pedidos
// ---------------------------------------------------------------------------

export type FiltroPropostas = {
  inicio?: string | null;
  fim?: string | null;
  organizacao?: Instancia | null;
  clienteDoc?: string | null;
  somenteGeracao?: boolean;
};

/** Pedidos do período dentro do escopo do usuário. */
export async function propostasNoEscopo(
  ctx: Ctx,
  filtro: FiltroPropostas = {},
): Promise<PropostaAtlas[]> {
  const escopo = await escopoAtlas(ctx);
  return propostasComEscopo(escopo, filtro);
}

/** Mesma consulta, reaproveitando um escopo já calculado (usado pelo radar). */
export async function propostasComEscopo(
  escopo: EscopoAtlas,
  filtro: FiltroPropostas = {},
): Promise<PropostaAtlas[]> {
  const rows = await listarPropostas({
    select: CAMPOS_PROPOSTA,
    organizacao: filtro.organizacao ?? undefined,
    statusIn: filtro.somenteGeracao ? STATUS_GERACAO : undefined,
    limit: 20000,
  });
  const doc = filtro.clienteDoc ? docCanonico(filtro.clienteDoc) : null;
  const inicio = filtro.inicio ? Date.parse(filtro.inicio) : null;
  const fim = filtro.fim ? Date.parse(`${filtro.fim}T23:59:59`) : null;

  return (rows as Record<string, any>[])
    .filter((r) => noEscopo(r, escopo))
    .filter((r) => !doc || docCanonico(String(r["cliente_doc"] ?? "")) === doc)
    .filter((r) => {
      const t = r["created_at"] ? Date.parse(String(r["created_at"])) : null;
      if (t === null) return !inicio && !fim;
      if (inicio && t < inicio) return false;
      if (fim && t > fim) return false;
      return true;
    })
    .map((r) => ({
      id: String(r["id"]),
      numero: r["numero"] ?? null,
      status: r["status"] ?? null,
      organizacao: r["organizacao"] ?? null,
      cliente_doc: r["cliente_doc"] ? docCanonico(String(r["cliente_doc"])) : null,
      cliente_nome: r["cliente_nome"] ?? null,
      consultor_id: r["consultor_id"] ?? null,
      consultor_nome: r["consultor_nome"] ?? null,
      created_by: r["created_by"] ?? null,
      sap_vendedor_codigo: r["sap_vendedor_codigo"] ?? null,
      created_at: r["created_at"] ?? null,
      valor: valorProposta(r),
    }));
}

export type ResumoPeriodo = {
  pedidos: number;
  valor: number;
  ticketMedio: number;
  porStatus: Record<string, { pedidos: number; valor: number }>;
};

export function resumirPeriodo(rows: PropostaAtlas[]): ResumoPeriodo {
  const gerados = rows.filter((r) => STATUS_GERACAO.includes(String(r.status)));
  const valor = gerados.reduce((s, r) => s + r.valor, 0);
  const porStatus: ResumoPeriodo["porStatus"] = {};
  for (const r of rows) {
    const k = String(r.status ?? "—");
    porStatus[k] ??= { pedidos: 0, valor: 0 };
    porStatus[k].pedidos += 1;
    porStatus[k].valor += r.valor;
  }
  return {
    pedidos: gerados.length,
    valor,
    ticketMedio: gerados.length ? valor / gerados.length : 0,
    porStatus,
  };
}

// ---------------------------------------------------------------------------
// Metas do consultor (banco do portal)
// ---------------------------------------------------------------------------

export type MetaConsultor = { mes: number; ano: number; meta: number };

/** Meta mensal de faturamento do consultor (public.salesperson_goals). */
export async function metasDoUsuario(
  ctx: Ctx,
  sfUserId: string | null,
  ano: number,
): Promise<MetaConsultor[]> {
  if (!sfUserId) return [];
  const { data } = await ctx.supabase
    .from("salesperson_goals")
    .select("year, month, monthly_goal")
    .eq("sf_user_id", sfUserId)
    .eq("year", ano);
  return ((data ?? []) as any[]).map((r) => ({
    ano: Number(r.year),
    mes: Number(r.month),
    meta: Number(r.monthly_goal ?? 0),
  }));
}

/** Perfil do usuário atual (nome, sf_user_id, SAP). */
export async function perfilDoUsuario(ctx: Ctx): Promise<Record<string, any> | null> {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("id, full_name, email, sf_user_id, numero_sap, meta_mensal, organizacao")
    .eq("id", ctx.userId)
    .maybeSingle();
  return (data as any) ?? null;
}

export function periodoPadrao(dias = 90): { inicio: string; fim: string } {
  const fim = new Date();
  const inicio = new Date(fim.getTime() - dias * 24 * 60 * 60 * 1000);
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

/** Mapa documento → Id da conta no Salesforce (para cruzar visitas/tarefas). */
export async function mapaSfPorDoc(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (let pagina = 0; pagina < 20; pagina++) {
    const params = new URLSearchParams({
      select: "doc,sf_account_id",
      sf_account_id: "not.is.null",
      order: "id.asc",
    });
    const from = pagina * 1000;
    const { ok, text } = await grupo2pRest(`clientes?${params}`, {
      range: { from, to: from + 999 },
    });
    if (!ok) break;
    const rows: Array<{ doc?: string; sf_account_id?: string }> = text ? JSON.parse(text) : [];
    for (const r of rows) {
      const d = docCanonico(String(r.doc ?? ""));
      if (d && r.sf_account_id) mapa.set(d, String(r.sf_account_id));
    }
    if (rows.length < 1000) break;
  }
  return mapa;
}
