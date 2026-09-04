/**
 * Snapshot fiscal das propostas Solar já salvas.
 *
 * Propostas gravadas antes do snapshot (`aliq_ipi`/`aliq_icms`/
 * `aliq_pis_cofins` por item) imprimiam "—" no lugar do imposto. Aqui o portal
 * refaz a simulação oficial do SAP (`ZNFE_OV_SIMULAR`) com os mesmos parâmetros
 * da proposta, grava as alíquotas nos itens e devolve os itens atualizados —
 * assim prévia, PDF e reimpressão passam a mostrar o imposto real.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Row = Record<string, any>;

const normCod = (c: unknown) => String(c ?? "").trim().replace(/^0+(?=\d)/, "");

const temSnapshot = (i: Row) =>
  i["aliq_ipi"] != null || i["aliq_icms"] != null || i["aliq_pis_cofins"] != null;

export const garantirAliquotasProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .handler(async ({ data }): Promise<{ itens: Row[] | null }> => {
    if (!data.id) return { itens: null };
    const repo = await import("./propostas-db.server");
    const p = await repo.getProposta(data.id);
    if (!p) return { itens: null };
    if (String(p["organizacao"] ?? "").toLowerCase() !== "solar") return { itens: null };

    const itens = (Array.isArray(p["itens"]) ? p["itens"] : []) as Row[];
    if (!itens.length || itens.every(temSnapshot)) return { itens: null };

    const totais = (p["totais"] ?? {}) as Row;
    const fat = (p["faturamento"] ?? {}) as Row;
    const documento = String(fat["doc"] ?? p["cliente_doc"] ?? "").replace(/\D/g, "");
    const contribuinte = fat["contribuinte"] ?? p["contribuinte"];

    const { tpOvDoPedido } = await import("./sap-tp-ov");
    const { precosSolar } = await import("./solar-precos.server");

    const { aliquotas } = await precosSolar(
      itens.map((i) => ({ codigo: String(i["codigo"] ?? ""), quantidade: Number(i["qtd"]) || 1 })),
      {
        ...(documento ? { documento } : {}),
        listaPreco: /^\d{2}$/.test(String(totais["listaPreco"])) ? String(totais["listaPreco"]) : "01",
        tipoOv: tpOvDoPedido(String(p["tipo_nf"] ?? ""), contribuinte === true),
        kitFotovoltaico: p["kit_fotovoltaico"] === true || totais["ehKit"] === true,
      },
    );

    const novos = itens.map((i) => {
      const a = aliquotas[normCod(i["codigo"])];
      if (!a) return i;
      return {
        ...i,
        aliq_ipi: i["aliq_ipi"] ?? a.ipi ?? null,
        aliq_icms: i["aliq_icms"] ?? a.icms ?? null,
        aliq_pis_cofins: i["aliq_pis_cofins"] ?? a.pisCofins ?? null,
      };
    });

    if (!novos.some(temSnapshot)) return { itens: null };
    await repo.atualizarProposta(data.id, { itens: novos });
    return { itens: novos };
  });
