/**
 * Detecta se o banco do catálogo já tem a coluna `campos_manuais`.
 * Enquanto o DDL não estiver aplicado, o código continua funcionando — só não
 * há trava por campo (status e visibilidade seguem travados pelos overrides).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

let cache: boolean | null = null;

export async function temColunaCamposManuais(db: SupabaseClient): Promise<boolean> {
  if (cache !== null) return cache;
  const { error } = await db.from("sap_produtos").select("campos_manuais").limit(1);
  cache = !error;
  return cache;
}

/** Acrescenta a coluna à lista de select quando ela existir. */
export async function colunasComTravas(db: SupabaseClient, cols: string): Promise<string> {
  return (await temColunaCamposManuais(db)) ? `${cols}, campos_manuais` : cols;
}
