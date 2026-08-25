// Acesso à tabela `clientes` no banco do Grupo 2P.
// As duas unidades (Solar e Carregadores) compartilham a mesma tabela e são
// separadas pelas colunas `instancia` / `organizacao`.

import {
  grupo2pConfig,
  grupo2pRest,
  ORGANIZACAO as ORG,
  ORGANIZACAO_LABEL as ORG_LABEL,
} from "./grupo2p-db.server";

export type ClientesInstance = "solar" | "carregadores";

export const ORGANIZACAO: Record<ClientesInstance, string> = ORG;
export const ORGANIZACAO_LABEL: Record<ClientesInstance, string> = ORG_LABEL;

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

function isClientesTableMissing(status: number, text: string): boolean {
  const lower = text.toLowerCase();
  if (/relation\s+["']?public\.clientes["']?\s+does not exist/i.test(text)) return true;
  if (!lower.includes("clientes")) return false;
  if (status !== 404) return false;
  return (
    lower.includes("could not find the table") ||
    lower.includes("schema cache") ||
    lower.includes("does not exist") ||
    lower.includes("not found")
  );
}

async function rest(
  instance: ClientesInstance,
  path: string,
  init: RequestInit & { prefer?: string; range?: { from: number; to: number }; count?: boolean } = {},
): Promise<any> {
  const { ok, status, text } = await grupo2pRest(path, init);
  if (!ok) {
    if (isClientesTableMissing(status, text)) {
      throw new ClientesTableMissing(instance);
    }
    throw new Error(`Erro no banco (${status}): ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

const SELECT = "*";

/** Teto de linhas por resposta do PostgREST — paginação usa o cabeçalho Range. */
const PAGINA_DB = 1000;

/**
 * Lista completa da instância (usada por telas que precisam de todos os
 * cadastros). Busca em blocos de 1000 porque o PostgREST corta a resposta
 * nesse teto, independente do `limit`.
 */
export async function listClientes(instance: ClientesInstance): Promise<ClienteRow[]> {
  const out: ClienteRow[] = [];
  for (let pagina = 0; pagina < 40; pagina++) {
    const params = new URLSearchParams({
      select: SELECT,
      instancia: `eq.${instance}`,
      order: "created_at.desc,id.asc",
    });
    const from = pagina * PAGINA_DB;
    const bloco: ClienteRow[] =
      (await rest(instance, `clientes?${params}`, { range: { from, to: from + PAGINA_DB - 1 } })) ?? [];
    out.push(...bloco);
    if (bloco.length < PAGINA_DB) break;
  }
  return out;
}

export type ListarClientesOpts = {
  /** Texto livre: razão social, fantasia, cidade, e-mail, consultor, doc, nº SAP. */
  q?: string;
  uf?: string;
  /** "ativos" | "inativos" | "todos" */
  status?: string;
  /** "contribuinte" | "nao" | "todos" */
  fiscal?: string;
  /** Restringe aos cadastros de um consultor (sem "View All Records"). */
  donoId?: string | null;
  /** Código SAP do consultor — necessário para cadastros legados sem `created_by`. */
  consultorSap?: string | null;
  pagina?: number;
  porPagina?: number;
  ordem?: string;
  dir?: "asc" | "desc";
};

const COLUNAS_BUSCA_TEXTO = [
  "razao_social",
  "nome_fantasia",
  "cidade",
  "email",
  "consultor_nome",
  "consultor_sap",
  "created_by_nome",
  "numero_sap",
  "doc",
];

/** Escapa vírgula/parênteses para não quebrar o `or=(...)` do PostgREST. */
const termoSeguro = (t: string) => t.replace(/[(),*"\\]/g, " ").trim();

/**
 * Busca paginada no banco: o filtro roda no Postgres, então dá para pesquisar
 * em toda a base (7 mil+ cadastros) e não só na primeira página carregada.
 */
export async function listClientesPagina(
  instance: ClientesInstance,
  opts: ListarClientesOpts = {},
): Promise<{ rows: ClienteRow[]; total: number }> {
  const porPagina = Math.min(Math.max(opts.porPagina ?? 25, 1), 200);
  const pagina = Math.max(opts.pagina ?? 1, 1);
  const ordem = opts.ordem || "created_at";
  const dir = opts.dir === "asc" ? "asc" : "desc";

  const params = new URLSearchParams({
    select: SELECT,
    instancia: `eq.${instance}`,
    order: `${ordem}.${dir}.nullslast,id.asc`,
  });
  if (opts.uf && opts.uf !== "todas") params.set("uf", `eq.${opts.uf}`);
  if (opts.status === "ativos") params.set("ativo", "is.true");
  if (opts.status === "inativos") params.set("ativo", "is.false");
  if (opts.fiscal === "contribuinte") params.set("contribuinte", "is.true");
  if (opts.fiscal === "nao") params.set("contribuinte", "not.is.true");
  if (opts.donoId || opts.consultorSap) {
    const alvos: string[] = [];
    if (opts.donoId) {
      alvos.push(`created_by.eq.${opts.donoId}`);
      if (await temConsultorId()) alvos.push(`consultor_id.eq.${opts.donoId}`);
    }
    if (opts.consultorSap) alvos.push(`consultor_sap.eq.${opts.consultorSap}`);
    params.set("and", `(or(${alvos.join(",")}))`);
  }

  const termo = termoSeguro(opts.q ?? "");
  if (termo) {
    const digitos = termo.replace(/\D/g, "");
    const alvos = COLUNAS_BUSCA_TEXTO.map((c) => `${c}.ilike.*${termo}*`);
    if (digitos.length >= 3) {
      alvos.push(`doc.ilike.*${digitos}*`, `numero_sap.ilike.*${digitos}*`, `id_antigo.ilike.*${digitos}*`);
    }
    params.set("or", `(${alvos.join(",")})`);
  }

  const from = (pagina - 1) * porPagina;
  const { ok, status, text, total } = await grupo2pRest(`clientes?${params}`, {
    range: { from, to: from + porPagina - 1 },
    count: true,
  });
  if (!ok) {
    if (isClientesTableMissing(status, text)) {
      throw new ClientesTableMissing(instance);
    }
    // 416 = página além do fim da lista.
    if (status === 416) return { rows: [], total: total ?? 0 };
    throw new Error(`Erro no banco (${status}): ${text.slice(0, 300)}`);
  }
  const rows: ClienteRow[] = text ? JSON.parse(text) : [];
  return { rows, total: total ?? rows.length };
}

/**
 * A coluna `consultor_id` foi adicionada depois (supabase/external/clientes-consultor-id.sql).
 * Enquanto o SQL não for aplicado no banco do Grupo 2P, o portal segue
 * funcionando usando apenas `created_by` / `consultor_sap`.
 */
let _temConsultorId: boolean | null = null;
async function temConsultorId(): Promise<boolean> {
  if (_temConsultorId !== null) return _temConsultorId;
  const { ok } = await grupo2pRest("clientes?select=consultor_id&limit=1");
  _temConsultorId = ok;
  return ok;
}

/**
 * Lista para a tela "Perfil do Cliente": vem só da tabela `clientes`
 * (nunca do Salesforce), separada por instância/organização e, quando o
 * usuário não tem "View All Records", pelo consultor responsável
 * (`consultor_id` / `consultor_sap` / `created_by`).
 */
export async function listClientesPerfil(
  instance: ClientesInstance,
  opts: {
    q?: string;
    pagina?: number;
    porPagina?: number;
    donoId?: string | null;
    consultorSap?: string | null;
  } = {},
): Promise<{ rows: ClienteRow[]; total: number }> {
  const porPagina = Math.min(Math.max(opts.porPagina ?? 10, 1), 200);
  const pagina = Math.max(opts.pagina ?? 1, 1);

  const params = new URLSearchParams({
    select: SELECT,
    // Filtro por `instancia` (canônico). O campo `organizacao` foi padronizado
    // para o mesmo slug e é mantido em sincronia na gravação.
    instancia: `eq.${instance}`,
    order: "created_at.desc.nullslast,id.asc",
  });

  const grupos: string[] = [];
  if (opts.donoId || opts.consultorSap) {
    const alvos: string[] = [];
    if (opts.donoId) {
      alvos.push(`created_by.eq.${opts.donoId}`);
      // `consultor_id` só entra no filtro quando a coluna existe no banco:
      // senão o PostgREST devolve 400 e a lista inteira quebra.
      if (await temConsultorId()) alvos.push(`consultor_id.eq.${opts.donoId}`);
    }
    if (opts.consultorSap) alvos.push(`consultor_sap.eq.${opts.consultorSap}`);
    grupos.push(`or(${alvos.join(",")})`);
  }
  const termo = termoSeguro(opts.q ?? "");
  if (termo) {
    const digitos = termo.replace(/\D/g, "");
    const alvos = COLUNAS_BUSCA_TEXTO.map((c) => `${c}.ilike.*${termo}*`);
    if (digitos.length >= 3) alvos.push(`doc.ilike.*${digitos}*`, `numero_sap.ilike.*${digitos}*`);
    grupos.push(`or(${alvos.join(",")})`);
  }
  if (grupos.length) params.set("and", `(${grupos.join(",")})`);

  const from = (pagina - 1) * porPagina;
  const { ok, status, text, total } = await grupo2pRest(`clientes?${params}`, {
    range: { from, to: from + porPagina - 1 },
    count: true,
  });
  if (!ok) {
    if (isClientesTableMissing(status, text)) {
      throw new ClientesTableMissing(instance);
    }
    if (status === 416) return { rows: [], total: total ?? 0 };
    throw new Error(`Erro no banco (${status}): ${text.slice(0, 300)}`);
  }
  const rows: ClienteRow[] = text ? JSON.parse(text) : [];
  return { rows, total: total ?? rows.length };
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

/**
 * Grava tolerando colunas que ainda não existem no banco do Grupo 2P.
 *
 * O PostgREST responde `PGRST204 – Could not find the '<coluna>' column`
 * quando o portal envia um campo novo antes do SQL correspondente ser
 * aplicado (ex.: `consultor_id`). Em vez de derrubar o cadastro do cliente,
 * removemos o campo desconhecido e repetimos a gravação.
 */
async function gravarTolerante(
  instance: ClientesInstance,
  path: string,
  method: "POST" | "PATCH",
  payload: Record<string, any>,
): Promise<ClienteRow | null> {
  let corpo = { ...payload };
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    try {
      const rows = await rest(instance, path, {
        method,
        body: JSON.stringify(corpo),
        prefer: "return=representation",
      });
      return rows?.[0] ?? null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const col = /Could not find the '([^']+)' column/i.exec(msg)?.[1];
      if (!col || !(col in corpo)) throw e;
      console.warn(`[clientes] coluna "${col}" ausente no banco — gravando sem ela.`);
      delete corpo[col];
    }
  }
  throw new Error("Não foi possível gravar o cliente: colunas incompatíveis com o banco.");
}

export async function insertCliente(
  instance: ClientesInstance,
  payload: Record<string, any>,
): Promise<ClienteRow> {
  const row = await gravarTolerante(instance, "clientes", "POST", {
    ...payload,
    instancia: payload["instancia"] ?? instance,
    organizacao: payload["organizacao"] ?? ORGANIZACAO[instance],
  });
  return row as ClienteRow;
}

export async function updateCliente(
  instance: ClientesInstance,
  id: string,
  payload: Record<string, any>,
): Promise<ClienteRow | null> {
  return gravarTolerante(instance, `clientes?id=eq.${id}&instancia=eq.${instance}`, "PATCH", {
    ...payload,
    updated_at: new Date().toISOString(),
  });
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
