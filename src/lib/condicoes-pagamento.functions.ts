import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Catálogo de condições de pagamento (ZTERM do SAP).
 *
 * `ativo=false` são as condições descontinuadas — ficam guardadas para
 * referência/pedidos históricos e não aparecem no checkout.
 * `parse_automatico=false` são descrições com percentual ou parcelamento de
 * cartão: as parcelas precisam ser preenchidas na mão antes de usar, então
 * também ficam fora do checkout.
 */
export type CondicaoPagamento = {
  codigo: string;
  descricao: string;
  parcelas: { dias: number }[] | null;
  num_parcelas: number | null;
  parse_automatico: boolean;
  ativo: boolean;
};

async function assertAdmin(ctx: { supabase: any }) {
  const { data, error } = await ctx.supabase.rpc("is_admin");
  if (error || !data) throw new Error("Apenas administradores do sistema podem alterar as condições.");
}

/** Lista o catálogo. `somenteCheckout` devolve só o que pode ser usado numa proposta. */
export const listCondicoesPagamento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { somenteCheckout?: boolean }) => input ?? {})
  .handler(async ({ data, context }): Promise<CondicaoPagamento[]> => {
    let q = (context.supabase as any)
      .from("condicoes_pagamento")
      .select("codigo, descricao, parcelas, num_parcelas, parse_automatico, ativo")
      .order("codigo");
    if (data.somenteCheckout) q = q.eq("ativo", true).eq("parse_automatico", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as CondicaoPagamento[];
  });

/** Cria ou atualiza uma condição (admin). */
export const upsertCondicaoPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CondicaoPagamento) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const codigo = data.codigo.trim().toUpperCase();
    if (!codigo) throw new Error("Informe o código (ZTERM).");
    if (!data.descricao.trim()) throw new Error("Informe a descrição.");
    const parcelas = data.parcelas?.length ? data.parcelas : null;
    const { error } = await (context.supabase as any).from("condicoes_pagamento").upsert(
      {
        codigo,
        descricao: data.descricao.trim(),
        parcelas,
        num_parcelas: parcelas ? parcelas.length : null,
        parse_automatico: !!parcelas,
        ativo: data.ativo,
      },
      { onConflict: "codigo" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Liga/desliga uma condição (admin). */
export const toggleCondicaoPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { codigo: string; ativo: boolean }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const { error } = await (context.supabase as any)
      .from("condicoes_pagamento")
      .update({ ativo: data.ativo })
      .eq("codigo", data.codigo);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Converte "30/60/90 DDL" em parcelas. Devolve null quando não dá para parsear. */
export function parcelasDaDescricao(desc: string): { dias: number }[] | null {
  if (/%/.test(desc)) return null;
  const dias = (desc.match(/\d{1,3}/g) ?? []).map(Number).filter((n) => n >= 0 && n <= 720);
  return dias.length ? dias.map((d) => ({ dias: d })) : null;
}
