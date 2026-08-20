// Acesso à tabela `clientes` no banco do Grupo 2P.
// As duas unidades (Solar e Carregadores) compartilham a mesma tabela e são
// separadas pelas colunas `instancia` / `organizacao`.

import { grupo2pConfig, grupo2pRest, ORGANIZACAO as ORG } from "./grupo2p-db.server";

export type ClientesInstance = "solar" | "carregadores";

export const ORGANIZACAO: Record<ClientesInstance, string> = ORG;

type DbConfig = { url: string; key: string };

export function clientesConfig(_instance?: ClientesInstance): DbConfig | null {
  return grupo2pConfig();
}

export type ClienteRow = Record<string, any> & { id: string };

export class ClientesTableMissing extends Error {
  constructor(instance: ClientesInstance) {
    super(`A tabela "clientes" ainda não existe no banco do Grupo 2P (${instance}).`);
    this.name = "ClientesTableMissing";
  }
}

async function rest(
  instance: ClientesInstance,
  path: string,
  init: RequestInit & { prefer?: string } = {},
): Promise<any> {
  const { ok, status, text } = await grupo2pRest(path, init);
  if (!ok) {
    if (status === 404 || /relation .*clientes.* does not exist/i.test(text)) {
      throw new ClientesTableMissing(instance);
    }
    throw new Error(`Erro no banco (${status}): ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

const SELECT = "*";

export async function listClientes(instance: ClientesInstance): Promise<ClienteRow[]> {
  const params = new URLSearchParams({
    select: SELECT,
    instancia: `eq.${instance}`,
    order: "razao_social.asc",
    limit: "5000",
  });
  return (await rest(instance, `clientes?${params}`)) ?? [];
}

/** Procura o documento nas duas unidades; devolve onde já existe. */
export async function findClienteByDoc(doc: string): Promise<
  Array<{ instancia: ClientesInstance; cliente: ClienteRow }>
> {
  const digits = doc.replace(/\D/g, "");
  const out: Array<{ instancia: ClientesInstance; cliente: ClienteRow }> = [];
  try {
    const params = new URLSearchParams({ select: SELECT, doc: `eq.${digits}`, limit: "10" });
    const rows: ClienteRow[] = (await rest("solar", `clientes?${params}`)) ?? [];
    for (const cliente of rows) {
      const inst = cliente["instancia"] === "carregadores" ? "carregadores" : "solar";
      out.push({ instancia: inst, cliente });
    }
  } catch (e) {
    if (e instanceof ClientesTableMissing) return out;
    throw e;
  }
  return out;
}

/** Busca um cliente pelo id na instância indicada. */
export async function getClienteById(
  instance: ClientesInstance,
  id: string,
): Promise<ClienteRow | null> {
  const params = new URLSearchParams({
    select: SELECT,
    id: `eq.${id}`,
    instancia: `eq.${instance}`,
    limit: "1",
  });
  const rows = (await rest(instance, `clientes?${params}`)) ?? [];
  return rows[0] ?? null;
}

export async function insertCliente(
  instance: ClientesInstance,
  payload: Record<string, any>,
): Promise<ClienteRow> {
  const rows = await rest(instance, "clientes", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      instancia: payload["instancia"] ?? instance,
      organizacao: payload["organizacao"] ?? ORGANIZACAO[instance],
    }),
    prefer: "return=representation",
  });
  return rows[0];
}

export async function updateCliente(
  instance: ClientesInstance,
  id: string,
  payload: Record<string, any>,
): Promise<ClienteRow | null> {
  const rows = await rest(instance, `clientes?id=eq.${id}&instancia=eq.${instance}`, {
    method: "PATCH",
    body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
    prefer: "return=representation",
  });
  return rows?.[0] ?? null;
}

export async function deleteCliente(instance: ClientesInstance, id: string): Promise<void> {
  await rest(instance, `clientes?id=eq.${id}&instancia=eq.${instance}`, { method: "DELETE" });
}

/**
 * Espelho do cadastro no SAP (`clientes_sap`), com o que foi enviado e o que o
 * SAP devolveu. Falha silenciosa quando a tabela ainda não existe.
 */
export async function upsertClienteSap(row: Record<string, any>): Promise<void> {
  const { ok, status, text } = await grupo2pRest("clientes_sap?on_conflict=cliente_id", {
    method: "POST",
    body: JSON.stringify(row),
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  if (!ok && status !== 404) {
    throw new Error(`Erro ao gravar clientes_sap (${status}): ${text.slice(0, 300)}`);
  }
}


export async function clientesTableExists(instance: ClientesInstance): Promise<boolean> {
  try {
    await rest(instance, "clientes?select=id&limit=1");
    return true;
  } catch (e) {
    if (e instanceof ClientesTableMissing) return false;
    throw e;
  }
}
