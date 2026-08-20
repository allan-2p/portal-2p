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

async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<any> {
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

export async function listarPropostas(opts: ListarPropostasOpts = {}): Promise<PropostaRow[]> {
  const params = new URLSearchParams({
    select: opts.select ?? "*",
    order: `created_at.${opts.order ?? "desc"}`,
    limit: String(opts.limit ?? 5000),
  });
  if (opts.organizacao) params.set("organizacao", `eq.${opts.organizacao}`);
  if (opts.statusIn?.length) params.set("status", `in.(${opts.statusIn.map((s) => `"${s}"`).join(",")})`);
  for (const col of opts.naoVazio ?? []) params.append(col, "not.is.null");
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

/** Nº da proposta: sequencial de 6 dígitos (zeros à esquerda) a partir de 050000. */
export const NUMERO_PROPOSTA_INICIAL = 50000;

export async function proximoNumeroProposta(organizacao = "carregadores"): Promise<string> {
  const params = new URLSearchParams({
    select: "numero",
    organizacao: `eq.${organizacao}`,
    numero: "not.is.null",
    order: "numero.desc",
    limit: "1",
  });
  const rows = (await rest(`propostas?${params}`)) ?? [];
  const atual = Number(String(rows[0]?.numero ?? "").replace(/\D/g, "")) || 0;
  const proximo = Math.max(atual + 1, NUMERO_PROPOSTA_INICIAL);
  return String(proximo).padStart(6, "0");
}

/** Próximo Nº SAP: 6 dígitos, apenas números. */
export async function proximoNumeroSap(): Promise<string> {
  const params = new URLSearchParams({
    select: "numero_sap",
    numero_sap: "not.is.null",
    order: "numero_sap.desc",
    limit: "1",
  });
  const rows = (await rest(`propostas?${params}`)) ?? [];
  const atual = Number(String(rows[0]?.numero_sap ?? "").replace(/\D/g, "")) || 0;
  return String((atual + 1) % 1000000).padStart(6, "0");
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

