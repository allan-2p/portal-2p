/**
 * Banco do CATÁLOGO (produtos, estoque, calculadora Solar).
 *
 * A consolidação move o catálogo do Lovable Cloud para o projeto grupo-2p,
 * onde já vivem propostas e clientes. Para o corte não virar um "big bang",
 * todo o código de catálogo passa por aqui: enquanto `CATALOGO_DB` não for
 * `grupo2p`, o cliente devolvido é o mesmo de sempre (Lovable Cloud) e nada
 * muda; virando a chave, as mesmas chamadas `.from(...)` passam a falar com o
 * grupo-2p.
 *
 * Os dois lados são acessados com a chave de serviço (ignora RLS), então a
 * troca é transparente para o código chamador. O login continua no Lovable.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { grupo2pConfig } from "./grupo2p-db.server";

let cache: SupabaseClient | null = null;

/** `true` quando o catálogo já foi cortado para o grupo-2p. */
export function catalogoNoGrupo2p(): boolean {
  return (process.env["CATALOGO_DB"] ?? "").toLowerCase() === "grupo2p";
}

/** Cliente de serviço do grupo-2p com a API `.from()` do supabase-js. */
export function grupo2pAdmin(): SupabaseClient {
  if (cache) return cache;
  const cfg = grupo2pConfig();
  if (!cfg) throw new Error("Banco do Grupo 2P não configurado (GRUPO2P_SUPABASE_SERVICE_ROLE_KEY).");
  cache = createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cache;
}

/**
 * Cliente do catálogo. Use SEMPRE isto no lugar de `supabaseAdmin` nas
 * tabelas de catálogo/estoque/calculadora.
 */
export async function catalogoDb(): Promise<SupabaseClient> {
  if (catalogoNoGrupo2p()) return grupo2pAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

/** Rótulo do destino atual — usado nos painéis de integração/diagnóstico. */
export function catalogoDbLabel(): "grupo-2p" | "lovable" {
  return catalogoNoGrupo2p() ? "grupo-2p" : "lovable";
}
