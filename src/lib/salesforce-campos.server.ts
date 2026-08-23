/**
 * Leitura/gravação do mapeamento de campos do Salesforce
 * (tabela `salesforce_field_map`) e cache curto para o caminho de envio.
 */

import type { MapeamentoItem, SfObjeto } from "./salesforce-campos";

type Cache = { at: number; itens: MapeamentoItem[] };
const cache = new Map<SfObjeto, Cache>();
const TTL_MS = 30_000;

export async function carregarMapeamento(objeto: SfObjeto): Promise<MapeamentoItem[]> {
  const c = cache.get(objeto);
  if (c && Date.now() - c.at < TTL_MS) return c.itens;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("salesforce_field_map")
      .select("campo_portal, sf_field, ativo")
      .eq("objeto", objeto);
    if (error) throw error;
    const itens = (data ?? []).map((r: any) => ({
      campo_portal: String(r.campo_portal),
      sf_field: r.sf_field ?? null,
      ativo: r.ativo !== false,
    }));
    cache.set(objeto, { at: Date.now(), itens });
    return itens;
  } catch {
    // Sem mapeamento salvo (ou banco indisponível): usa os padrões do catálogo.
    return c?.itens ?? [];
  }
}

export function limparCacheMapeamento() {
  cache.clear();
}

export async function salvarMapeamento(
  objeto: SfObjeto,
  itens: MapeamentoItem[],
  userId: string | null,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const linhas = itens.map((i) => ({
    objeto,
    campo_portal: i.campo_portal,
    sf_field: i.sf_field && i.sf_field.trim() ? i.sf_field.trim() : null,
    ativo: i.ativo,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }));
  if (!linhas.length) return;
  const { error } = await supabaseAdmin
    .from("salesforce_field_map")
    .upsert(linhas, { onConflict: "objeto,campo_portal" });
  if (error) throw new Error(error.message);
  limparCacheMapeamento();
}
