// Acesso à tabela universal `propostas` no banco do Grupo 2P.
// As unidades (Solar e Carregadores) compartilham a mesma tabela e são
// separadas pela coluna `organizacao`.

import { grupo2pRest } from "./grupo2p-db.server";

export type PropostaRow = Record<string, any> & { id: string };

export class PropostasTableMissing extends Error {
  constructor() {
    super(
      'A tabela "propostas" ainda não existe no banco do Grupo 2P. Rode o script supabase/external/propostas.sql.',
    );
    this.name = "PropostasTableMissing";
  }
}

async function rest(
  path: string,
  init: RequestInit & { prefer?: string; range?: { from: number; to: number } } = {},
): Promise<any> {
  const { ok, status, text } = await grupo2pRest(path, init);
  if (!ok) {
    // Só é "tabela ausente" quando o PostgREST não encontra a relação.
    // Coluna inexistente (42703) é outro problema e precisa aparecer como tal.
    if (status === 404 || /PGRST205/i.test(text) || /relation .*propostas.* does not exist/i.test(text)) {
      throw new PropostasTableMissing();
    }
    const err = new Error(`Erro no banco (${status}): ${text.slice(0, 300)}`) as Error & {
      status?: number;
      body?: string;
    };
    err.status = status;
    err.body = text;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

export type ListarPropostasOpts = {
  organizacao?: string;
  select?: string;
  statusIn?: string[];
  limit?: number;
  /** Ordenação por created_at (default desc). */
  order?: "asc" | "desc";
  /** Colunas que precisam estar preenchidas (filtro no banco, não em memória). */
  naoVazio?: string[];
};

/** Teto de linhas por resposta do PostgREST. */
const PAGINA_DB = 1000;

export async function listarPropostas(opts: ListarPropostasOpts = {}): Promise<PropostaRow[]> {
  const params = new URLSearchParams({
    select: opts.select ?? "*",
    order: `created_at.${opts.order ?? "desc"},id.asc`,
  });
  if (opts.organizacao) params.set("organizacao", `eq.${opts.organizacao}`);
  if (opts.statusIn?.length) params.set("status", `in.(${opts.statusIn.map((s) => `"${s}"`).join(",")})`);
  for (const col of opts.naoVazio ?? []) params.append(col, "not.is.null");

  // Busca em blocos: o PostgREST corta a resposta em 1000 linhas mesmo com
  // `limit` maior, então quem precisa da lista completa pagina por Range.
  const teto = opts.limit ?? 20000;
  const out: PropostaRow[] = [];
  for (let pagina = 0; pagina < 40 && out.length < teto; pagina++) {
    const from = pagina * PAGINA_DB;
    const bloco: PropostaRow[] =
      (await rest(`propostas?${params}`, { range: { from, to: from + PAGINA_DB - 1 } })) ?? [];
    out.push(...bloco);
    if (bloco.length < PAGINA_DB) break;
  }
  return out.slice(0, teto);
}

export type ListarPropostasPaginaOpts = {
  organizacao?: string;
  select?: string;
  /** Texto livre: número, nº anterior, cliente, documento, OV/nº SAP, consultor. */
  q?: string;
  status?: string;
  uf?: string;
  /** "com" | "sem" — pedidos com ou sem ordem de venda no SAP. */
  comSap?: string;
  /** Restringe a um conjunto de vendedores (coluna created_by). */
  createdByIn?: string[];
  /** Restringe às propostas do usuário (sem "View All Records"). */
  donoId?: string | null;
  pagina?: number;
  porPagina?: number;
};

const COLUNAS_BUSCA_PROPOSTA = [
  "numero",
  "cliente_nome",
  "cliente_doc",
  "nome",
  "sap_ov_numero",
  "numero_sap",
  "consultor_nome",
  "criado_por_nome",
  "totais->>numeroAnterior",
];

const termoSeguro = (t: string) => t.replace(/[(),*"\\]/g, " ").trim();

/**
 * Página de propostas com busca no banco: a pesquisa alcança a base inteira
 * (inclusive as importadas da plataforma antiga), e a ordenação é sempre da
 * mais recente para a mais antiga.
 */
export async function listarPropostasPagina(
  opts: ListarPropostasPaginaOpts = {},
): Promise<{ rows: PropostaRow[]; total: number }> {
  const porPagina = Math.min(Math.max(opts.porPagina ?? 25, 1), 200);
  const pagina = Math.max(opts.pagina ?? 1, 1);
  const params = new URLSearchParams({
    select: opts.select ?? "*",
    order: "created_at.desc.nullslast,id.asc",
  });
  if (opts.organizacao) params.set("organizacao", `eq.${opts.organizacao}`);
  if (opts.status && opts.status !== "todos") params.set("status", `eq.${opts.status}`);
  if (opts.uf && opts.uf !== "todos") params.set("uf", `eq.${opts.uf}`);
  if (opts.donoId) params.set("created_by", `eq.${opts.donoId}`);
  else if (opts.createdByIn?.length) {
    params.set("created_by", `in.(${opts.createdByIn.join(",")})`);
  }

  // Condições compostas vão juntas em `and=(...)`: o PostgREST aceita só um
  // parâmetro `or` por consulta.
  const cond: string[] = [];
  const termo = termoSeguro(opts.q ?? "");
  if (termo) cond.push(`or(${COLUNAS_BUSCA_PROPOSTA.map((c) => `${c}.ilike.*${termo}*`).join(",")})`);
  if (opts.comSap === "com") cond.push("or(sap_ov_numero.not.is.null,numero_sap.not.is.null)");
  if (opts.comSap === "sem") cond.push("and(sap_ov_numero.is.null,numero_sap.is.null)");
  if (cond.length) params.set("and", `(${cond.join(",")})`);

  const from = (pagina - 1) * porPagina;
  const { ok, status, text, total } = await grupo2pRest(`propostas?${params}`, {
    range: { from, to: from + porPagina - 1 },
    count: true,
  });
  if (!ok) {
    if (status === 416) return { rows: [], total: total ?? 0 };
    throw new Error(`Erro no banco (${status}): ${text.slice(0, 300)}`);
  }
  const rows: PropostaRow[] = text ? JSON.parse(text) : [];
  return { rows, total: total ?? rows.length };
}

/**
 * Consulta livre na tabela `propostas` do Grupo 2P (filtros PostgREST crus).
 * Use sempre isto — `supabaseAdmin.from("propostas")` aponta para o banco do
 * portal, onde a tabela é legado e está vazia.
 */
export async function consultarPropostas(
  filtros: Record<string, string>,
  opts: { select?: string; order?: string; limit?: number } = {},
): Promise<PropostaRow[]> {
  const params = new URLSearchParams({
    select: opts.select ?? "*",
    limit: String(opts.limit ?? 200),
  });
  if (opts.order) params.set("order", opts.order);
  for (const [k, v] of Object.entries(filtros)) params.append(k, v);
  return (await rest(`propostas?${params}`)) ?? [];
}


export async function getProposta(id: string, select = "*"): Promise<PropostaRow | null> {
  const params = new URLSearchParams({ select, id: `eq.${id}`, limit: "1" });
  const rows = (await rest(`propostas?${params}`)) ?? [];
  return rows[0] ?? null;
}

export async function getPropostaPorNumero(numero: string): Promise<PropostaRow | null> {
  const params = new URLSearchParams({ select: "*", numero: `eq.${numero}`, limit: "1" });
  const rows = (await rest(`propostas?${params}`)) ?? [];
  return rows[0] ?? null;
}

export async function inserirProposta(payload: Record<string, unknown>): Promise<PropostaRow> {
  const rows = await rest(`propostas`, {
    method: "POST",
    body: JSON.stringify(payload),
    prefer: "return=representation",
  });
  return rows?.[0];
}

export async function atualizarProposta(
  id: string,
  patch: Record<string, unknown>,
  extraFilter?: Record<string, string>,
): Promise<PropostaRow | null> {
  const params = new URLSearchParams({ id: `eq.${id}` });
  for (const [k, v] of Object.entries(extraFilter ?? {})) params.set(k, v);
  const rows = await rest(`propostas?${params}`, {
    method: "PATCH",
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    prefer: "return=representation",
  });
  return rows?.[0] ?? null;
}

export async function excluirProposta(id: string): Promise<void> {
  await rest(`propostas?id=eq.${id}`, { method: "DELETE" });
}

/**
 * Nº da proposta (NROPED): inteiro puro, SEM zeros à esquerda, e é o próprio
 * número enviado ao SAP. Faixa nativa do portal começa em 60001; a sequence
 * `propostas_numero_seq` do banco está em 60026 (próximo = 60027).
 */
export const NUMERO_PROPOSTA_INICIAL = 60027;

/** Faixa ocupada pelos pedidos da plataforma antiga no SAP (não puxa a sequence). */
export const NUMERO_LEGADO_MAX = 53059;

/**
 * Próximo número de pedido (NROPED). Sai da sequence do Postgres no banco do
 * Grupo 2P (`public.proximo_numero_proposta` → `propostas_numero_seq`):
 * monotônica, nunca reutilizada e à prova de concorrência.
 *
 * O fallback por `max(numero)+1` é degradado (pode repetir número) e existe só
 * para não travar o portal caso a função não responda.
 */
export async function proximoNumeroProposta(organizacao = "carregadores"): Promise<string> {
  const puro = (v: unknown) => String(v ?? "").trim().replace(/^0+(?=\d)/, "");
  try {
    const out = await rest(`rpc/proximo_numero_proposta`, {
      method: "POST",
      body: JSON.stringify({ p_organizacao: organizacao }),
    });
    const numero = puro(typeof out === "string" ? out : (out?.numero ?? out ?? ""));
    if (/^\d+$/.test(numero)) return numero;
  } catch {
    /* sequence indisponível — cai no fallback */
  }

  // Fallback GLOBAL: maior número de TODAS as unidades (a tabela é compartilhada).
  // A comparação é numérica: `numero` é texto e ordenar texto erraria a faixa.
  const params = new URLSearchParams({
    select: "numero",
    numero: "not.is.null",
    order: "created_at.desc",
    limit: "500",
  });
  const rows = (await rest(`propostas?${params}`)) ?? [];
  const atual = rows.reduce((max: number, r: any) => {
    const n = Number(puro(r?.numero).replace(/\D/g, "")) || 0;
    // Números da plataforma antiga não puxam a sequence.
    return n > NUMERO_LEGADO_MAX ? Math.max(max, n) : max;
  }, 0);
  return String(Math.max(atual + 1, NUMERO_PROPOSTA_INICIAL));
}




// --------------------------------------------------------------------------
// Log de conclusão
// --------------------------------------------------------------------------

export type ConclusaoLogInput = {
  proposta_id?: string | null;
  numero?: string | null;
  status?: string | null;
  resultado: string;
  origem?: string;
  actor_id?: string | null;
  actor_email?: string | null;
  actor_nome?: string | null;
  detalhe?: string | null;
};

export async function registrarConclusaoLog(input: ConclusaoLogInput): Promise<void> {
  try {
    await rest(`propostas_conclusao_log`, {
      method: "POST",
      body: JSON.stringify({ origem: "portal", ...input }),
      prefer: "return=minimal",
    });
  } catch {
    // auditoria nunca deve quebrar o fluxo
  }
}

export async function listarConclusaoLog(limit = 100): Promise<Record<string, any>[]> {
  const params = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: String(limit),
  });
  return (await rest(`propostas_conclusao_log?${params}`)) ?? [];
}

// --------------------------------------------------------------------------
// Pagamentos (Pix / boleto)
// --------------------------------------------------------------------------

/** Busca a proposta pelo txid da cobrança Pix gravado no pedido. */
export async function listarPropostasPorPagamentoTxid(txid: string): Promise<PropostaRow | null> {
  const params = new URLSearchParams({ select: "*", pagamento_txid: `eq.${txid}`, limit: "1" });
  try {
    const rows = (await rest(`propostas?${params}`)) ?? [];
    return rows[0] ?? null;
  } catch (e) {
    // Enquanto as colunas de pagamento não existirem, cai no fallback por número.
    if (/pagamento_txid|42703|PGRST204/i.test((e as Error).message)) return null;
    throw e;
  }
}

export type PagamentoResumoRow = {
  id: string;
  numero: string | null;
  cliente_nome: string | null;
  status: string | null;
  created_by: string | null;
  pagamento_meio: string | null;
  pagamento_status: string | null;
  pagamento_txid: string | null;
  pagamento_vencimento: string | null;
  pagamento_atualizado_em: string | null;
  pago_em: string | null;
};

const PAGAMENTO_SELECT =
  "id,numero,cliente_nome,status,created_by,pagamento_meio,pagamento_status,pagamento_txid,pagamento_vencimento,pagamento_atualizado_em,pago_em";

/**
 * Resumo de pagamento dos pedidos. Retorna lista vazia (sem quebrar a tela)
 * enquanto as colunas de pagamento não existirem no banco.
 */
export async function listarPagamentos(organizacao?: string): Promise<PagamentoResumoRow[]> {
  const params = new URLSearchParams({
    select: PAGAMENTO_SELECT,
    order: "created_at.desc",
    limit: "2000",
  });
  if (organizacao) params.set("organizacao", `eq.${organizacao}`);
  try {
    return ((await rest(`propostas?${params}`)) ?? []) as PagamentoResumoRow[];
  } catch (e) {
    if (/pagamento_|42703|PGRST204/i.test((e as Error).message)) return [];
    throw e;
  }
}

