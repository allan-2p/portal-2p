/**
 * Conexão única com o banco do Grupo 2P.
 *
 * Antes o portal falava com dois projetos separados (2P Solar e 2P
 * Carregadores). Tudo foi consolidado em um único projeto — as tabelas
 * `clientes` e `leads` trazem as colunas `organizacao`/`instancia` para
 * separar as unidades, e os espelhos do Salesforce (`account_sf`,
 * `contact_sf`, `opportunity_sf`) são comuns às duas.
 */

export type Grupo2pInstance = "solar" | "carregadores";

/** Nome da organização gravado nas tabelas compartilhadas. */
export const ORGANIZACAO: Record<Grupo2pInstance, string> = {
  solar: "2P Solar",
  carregadores: "2P Carregadores",
};

export const GRUPO2P_DEFAULT_URL = "https://npzlinbglznnnwxxcawh.supabase.co";

export type Grupo2pConfig = { url: string; key: string };

/**
 * URL + chave de serviço do projeto grupo-2p. As variáveis antigas
 * (ACCOUNTS_*/PRODUTOS_*) continuam aceitas como fallback para não quebrar
 * ambientes que ainda não foram atualizados.
 */
export function grupo2pConfig(): Grupo2pConfig | null {
  const url =
    process.env["GRUPO2P_SUPABASE_URL"] ||
    process.env["ACCOUNTS_SOLAR_SUPABASE_URL"] ||
    GRUPO2P_DEFAULT_URL;
  const key =
    process.env["GRUPO2P_SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["GRUPO2P_SUPABASE_KEY"] ||
    process.env["ACCOUNTS_SOLAR_SUPABASE_KEY"] ||
    process.env["ACCOUNTS_CARREGADORES_SUPABASE_KEY"];
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

/** Chamada REST (PostgREST) no banco do Grupo 2P. */
export async function grupo2pRest(
  path: string,
  init: RequestInit & { prefer?: string } = {},
): Promise<{ ok: boolean; status: number; text: string }> {
  const cfg = grupo2pConfig();
  if (!cfg) throw new Error("Banco do Grupo 2P não configurado (GRUPO2P_SUPABASE_SERVICE_ROLE_KEY).");
  const headers: Record<string, string> = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (init.prefer) headers["Prefer"] = init.prefer;
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, { ...init, headers });
  return { ok: res.ok, status: res.status, text: await res.text() };
}
