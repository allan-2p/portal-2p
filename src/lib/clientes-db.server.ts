// Acesso à tabela `clientes` nos projetos externos (Solar e Carregadores).
// Cada instância grava no seu próprio banco; os esquemas são idênticos.

export type ClientesInstance = "solar" | "carregadores";

export const ORGANIZACAO: Record<ClientesInstance, string> = {
  solar: "2P Solar",
  carregadores: "2P Carregadores",
};

type DbConfig = { url: string; key: string };

export function clientesConfig(instance: ClientesInstance): DbConfig | null {
  const url =
    instance === "carregadores"
      ? process.env["ACCOUNTS_CARREGADORES_SUPABASE_URL"] ||
        process.env["ACCOUNTS_CPO_SUPABASE_URL"] ||
        "https://awvvdqdwzcnqbswxnpto.supabase.co"
      : process.env["ACCOUNTS_SOLAR_SUPABASE_URL"] || "https://latnvmczyediznkyncmn.supabase.co";
  const key =
    instance === "carregadores"
      ? process.env["ACCOUNTS_CARREGADORES_SUPABASE_KEY"] || process.env["ACCOUNTS_CPO_SUPABASE_KEY"]
      : process.env["ACCOUNTS_SOLAR_SUPABASE_KEY"];
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

export type ClienteRow = Record<string, any> & { id: string };

export class ClientesTableMissing extends Error {
  constructor(instance: ClientesInstance) {
    super(`A tabela "clientes" ainda não existe no banco de ${instance}.`);
    this.name = "ClientesTableMissing";
  }
}

async function rest(
  instance: ClientesInstance,
  path: string,
  init: RequestInit & { prefer?: string } = {},
): Promise<any> {
  const cfg = clientesConfig(instance);
  if (!cfg) throw new Error(`Banco de clientes não configurado para ${instance}.`);
  const headers: Record<string, string> = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    "Content-Type": "application/json",
  };
  if (init.prefer) headers["Prefer"] = init.prefer;
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 404 || /relation .*clientes.* does not exist/i.test(text)) {
      throw new ClientesTableMissing(instance);
    }
    throw new Error(`Erro no banco (${res.status}): ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

const SELECT = "*";

export async function listClientes(instance: ClientesInstance): Promise<ClienteRow[]> {
  const params = new URLSearchParams({ select: SELECT, order: "razao_social.asc", limit: "5000" });
  return (await rest(instance, `clientes?${params}`)) ?? [];
}

/** Procura o documento nas duas bases; devolve onde já existe. */
export async function findClienteByDoc(doc: string): Promise<
  Array<{ instancia: ClientesInstance; cliente: ClienteRow }>
> {
  const digits = doc.replace(/\D/g, "");
  const out: Array<{ instancia: ClientesInstance; cliente: ClienteRow }> = [];
  for (const instancia of ["solar", "carregadores"] as ClientesInstance[]) {
    try {
      const params = new URLSearchParams({ select: SELECT, doc: `eq.${digits}`, limit: "1" });
      const rows = (await rest(instancia, `clientes?${params}`)) ?? [];
      if (rows[0]) out.push({ instancia, cliente: rows[0] });
    } catch (e) {
      if (e instanceof ClientesTableMissing) continue;
      throw e;
    }
  }
  return out;
}

/** Busca um cliente pelo id na instância indicada. */
export async function getClienteById(
  instance: ClientesInstance,
  id: string,
): Promise<ClienteRow | null> {
  const params = new URLSearchParams({ select: SELECT, id: `eq.${id}`, limit: "1" });
  const rows = (await rest(instance, `clientes?${params}`)) ?? [];
  return rows[0] ?? null;
}

export async function insertCliente(
  instance: ClientesInstance,
  payload: Record<string, any>,
): Promise<ClienteRow> {
  const rows = await rest(instance, "clientes", {
    method: "POST",
    body: JSON.stringify(payload),
    prefer: "return=representation",
  });
  return rows[0];
}

export async function updateCliente(
  instance: ClientesInstance,
  id: string,
  payload: Record<string, any>,
): Promise<ClienteRow | null> {
  const rows = await rest(instance, `clientes?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
    prefer: "return=representation",
  });
  return rows?.[0] ?? null;
}

export async function deleteCliente(instance: ClientesInstance, id: string): Promise<void> {
  await rest(instance, `clientes?id=eq.${id}`, { method: "DELETE" });
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
