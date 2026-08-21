import type { SupabaseClient } from "@supabase/supabase-js";
import type { FilterScope, MyScope, SFTeam } from "./scope.types";

export type SalesforceOwnerFilter =
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "ids"; ids: string[] };

function validSalesforceId(v: string | null | undefined) {
  return typeof v === "string" && /^[a-zA-Z0-9]{15,18}$/.test(v);
}

/**
 * Cache do escopo do usuário — duas camadas.
 *
 * 1) POR REQUISIÇÃO: chaveado pelo próprio client Supabase (que o middleware cria
 *    a cada request) num WeakMap. Dentro da mesma requisição o escopo não muda,
 *    então as 3–5 chamadas repetidas viram uma só, sem nenhum risco de staleness.
 * 2) ENTRE REQUISIÇÕES: TTL curto (20s) por userId, só como alívio extra. É
 *    invalidado por qualquer mutação de admin que mexa em escopo/permissões, e
 *    nunca guarda erro nem resultado vazio/nulo.
 */
const perRequest = new WeakMap<object, Map<string, MyScope>>();
const TTL_MS = 20_000;
const shortLived = new Map<string, { scope: MyScope; exp: number }>();

function readShortLived(userId: string): MyScope | null {
  const hit = shortLived.get(userId);
  if (!hit) return null;
  if (hit.exp <= Date.now()) {
    shortLived.delete(userId);
    return null;
  }
  return hit.scope;
}

function writeShortLived(userId: string, scope: MyScope) {
  if (shortLived.size > 500) shortLived.clear();
  shortLived.set(userId, { scope, exp: Date.now() + TTL_MS });
}

/** Invalida o cache de escopo. Sem argumento, limpa todos (ex.: mudança de equipe). */
export function invalidateScopeCache(userId?: string) {
  if (userId) shortLived.delete(userId);
  else shortLived.clear();
}

async function loadScopeForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ scope: MyScope; cacheable: boolean }> {
  const { data: prof, error } = await supabase
    .from("profiles")
    .select("filter_scope, sf_user_id")
    .eq("id", userId)
    .maybeSingle();
  const scopeName = ((prof?.filter_scope as FilterScope) ?? "individual") as FilterScope;
  const sf_user_id = (prof?.sf_user_id as string | null) ?? null;
  // Erro ou perfil inexistente: devolve o escopo mais restrito, mas NÃO cacheia.
  const cacheable = !error && !!prof;

  if (scopeName === "geral") {
    return { scope: { scope: scopeName, sf_user_id, allowed_sf_ids: null }, cacheable };
  }
  if (scopeName === "individual") {
    return {
      scope: { scope: scopeName, sf_user_id, allowed_sf_ids: sf_user_id ? [sf_user_id] : [] },
      cacheable,
    };
  }

  const team: SFTeam = scopeName === "pre_vendas" ? "pre_vendas" : "carteira";
  const { data: rows, error: teamError } = await supabase
    .from("salesforce_team_members")
    .select("sf_user_id")
    .eq("team", team);
  const ids = new Set<string>((rows ?? []).map((r: any) => r.sf_user_id as string));
  if (sf_user_id) ids.add(sf_user_id);
  return {
    scope: { scope: scopeName, sf_user_id, allowed_sf_ids: Array.from(ids) },
    cacheable: cacheable && !teamError,
  };
}

export async function getScopeForUser(supabase: SupabaseClient, userId: string): Promise<MyScope> {
  const bucket = perRequest.get(supabase as unknown as object) ?? new Map<string, MyScope>();
  perRequest.set(supabase as unknown as object, bucket);
  const inRequest = bucket.get(userId);
  if (inRequest) return inRequest;

  const cached = readShortLived(userId);
  if (cached) {
    bucket.set(userId, cached);
    return cached;
  }

  const { scope, cacheable } = await loadScopeForUser(supabase, userId);
  bucket.set(userId, scope);
  if (cacheable) writeShortLived(userId, scope);
  return scope;
}

export async function resolveSalesforceOwnerFilter(
  supabase: SupabaseClient,
  userId: string,
  requestedOwnerId?: string | null,
  /** Escopo já carregado nesta requisição (evita nova ida ao banco). */
  preloadedScope?: MyScope,
): Promise<SalesforceOwnerFilter> {
  const scope = preloadedScope ?? (await getScopeForUser(supabase, userId));
  // Aceita 1 id ou vários separados por vírgula (multi-seleção de vendedores).
  const requestedIds = Array.from(
    new Set(
      (requestedOwnerId ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter((v) => validSalesforceId(v)),
    ),
  );

  if (scope.scope === "geral") {
    return requestedIds.length ? { kind: "ids", ids: requestedIds } : { kind: "all" };
  }

  const allowed = (scope.allowed_sf_ids ?? []).filter(validSalesforceId);
  if (allowed.length === 0) return { kind: "none" };
  const inter = requestedIds.filter((id) => allowed.includes(id));
  if (inter.length) return { kind: "ids", ids: inter };
  return { kind: "ids", ids: allowed };
}

export function ownerFilterClause(filter: SalesforceOwnerFilter, field = "OwnerId") {
  if (filter.kind === "all") return "";
  if (filter.kind === "none" || filter.ids.length === 0) return ` AND ${field} = null AND ${field} != null`;
  if (filter.ids.length === 1) return ` AND ${field} = '${filter.ids[0]}'`;
  return ` AND ${field} IN (${filter.ids.map((id) => `'${id}'`).join(",")})`;
}
/**
 * Filtra uma lista de contas (Account IDs) deixando apenas as que o usuário
 * pode ver segundo o escopo da carteira. Escopo "geral" devolve tudo.
 */
export async function filterAllowedAccountIds(
  supabase: SupabaseClient,
  userId: string,
  ids: string[],
  instance: "solar" | "carregadores" = "solar",
  preloadedScope?: MyScope,
): Promise<string[]> {
  const scope = preloadedScope ?? (await getScopeForUser(supabase, userId));
  if (scope.scope === "geral") return ids;
  const allowed = new Set((scope.allowed_sf_ids ?? []).filter(validSalesforceId));
  if (allowed.size === 0) return [];
  const { fetchAccountOwners } = await import("./accounts-db.server");
  const owners = await fetchAccountOwners(instance, ids);
  return ids.filter((id) => {
    const owner = owners.get(id);
    return !!owner && allowed.has(owner);
  });
}

/** Lança erro quando o usuário não é dono (nem tem escopo) da conta pedida. */
export async function assertAccountAccess(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  instance: "solar" | "carregadores" = "solar",
  preloadedScope?: MyScope,
): Promise<void> {
  const allowed = await filterAllowedAccountIds(
    supabase,
    userId,
    [accountId],
    instance,
    preloadedScope,
  );
  if (allowed.length === 0) {
    throw new Error("Sem permissão: esta conta não pertence à sua carteira.");
  }
}

/** Lança erro quando a tarefa do Salesforce não pertence ao escopo do usuário. */
export async function assertTaskOwnership(
  supabase: SupabaseClient,
  userId: string,
  taskOwnerId: string | null | undefined,
  preloadedScope?: MyScope,
): Promise<void> {
  const scope = preloadedScope ?? (await getScopeForUser(supabase, userId));
  if (scope.scope === "geral") return;
  const allowed = (scope.allowed_sf_ids ?? []).filter(validSalesforceId);
  if (!taskOwnerId || !allowed.includes(taskOwnerId)) {
    throw new Error("Sem permissão: esta tarefa não pertence à sua carteira.");
  }
}
