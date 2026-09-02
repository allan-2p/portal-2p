import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PesoItensInput = {
  itens: { codigo: string; qtd: number }[];
  documento?: string;
};

export type PesoItensResultado = {
  /** Peso líquido total (kg) dos itens informados. */
  total: number;
  /** Peso por código de material (kg da linha inteira). */
  porCodigo: Record<string, number>;
  /** Códigos sem peso retornado pelo SAP. */
  semPeso: string[];
  /** Mensagem quando a simulação falhou. */
  erro: string | null;
};

/**
 * Peso dos itens de uma proposta — mesma fonte usada na cotação de frete
 * (PESO_LIQUIDO da simulação ZNFE_OV_SIMULAR). Nada é persistido: o detalhe
 * consulta sob demanda para exibir o peso total do pedido.
 */
export const pesoItensProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PesoItensInput) => input)
  .handler(async ({ data }): Promise<PesoItensResultado> => {
    const itens = (data.itens ?? [])
      .map((i) => ({ codigo: String(i.codigo ?? "").trim(), quantidade: Number(i.qtd || 0) }))
      .filter((i) => i.codigo && i.quantidade > 0);
    if (!itens.length) return { total: 0, porCodigo: {}, semPeso: [], erro: null };

    const { simularSap } = await import("./sap-precos.server");
    const res = await simularSap(itens, {
      ...(data.documento ? { documento: data.documento } : {}),
    }).catch((e: Error) => ({ valores: new Map(), erros: [] as string[], motivo: e.message }));

    const chave = (c: string) => String(c).replace(/^0+/, "");
    const porCodigo: Record<string, number> = {};
    const semPeso: string[] = [];
    let total = 0;
    for (const i of itens) {
      const reg = res.valores.get(chave(i.codigo)) as
        | { pesoLiquido?: number; pesoBruto?: number }
        | undefined;
      const linha = Number(reg?.pesoLiquido ?? 0) || Number(reg?.pesoBruto ?? 0);
      if (linha > 0) {
        porCodigo[i.codigo] = Math.round(linha * 1000) / 1000;
        total += linha;
      } else semPeso.push(i.codigo);
    }
    const msgs = [...res.erros, ...(res.motivo ? [res.motivo] : [])];
    return {
      total: Math.round(total * 1000) / 1000,
      porCodigo,
      semPeso,
      erro: msgs.length ? msgs.join(" | ") : null,
    };
  });
