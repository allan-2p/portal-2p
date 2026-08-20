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
    if (error) {
      const faltando =
        error.code === "PGRST205" || /Could not find the table/i.test(error.message ?? "");
      if (faltando) {
        const err: any = new Error(
          `Tabela "${table}" não existe no banco do Grupo 2P. Rode uma vez o script supabase/external/produtos-espelho.sql nesse projeto.`,
        );
        err.faltando = true;
        throw err;
      }
      throw new Error(`${table}: ${error.message}`);
    }
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

  // Cada tabela é independente: se uma faltar no destino, as outras seguem.
  const tabelas: { nome: string; rows: any[]; onConflict: string }[] = [
    { nome: "produtos", rows: payload.produtos, onConflict: "codigo" },
    { nome: "estoque", rows: payload.estoque, onConflict: "material" },
    { nome: "containers", rows: payload.containers, onConflict: "id_container,material" },
  ];

  const resultados: MirrorResult[] = [];
  for (const t of tabelas) {
    try {
      await upsertChunks(sb, t.nome, t.rows, t.onConflict);
      resultados.push({ target, ok: true, message: `${t.nome}: ${t.rows.length} linhas` });
    } catch (e: any) {
      resultados.push({
        target,
        ok: false,
        skipped: Boolean(e?.faltando),
        message: String(e?.message ?? e).slice(0, 300),
      });
    }
  }
  return resultados;
}

