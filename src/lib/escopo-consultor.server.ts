/**
 * Escopo de visibilidade do consultor.
 *
 * Sem "View All Records" o usuário enxerga:
 *  - os registros criados por ele (`created_by`);
 *  - os registros em que ele é o consultor responsável (`consultor_id` /
 *    `consultor_sap` / `sap_vendedor_codigo`);
 *  - todos os registros ligados aos clientes da carteira dele (casados pelo
 *    documento do cliente), mesmo que criados por outra pessoa.
 *
 * Com "View All Records" não há filtro nenhum.
 */
import type { ObjectPerm } from "./object-perms";

export type EscopoDono = {
  /** `null` quando o usuário vê tudo. */
  userId: string | null;
  sap: string | null;
  docs: string[] | null;
};

const SEM_FILTRO: EscopoDono = { userId: null, sap: null, docs: null };

async function meuPerfil(ctx: { supabase: any; userId: string }): Promise<{ sap: string | null; nome: string | null }> {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("numero_sap, full_name")
    .eq("id", ctx.userId)
    .maybeSingle();
  const sap = String(data?.numero_sap ?? "").trim();
  const nome = String(data?.full_name ?? "").trim();
  return { sap: sap || null, nome: nome || null };
}

export async function escopoDoConsultor(
  ctx: { supabase: any; userId: string },
  instancia: "solar" | "carregadores",
  perm: ObjectPerm,
): Promise<EscopoDono> {
  if (perm.view_all) return SEM_FILTRO;
  const { sap, nome } = await meuPerfil(ctx);
  let docs: string[] = [];
  try {
    const db = await import("./clientes-db.server");
    docs = await db.listarDocsDoConsultor(instancia, {
      donoId: ctx.userId,
      consultorSap: sap,
      consultorNome: nome,
    });
  } catch {
    docs = [];
  }
  return { userId: ctx.userId, sap, docs };
}


/** Aplica o escopo a um registro já carregado (proposta/pedido). */
export function registroNoEscopo(row: Record<string, any>, escopo: EscopoDono): boolean {
  if (!escopo.userId) return true;
  const doc = String(row["cliente_doc"] ?? "").replace(/\D/g, "");
  return (
    row["created_by"] === escopo.userId ||
    row["consultor_id"] === escopo.userId ||
    (!!escopo.sap && String(row["sap_vendedor_codigo"] ?? "").trim() === escopo.sap) ||
    (!!doc && (escopo.docs ?? []).includes(doc))
  );
}
