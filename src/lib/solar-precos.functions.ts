import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pltypDaTabela } from "@/lib/sap-clientes-map";

export type PrecoSolarInput = {
  itens: { codigo: string; quantidade: number }[];
  documento: string;
  listaPreco: string;
};

function validar(input: unknown): PrecoSolarInput {
  const i = (input ?? {}) as any;
  const itens = (Array.isArray(i.itens) ? i.itens : [])
    .filter((x: any) => x && x.codigo)
    .map((x: any) => ({
      codigo: String(x.codigo),
      quantidade: Math.max(1, Number(x.quantidade) || 1),
    }));
  return {
    itens,
    documento: String(i.documento ?? "").replace(/\D/g, ""),
    listaPreco: /^\d{2}$/.test(String(i.listaPreco)) ? String(i.listaPreco) : "01",
  };
}

/** Preços unitários por tabela de preço (usado ao trocar a tabela na proposta). */
export const precosSolarFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validar)
  .handler(async ({ data, context }) => {
    if (!data.itens.length)
      return { precos: {} as Record<string, number>, fallback: [] as string[], avisos: [] as string[] };


    const { data: prods } = await context.supabase
      .from("sap_produtos")
      .select("codigo, preco_sugerido")
      .in(
        "codigo",
        data.itens.map((i) => i.codigo),
      );
    const sugeridos: Record<string, number> = {};
    for (const p of (prods ?? []) as any[])
      sugeridos[String(p.codigo).replace(/^0+(?=\d)/, "")] = Number(p.preco_sugerido ?? 0);

    const { precosSolar } = await import("./solar-precos.server");
    return await precosSolar(data.itens, {
      documento: data.documento,
      listaPreco: data.listaPreco,
      sugeridos,
    });
  });
