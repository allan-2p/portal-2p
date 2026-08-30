/**
 * Autenticação das rotas HTTP do Atlas (streaming de chat).
 *
 * As server functions usam `requireSupabaseAuth`; a rota de streaming precisa
 * devolver uma Response crua, então validamos o bearer aqui do mesmo jeito.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AtlasCtx = { supabase: any; userId: string };

function novaChave(v: string): boolean {
  return v.startsWith("sb_publishable_") || v.startsWith("sb_secret_");
}

export async function autenticarRequest(request: Request): Promise<AtlasCtx | null> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;

  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (token.split(".").length !== 3) return null;

  const supabase = createClient<Database>(url, key, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (novaChave(key) && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) return null;
  return { supabase, userId };
}
