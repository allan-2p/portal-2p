// Leitura das contas (Account) a partir dos bancos espelho do Salesforce.
// Cada instância tem seu próprio projeto/base: Solar e Carregadores.

export type AccountsInstance = "solar" | "carregadores";

type DbConfig = { url: string; key: string };

function configFor(instance: AccountsInstance): DbConfig | null {
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

export type AccountDbRow = {
  id: string;
  name: string | null;
  phone: string | null;
  website: string | null;
  industry: string | null;
  description: string | null;
  owner_id: string | null;
  created_date: string | null;
  custom_fields: Record<string, any> | null;
};

const COLUMNS =
  "id,name,phone,website,industry,description,owner_id,created_date,custom_fields";

/**
 * Busca todas as contas do banco espelho usando paginação por chave (keyset)
 * em `id`. Ordenar por `name` (sem índice) estourava o statement_timeout.
 */
export async function fetchAccountsFromDb(
  instance: AccountsInstance,
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<AccountDbRow[]> {
  const cfg = configFor(instance);
  if (!cfg) throw new Error(`Base de contas não configurada para ${instance}`);
  const pageSize = opts.pageSize ?? 1000;
  const maxPages = opts.maxPages ?? 50;

  const rows: AccountDbRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      select: COLUMNS,
      order: "id.asc",
      limit: String(pageSize),
    });
    if (cursor) params.set("id", `gt.${cursor}`);
    const res = await fetch(`${cfg.url}/rest/v1/account_sf?${params.toString()}`, {
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Banco de contas ${instance} ${res.status}: ${text.slice(0, 200)}`);
    }
    const batch = (await res.json()) as AccountDbRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    cursor = batch[batch.length - 1]?.id ?? null;
    if (!cursor) break;
  }
  // Ordenação por nome feita na aplicação (evita sort pesado no banco).
  rows.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"));
  return rows;
}


/** Busca apenas o dono (owner_id) de um conjunto de contas do banco espelho. */
export async function fetchAccountOwners(
  instance: AccountsInstance,
  ids: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const clean = Array.from(new Set(ids.filter((i) => /^[a-zA-Z0-9]{15,18}$/.test(i))));
  if (clean.length === 0) return out;
  const cfg = configFor(instance);
  if (!cfg) throw new Error(`Base de contas não configurada para ${instance}`);
  for (let i = 0; i < clean.length; i += 200) {
    const chunk = clean.slice(i, i + 200);
    const params = new URLSearchParams({
      select: "id,owner_id",
      id: `in.(${chunk.join(",")})`,
      limit: String(chunk.length),
    });
    const res = await fetch(`${cfg.url}/rest/v1/account_sf?${params.toString()}`, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Banco de contas ${instance} ${res.status}`);
    for (const row of (await res.json()) as { id: string; owner_id: string | null }[]) {
      out.set(row.id, row.owner_id ?? null);
    }
  }
  return out;
}

/** Busca uma conta específica do banco espelho. */
export async function fetchAccountById(
  instance: AccountsInstance,
  id: string,
): Promise<AccountDbRow | null> {
  if (!/^[a-zA-Z0-9]{15,18}$/.test(id)) return null;
  const cfg = configFor(instance);
  if (!cfg) throw new Error(`Base de contas não configurada para ${instance}`);
  const params = new URLSearchParams({ select: COLUMNS, id: `eq.${id}`, limit: "1" });
  const res = await fetch(`${cfg.url}/rest/v1/account_sf?${params.toString()}`, {
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Banco de contas ${instance} ${res.status}`);
  const rows = (await res.json()) as AccountDbRow[];
  return rows[0] ?? null;
}
