// Leitura das contas (Account) a partir dos bancos espelho do Salesforce.
// Cada instância tem seu próprio projeto/base: Solar e Carregadores.

export type AccountsInstance = "solar" | "carregadores";

type DbConfig = { url: string; key: string };

function configFor(instance: AccountsInstance): DbConfig | null {
  const url =
    instance === "carregadores"
      ? process.env["ACCOUNTS_CPO_SUPABASE_URL"] || "https://awvvdqdwzcnqbswxnpto.supabase.co"
      : process.env["ACCOUNTS_SOLAR_SUPABASE_URL"] || "https://latnvmczyediznkyncmn.supabase.co";
  const key =
    instance === "carregadores"
      ? process.env["ACCOUNTS_CPO_SUPABASE_KEY"]
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
 * Busca todas as contas do banco espelho, paginando via Range.
 * Lança erro se a base não estiver configurada ou responder com falha.
 */
export async function fetchAccountsFromDb(
  instance: AccountsInstance,
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<AccountDbRow[]> {
  const cfg = configFor(instance);
  if (!cfg) throw new Error(`Base de contas não configurada para ${instance}`);
  const pageSize = opts.pageSize ?? 1000;
  const maxPages = opts.maxPages ?? 20;

  const rows: AccountDbRow[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const res = await fetch(
      `${cfg.url}/rest/v1/account_sf?select=${COLUMNS}&order=name.asc`,
      {
        headers: {
          apikey: cfg.key,
          Authorization: `Bearer ${cfg.key}`,
          Range: `${from}-${to}`,
          "Range-Unit": "items",
          Accept: "application/json",
        },
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Banco de contas ${instance} ${res.status}: ${text.slice(0, 200)}`);
    }
    const batch = (await res.json()) as AccountDbRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}
