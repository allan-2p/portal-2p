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

