import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pltypDaTabela } from "@/lib/sap-clientes-map";
import { contribuinteDoFaturamento, documentoDaSimulacao, tpOvDoPedido } from "@/lib/sap-tp-ov";

export type PrecoSolarInput = {
  itens: { codigo: string; quantidade: number }[];
  documento: string;
  listaPreco: string;
  tipoOv: string;
  /** Kit fotovoltaico: preço sem ICMS/IPI. */
  kitFotovoltaico: boolean;
  /** Faturamento ao cliente final (não cadastrado no SAP) — usa cliente fake. */
  faturarClienteFinal: boolean;
  /** UF do faturamento (define o cliente fake usado na simulação). */
  ufFaturamento: string;
  /** Cliente final é contribuinte com CNPJ (ZV2P) — define fake CNPJ x CPF. */
  finalContribuinte: boolean;
  /** Triangulação não usa cliente fake (regra da plataforma antiga). */
  triangulacao: boolean;
  /** Documento do cliente da proposta (revenda) — vira CNPJ_CI no envelope. */
  clienteDoc: string;
};

function validar(input: unknown): PrecoSolarInput {
  const i = (input ?? {}) as any;
  const itens = (Array.isArray(i.itens) ? i.itens : [])
    .filter((x: any) => x && x.codigo)
    .map((x: any) => ({
      codigo: String(x.codigo),
      quantidade: Math.max(1, Number(x.quantidade) || 1),
    }));
  // A NF sai contra o parceiro faturado: quando o faturamento é ao cliente
  // final, o preço tem que ser simulado com o documento e o TP_OV DELE — os
  // impostos mudam (ex.: sem IE o IPI entra na base do ICMS). A tabela (PLTYP)
  // continua sendo a do cliente da proposta.
  const faturamento = (i.faturamento ?? null) as
    | { doc?: unknown; contribuinte?: unknown; uf?: unknown }
    | null;
  const clienteDoc = String(i.documento ?? "");
  const finalContribuinte = contribuinteDoFaturamento({
    contribuinte: i.contribuinte === true,
    faturarClienteFinal: i.faturarClienteFinal === true,
    faturamento,
    clienteDoc,
  });
  return {
    faturarClienteFinal: i.faturarClienteFinal === true,
    ufFaturamento: String(faturamento?.uf ?? i.uf ?? "").trim().toUpperCase(),
    finalContribuinte,
    triangulacao: String(i.tipoNf ?? "").toLowerCase().startsWith("triangul"),
    clienteDoc: clienteDoc.replace(/\D/g, ""),
    itens,
    documento: documentoDaSimulacao({
      faturarClienteFinal: i.faturarClienteFinal === true,
      faturamento,
      clienteDoc,
    }),
    // "2P-0001" (cadastro do cliente) vira "01" — o SAP só aceita 01..05 no PLTYP.
    listaPreco: pltypDaTabela(i.listaPreco),
    tipoOv: tpOvDoPedido(
      i.tipoNf,
      contribuinteDoFaturamento({
        contribuinte: i.contribuinte === true,
        faturarClienteFinal: i.faturarClienteFinal === true,
        faturamento,
        clienteDoc,
      }),
    ),
    kitFotovoltaico: i.kitFotovoltaico === true,
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

    // Cliente final não é cadastrado no SAP até o fechamento do pedido: simular
    // com o documento dele devolve "Não existe mestre de clientes para emissor
    // ordem". Como na plataforma antiga, a simulação usa o cliente fake da UF
    // do faturamento e manda a revenda em CNPJ_CI. Triangulação não usa fake.
    const { documentoSimulacaoComFake } = await import("./clientes-fakes.server");
    const { documento, empresaCnpj } = await documentoSimulacaoComFake({
      faturarClienteFinal: data.faturarClienteFinal,
      triangulacao: data.triangulacao,
      ufFaturamento: data.ufFaturamento,
      finalContribuinte: data.finalContribuinte,
      documentoReal: data.documento,
      clienteDoc: data.clienteDoc,
    });

    const { precosSolar } = await import("./solar-precos.server");
    return await precosSolar(data.itens, {
      documento,
      ...(empresaCnpj ? { empresaCnpj } : {}),
      listaPreco: data.listaPreco,
      tipoOv: data.tipoOv,
      kitFotovoltaico: data.kitFotovoltaico,
      sugeridos,
      auditoria: {
        etapa: "precos",
        // Documento efetivamente usado na simulação (fake da UF quando houver).
        doc: documento,
        unidade: "solar",
        actorId: context.userId,
        actorEmail: (context.claims as { email?: string } | null)?.email ?? null,
      },
    });
  });
