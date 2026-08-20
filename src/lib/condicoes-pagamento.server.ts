/**
 * Resolução da condição de pagamento (ZTERM) escolhida na proposta.
 *
 * O checkout só aceita condições `ativo=true` e `parse_automatico=true` —
 * as demais têm percentual/parcelamento de cartão e precisam de tratamento
 * manual antes de ir para o SAP.
 */
export async function resolverCondicaoPagamento(
  supabase: any,
  codigo: unknown,
): Promise<{ codigo: string | null; descricao: string | null }> {
  const cod = String(codigo ?? "").trim().toUpperCase();
  if (!cod) return { codigo: null, descricao: null };
  const { data, error } = await supabase
    .from("condicoes_pagamento")
    .select("codigo, descricao, ativo, parse_automatico")
    .eq("codigo", cod)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.ativo || !data.parse_automatico) {
    throw new Error(`Condição de pagamento ${cod} indisponível no checkout.`);
  }
  return { codigo: data.codigo as string, descricao: data.descricao as string };
}
