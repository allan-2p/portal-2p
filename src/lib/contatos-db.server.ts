/**
 * Tabela `contatos`: cada contato do cliente é um registro próprio, vinculado
 * à conta pelo id do cadastro e, principalmente, pelo CÓDIGO SAP
 * (`numero_sap`) e pelo ID Salesforce da conta (`sf_account_id`).
 * O id do contato no Salesforce fica em `sf_contact_id`.
 */

import { grupo2pRest, ORGANIZACAO } from "./grupo2p-db.server";
import type { ClientesInstance } from "./clientes-db.server";

export type ContatoRow = {
  id: string;
  cliente_id: string;
  instancia: string;
  organizacao: string;
  cliente_doc: string;
  numero_sap: string | null;
  sf_account_id: string | null;
  sf_contact_id: string | null;
  sf_status: string | null;
  sf_erro: string | null;
  tipo: string;
  nome: string;
  cargo: string | null;
  emails: string[];
  telefones: string[];
  ativo: boolean;
};

export type ContatoEntrada = {
  tipo?: string | null;
  nome?: string | null;
  cargo?: string | null;
  emails?: unknown;
  telefones?: unknown;
};

export class ContatosTableMissing extends Error {
  constructor() {
    super('A tabela "contatos" ainda não existe no banco do Grupo 2P.');
    this.name = "ContatosTableMissing";
  }
}

async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<any> {
  const { ok, status, text } = await grupo2pRest(path, init);
  if (!ok) {
    if (status === 404 || /relation .*contatos.* does not exist/i.test(text)) {
      throw new ContatosTableMissing();
    }
    throw new Error(`Erro no banco (${status}): ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

const limpar = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : [];

export async function listContatos(clienteId: string): Promise<ContatoRow[]> {
  const params = new URLSearchParams({
    select: "*",
    cliente_id: `eq.${clienteId}`,
    order: "tipo.asc,nome.asc",
  });
  return (await rest(`contatos?${params}`)) ?? [];
}

/** Contatos de todos os clientes de uma unidade (para telas de listagem). */
export async function listContatosPorInstancia(instancia: ClientesInstance): Promise<ContatoRow[]> {
  const params = new URLSearchParams({
    select: "*",
    instancia: `eq.${instancia}`,
    order: "nome.asc",
    limit: "10000",
  });
  return (await rest(`contatos?${params}`)) ?? [];
}

/**
 * Espelha a lista de contatos do cadastro na tabela `contatos`:
 * cria/atualiza os informados e remove os que saíram do cadastro.
 */
export async function salvarContatos(
  instancia: ClientesInstance,
  cliente: Record<string, any>,
  contatos: ContatoEntrada[],
): Promise<ContatoRow[]> {
  const clienteId = String(cliente["id"] ?? "");
  if (!clienteId) return [];

  const linhas = (contatos ?? [])
    .map((c) => ({
      cliente_id: clienteId,
      instancia,
      organizacao: cliente["organizacao"] ?? ORGANIZACAO[instancia],
      cliente_doc: String(cliente["doc"] ?? "").replace(/\D/g, ""),
      numero_sap: cliente["numero_sap"] ?? null,
      sf_account_id: cliente["sf_account_id"] ?? null,
      tipo: ["principal", "financeiro", "outro"].includes(String(c.tipo)) ? String(c.tipo) : "outro",
      nome: String(c.nome ?? "").trim(),
      cargo: String(c.cargo ?? "").trim() || null,
      emails: limpar(c.emails),
      telefones: limpar(c.telefones),
      ativo: true,
      updated_at: new Date().toISOString(),
    }))
    .filter((c) => c.nome || c.emails.length || c.telefones.length);

  if (linhas.length > 0) {
    await rest("contatos?on_conflict=cliente_id,tipo,nome", {
      method: "POST",
      body: JSON.stringify(linhas),
      prefer: "resolution=merge-duplicates,return=representation",
    });
  }

  // Remove contatos que não estão mais no cadastro.
  const atuais = await listContatos(clienteId);
  const chaves = new Set(linhas.map((l) => `${l.tipo}|${l.nome}`));
  const remover = atuais.filter((a) => !chaves.has(`${a.tipo}|${a.nome}`));
  for (const r of remover) {
    await rest(`contatos?id=eq.${r.id}`, { method: "DELETE" });
  }

  return atuais.filter((a) => chaves.has(`${a.tipo}|${a.nome}`));
}

/** Grava os vínculos SAP / Salesforce nos contatos do cliente. */
export async function atualizarVinculosContatos(
  clienteId: string,
  patch: { numero_sap?: string | null; sf_account_id?: string | null },
): Promise<void> {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.numero_sap !== undefined) body["numero_sap"] = patch.numero_sap;
  if (patch.sf_account_id !== undefined) body["sf_account_id"] = patch.sf_account_id;
  await rest(`contatos?cliente_id=eq.${clienteId}`, { method: "PATCH", body: JSON.stringify(body) });
}

/** Grava o id do Contact do Salesforce em um contato específico. */
export async function atualizarContatoSalesforce(
  contatoId: string,
  dados: { sf_contact_id?: string | null; sf_status: string; sf_erro?: string | null },
): Promise<void> {
  await rest(`contatos?id=eq.${contatoId}`, {
    method: "PATCH",
    body: JSON.stringify({ ...dados, updated_at: new Date().toISOString() }),
  });
}

export async function contatosTableExists(): Promise<boolean> {
  try {
    await rest("contatos?select=id&limit=1");
    return true;
  } catch (e) {
    if (e instanceof ContatosTableMissing) return false;
    throw e;
  }
}

/**
 * E-mail de cobrança do cliente: usa apenas contatos do tipo
 * financeiro (preferência) ou principal — nunca "outro".
 */
export async function emailCobrancaPorDoc(clienteDoc: string): Promise<string | null> {
  const doc = String(clienteDoc ?? "").replace(/\D/g, "");
  if (!doc) return null;
  try {
    const params = new URLSearchParams({
      select: "tipo,emails,ativo",
      cliente_doc: `eq.${doc}`,
      tipo: "in.(financeiro,principal)",
      ativo: "is.true",
    });
    const rows: ContatoRow[] = (await rest(`contatos?${params}`)) ?? [];
    const ordem = ["financeiro", "principal"];
    for (const tipo of ordem) {
      const c = rows.find((r) => r.tipo === tipo && (r.emails ?? []).some((e) => e.includes("@")));
      const email = c?.emails?.find((e) => e.includes("@"));
      if (email) return email.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Todos os e-mails de cobrança do cliente, na prioridade da plataforma antiga:
 * contatos do financeiro primeiro, depois os principais.
 */
export async function emailsCobrancaPorDoc(clienteDoc: string): Promise<string[]> {
  const doc = String(clienteDoc ?? "").replace(/\D/g, "");
  if (!doc) return [];
  try {
    const params = new URLSearchParams({
      select: "tipo,emails,ativo",
      cliente_doc: `eq.${doc}`,
      tipo: "in.(financeiro,principal)",
      ativo: "is.true",
    });
    const rows: ContatoRow[] = (await rest(`contatos?${params}`)) ?? [];
    const out: string[] = [];
    for (const tipo of ["financeiro", "principal"]) {
      for (const c of rows.filter((r) => r.tipo === tipo)) {
        for (const e of c.emails ?? []) if (e.includes("@")) out.push(e.trim());
      }
    }
    return [...new Set(out)];
  } catch {
    return [];
  }
}
