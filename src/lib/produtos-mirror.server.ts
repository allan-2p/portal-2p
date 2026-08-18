/**
 * Espelho da base consolidada no banco do Grupo 2P.
 *
 * O portal é a fonte da verdade: depois de cada sincronização com o SAP as
 * tabelas `produtos`, `estoque` e `containers` são replicadas para o projeto
 * grupo-2p, que alimenta os sites. Sem credencial de escrita o espelho é
 * simplesmente pulado (sem quebrar a sincronização).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { grupo2pConfig } from "./grupo2p-db.server";

export type MirrorTarget = "grupo-2p";

export type MirrorResult = { target: MirrorTarget; ok: boolean; skipped?: boolean; message?: string };

function mirrorClient(): SupabaseClient | null {
  const cfg = grupo2pConfig();
  if (!cfg) return null;
  return createClient(cfg.url, cfg.key, {
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
  const target: MirrorTarget = "grupo-2p";
  const sb = mirrorClient();
  if (!sb) {
    return [
      {
        target,
        ok: false,
        skipped: true,
        message:
          "Sem credencial de escrita no Grupo 2P (defina GRUPO2P_SUPABASE_URL e GRUPO2P_SUPABASE_SERVICE_ROLE_KEY).",
      },
    ];
  }
  try {
    await upsertChunks(sb, "produtos", payload.produtos, "codigo");
    await upsertChunks(sb, "estoque", payload.estoque, "material");
    await upsertChunks(sb, "containers", payload.containers, "id_container,material");
    return [{ target, ok: true }];
  } catch (e: any) {
    return [{ target, ok: false, message: String(e?.message ?? e).slice(0, 300) }];
  }
}
