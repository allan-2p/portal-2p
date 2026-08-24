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

/**
 * Valor CANÔNICO gravado na coluna `organizacao` das tabelas compartilhadas.
 * Padronizado em código (slug), igual ao `instancia`/`InstanceId` do portal —
 * os rótulos antigos ("2P Solar"/"2P Carregadores") foram normalizados na base
 * e o banco tem CHECK aceitando apenas solar | carregadores | grupo | station.
 * Para exibir na tela use ORGANIZACAO_LABEL.
 */
export const ORGANIZACAO: Record<Grupo2pInstance, string> = {
  solar: "solar",
  carregadores: "carregadores",
};

/** Rótulo de exibição da organização (nunca gravar no banco). */
export const ORGANIZACAO_LABEL: Record<Grupo2pInstance, string> = {
  solar: "2P Solar",
  carregadores: "2P Carregadores",
};


export const GRUPO2P_DEFAULT_URL = "https://npzlinbglznnnwxxcawh.supabase.co";

export type Grupo2pConfig = { url: string; key: string };

/**
 * URL + chave de serviço do projeto grupo-2p. As variáveis antigas
 * (ACCOUNTS_ e PRODUTOS_) continuam aceitas como fallback para não quebrar
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

/**
 * Chamada REST (PostgREST) no banco do Grupo 2P.
 *
 * `range` usa o cabeçalho Range do PostgREST para paginar de verdade (o
 * parâmetro `limit` sozinho não passa do teto de 1000 linhas por resposta) e
 * devolve `total` a partir do Content-Range quando se pede `count=exact`.
 */
export async function grupo2pRest(
  path: string,
  init: RequestInit & { prefer?: string; range?: { from: number; to: number }; count?: boolean } = {},
): Promise<{ ok: boolean; status: number; text: string; total: number | null }> {
  const cfg = grupo2pConfig();
  if (!cfg) throw new Error("Banco do Grupo 2P não configurado (GRUPO2P_SUPABASE_SERVICE_ROLE_KEY).");
  const headers: Record<string, string> = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const prefer = [init.prefer, init.count ? "count=exact" : ""].filter(Boolean).join(",");
  if (prefer) headers["Prefer"] = prefer;
  if (init.range) headers["Range-Unit"] = "items";
  if (init.range) headers["Range"] = `${init.range.from}-${init.range.to}`;
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, { ...init, headers });
  const contentRange = res.headers.get("content-range");
  const totalTxt = contentRange?.split("/")[1];
  const total = totalTxt && /^\d+$/.test(totalTxt) ? Number(totalTxt) : null;
  return { ok: res.ok, status: res.status, text: await res.text(), total };
}
