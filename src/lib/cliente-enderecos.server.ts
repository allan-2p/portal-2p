/**
 * Endereços de ENTREGA do cliente (tabela `cliente_enderecos` no grupo-2p).
 * O endereço de faturamento continua nas colunas da tabela `clientes`.
 */

import { grupo2pRest, ORGANIZACAO, type Grupo2pInstance } from "./grupo2p-db.server";

export type ClienteEnderecoRow = {
  id: string;
  cliente_id: string;
  cliente_doc: string;
  instancia: string;
  apelido: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  contato: string | null;
  telefone: string | null;
  observacoes: string | null;
  favorito: boolean;
  ativo: boolean;
  created_at?: string | null;
};

export type ClienteEnderecoEntrada = {
  id?: string | null;
  apelido?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  contato?: string | null;
  telefone?: string | null;
  observacoes?: string | null;
  favorito?: boolean | null;
};

export class EnderecosTableMissing extends Error {
  constructor() {
    super('A tabela "cliente_enderecos" ainda não existe no banco do Grupo 2P.');
    this.name = "EnderecosTableMissing";
  }
}

async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<any> {
  const { ok, status, text } = await grupo2pRest(path, init);
  if (!ok) {
    if (status === 404 || /relation .*cliente_enderecos.* does not exist/i.test(text)) {
      throw new EnderecosTableMissing();
    }
    throw new Error(`Erro no banco (${status}): ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

const txt = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s || null;
};

export async function listEnderecos(clienteId: string): Promise<ClienteEnderecoRow[]> {
  const params = new URLSearchParams({
    select: "*",
    cliente_id: `eq.${clienteId}`,
    ativo: "is.true",
    order: "favorito.desc,created_at.asc",
  });
  return (await rest(`cliente_enderecos?${params}`)) ?? [];
}

export async function listEnderecosPorDoc(clienteDoc: string): Promise<ClienteEnderecoRow[]> {
  const doc = String(clienteDoc ?? "").replace(/\D/g, "");
  if (!doc) return [];
  const params = new URLSearchParams({
    select: "*",
    cliente_doc: `eq.${doc}`,
    ativo: "is.true",
    order: "favorito.desc,created_at.asc",
  });
  return (await rest(`cliente_enderecos?${params}`)) ?? [];
}

/** Só um endereço pode ser favorito por cliente. */
async function limparFavoritos(clienteId: string, exceto?: string | null) {
  const params = new URLSearchParams({ cliente_id: `eq.${clienteId}`, favorito: "is.true" });
  if (exceto) params.set("id", `neq.${exceto}`);
  await rest(`cliente_enderecos?${params}`, {
    method: "PATCH",
    body: JSON.stringify({ favorito: false, updated_at: new Date().toISOString() }),
  });
}

export async function salvarEndereco(
  instancia: Grupo2pInstance,
  cliente: { id: string; doc: string },
  entrada: ClienteEnderecoEntrada,
  autor?: { id?: string | null; nome?: string | null },
): Promise<ClienteEnderecoRow> {
  const doc = String(cliente.doc ?? "").replace(/\D/g, "");
  const corpo: Record<string, unknown> = {
    cliente_id: cliente.id,
    cliente_doc: doc,
    instancia,
    organizacao: ORGANIZACAO[instancia],
    apelido: txt(entrada.apelido),
    cep: txt(entrada.cep),
    logradouro: txt(entrada.logradouro),
    numero: txt(entrada.numero),
    complemento: txt(entrada.complemento),
    bairro: txt(entrada.bairro),
    cidade: txt(entrada.cidade),
    uf: txt(entrada.uf)?.toUpperCase() ?? null,
    contato: txt(entrada.contato),
    telefone: txt(entrada.telefone),
    observacoes: txt(entrada.observacoes),
    favorito: !!entrada.favorito,
    ativo: true,
    updated_at: new Date().toISOString(),
  };

  if (entrada.favorito) await limparFavoritos(cliente.id, entrada.id ?? null);

  if (entrada.id) {
    const linhas = await rest(`cliente_enderecos?id=eq.${entrada.id}`, {
      method: "PATCH",
      body: JSON.stringify(corpo),
      prefer: "return=representation",
    });
    const row = Array.isArray(linhas) ? linhas[0] : linhas;
    if (!row) throw new Error("Endereço não encontrado.");
    return row as ClienteEnderecoRow;
  }

  corpo["created_by"] = autor?.id ?? null;
  corpo["created_by_nome"] = txt(autor?.nome);
  const linhas = await rest("cliente_enderecos", {
    method: "POST",
    body: JSON.stringify([corpo]),
    prefer: "return=representation",
  });
  return (Array.isArray(linhas) ? linhas[0] : linhas) as ClienteEnderecoRow;
}

export async function definirFavorito(clienteId: string, id: string): Promise<void> {
  await limparFavoritos(clienteId, id);
  await rest(`cliente_enderecos?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ favorito: true, updated_at: new Date().toISOString() }),
  });
}

export async function excluirEndereco(id: string): Promise<void> {
  await rest(`cliente_enderecos?id=eq.${id}`, { method: "DELETE" });
}
