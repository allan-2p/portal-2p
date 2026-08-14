/**
 * Espelho da base consolidada nos projetos Solar e Carregadores.
 *
 * O portal é a fonte da verdade: depois de cada sincronização com o SAP as
 * tabelas `produtos`, `estoque` e `containers` são replicadas para os dois
 * projetos. Cada destino precisa de URL + chave de escrita (service role);
 * sem elas o espelho é simplesmente pulado (sem quebrar a sincronização).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type MirrorTarget = "solar" | "carregadores";

export type MirrorResult = { target: MirrorTarget; ok: boolean; skipped?: boolean; message?: string };

function clientFor(target: MirrorTarget): SupabaseClient | null {
  const url =
    target === "solar"
      ? (process.env["PRODUTOS_SOLAR_SUPABASE_URL"] ?? process.env["ACCOUNTS_SOLAR_SUPABASE_URL"])
      : (process.env["PRODUTOS_CARREGADORES_SUPABASE_URL"] ??
        process.env["ACCOUNTS_CARREGADORES_SUPABASE_URL"]);
  const key =
    target === "solar"
      ? (process.env["PRODUTOS_SOLAR_SUPABASE_KEY"] ?? process.env["ACCOUNTS_SOLAR_SUPABASE_KEY"])
      : (process.env["PRODUTOS_CARREGADORES_SUPABASE_KEY"] ??
        process.env["ACCOUNTS_CARREGADORES_SUPABASE_KEY"]);
  if (!url || !key) return null;
  return createClient(url.replace(/\/+$/, ""), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function upsertChunks(sb: SupabaseClient, table: string, rows: any[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

export async function espelharProdutos(payload: {
  produtos: any[];
  estoque: any[];
  containers: any[];
}): Promise<MirrorResult[]> {
  const alvos: MirrorTarget[] = ["solar", "carregadores"];
  const resultados: MirrorResult[] = [];

  for (const target of alvos) {
    const sb = clientFor(target);
    if (!sb) {
      resultados.push({
        target,
        ok: false,
        skipped: true,
        message: `Sem credencial de escrita para ${target} (defina PRODUTOS_${target.toUpperCase()}_SUPABASE_URL/KEY).`,
      });
      continue;
    }
    try {
      await upsertChunks(sb, "produtos", payload.produtos, "codigo");
      await upsertChunks(sb, "estoque", payload.estoque, "material");
      await upsertChunks(sb, "containers", payload.containers, "id_container,material");
      resultados.push({ target, ok: true });
    } catch (e: any) {
      resultados.push({ target, ok: false, message: String(e?.message ?? e).slice(0, 300) });
    }
  }

  return resultados;
}
