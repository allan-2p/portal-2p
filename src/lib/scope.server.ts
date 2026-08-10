import type { SupabaseClient } from "@supabase/supabase-js";
import type { FilterScope, MyScope, SFTeam } from "./scope.types";

export type SalesforceOwnerFilter =
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "ids"; ids: string[] };

function validSalesforceId(v: string | null | undefined) {
  return typeof v === "string" && /^[a-zA-Z0-9]{15,18}$/.test(v);
}

export async function getScopeForUser(supabase: SupabaseClient, userId: string): Promise<MyScope> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("filter_scope, sf_user_id")
    .eq("id", userId)
    .maybeSingle();
  const scope = ((prof?.filter_scope as FilterScope) ?? "individual") as FilterScope;
  const sf_user_id = (prof?.sf_user_id as string | null) ?? null;

  if (scope === "geral") return { scope, sf_user_id, allowed_sf_ids: null };
  if (scope === "individual") {
    return { scope, sf_user_id, allowed_sf_ids: sf_user_id ? [sf_user_id] : [] };
  }

  const team: SFTeam = scope === "pre_vendas" ? "pre_vendas" : "carteira";
  const { data: rows } = await supabase
    .from("salesforce_team_members")
    .select("sf_user_id")
    .eq("team", team);
  const ids = new Set<string>((rows ?? []).map((r: any) => r.sf_user_id as string));
  if (sf_user_id) ids.add(sf_user_id);
  return { scope, sf_user_id, allowed_sf_ids: Array.from(ids) };
}

export async function resolveSalesforceOwnerFilter(
  supabase: SupabaseClient,
  userId: string,
  requestedOwnerId?: string | null,
): Promise<SalesforceOwnerFilter> {
  const scope = await getScopeForUser(supabase, userId);
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