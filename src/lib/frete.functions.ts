import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CotarFreteData = {
  itens: { codigo: string; quantidade: number; pesoLiquido?: number; nome?: string }[];
  valorNota: number;
  destino: { uf: string; cidade: string; cep: string };
  areaRural?: boolean;
  documento?: string;
  idTransportadora?: string;
};

/** Cota o frete no Fretefy aplicando as regras comerciais da 2P. */
export const cotarFrete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CotarFreteData) => input)
  .handler(async ({ data, context }) => {
    const { cotarFreteFretefy, pesosPorCodigo } = await import("./frete.server");
    const { simularPrecosSap } = await import("./sap-precos.server");
    const { logIntegrationEvent } = await import("./integration-logs.server");
    const started = Date.now();

    const codigos = data.itens.map((i) => String(i.codigo));
    const chave = (c: string) => String(c).replace(/^0+/, "");

    // Fonte oficial do peso: PESO_LIQUIDO devolvido pela simulação de preço do
    // SAP (peso da linha). Fallback: peso unitário do catálogo de produtos.
    const [sim, pesos] = await Promise.all([
      simularPrecosSap(
        data.itens.map((i) => ({ codigo: String(i.codigo), quantidade: Number(i.quantidade || 0) })),
      ).catch(() => new Map()),
      pesosPorCodigo(codigos),
    ]);

    const origem = { peso: "catalogo" as "sap" | "catalogo" };
    const itens = data.itens.map((i) => {
      const qtd = Number(i.quantidade || 0);
      const linhaSap = Number(sim.get(chave(i.codigo))?.pesoLiquido ?? 0);
      const unitSap = linhaSap > 0 && qtd > 0 ? linhaSap / qtd : 0;
      if (unitSap > 0) origem.peso = "sap";
      const unit =
        unitSap > 0
          ? unitSap
          : Number(pesos.get(chave(i.codigo))?.peso ?? i.pesoLiquido ?? 0);
      return {
        codigo: String(i.codigo),
        nome: String(i.nome ?? ""),
        quantidade: qtd,
        pesoLiquido: unit,
      };
    });
    const cubagem = data.itens.reduce(
      (s, i) => s + Number(i.quantidade || 0) * Number(pesos.get(chave(i.codigo))?.cubagem ?? 0),
      0,
    );
    const semPeso = itens.filter((i) => !(i.pesoLiquido > 0)).map((i) => i.nome || i.codigo);

    try {
      if (semPeso.length)
        throw new Error(
          `Produtos sem peso bruto cadastrado: ${semPeso.join(", ")}. Cadastre o peso (kg) em Gestão de Produtos para cotar o frete corretamente.`,
        );

      const r = await cotarFreteFretefy({
        itens,
        valorNota: Number(data.valorNota || 0),
        destino: data.destino,
        cubagem,
        tipoEntrega: "S",
        ...(data.areaRural !== undefined ? { areaRural: data.areaRural } : {}),
        ...(data.documento !== undefined ? { documento: data.documento } : {}),
        ...(data.idTransportadora !== undefined ? { idTransportadora: data.idTransportadora } : {}),
      });
      await logIntegrationEvent({
        slug: "fretefy",
        level: "info",
        event: "cotacao",
        message: `Cotação concluída: ${r.opcoes.length} opção(ões) para ${data.destino.cidade}/${data.destino.uf}. Peso ${r.peso} kg (origem: ${origem.peso === "sap" ? "simulação SAP" : "catálogo de produtos"}).`,
        durationMs: Date.now() - started,
        actorId: context.userId,
        actorEmail: (context.claims as { email?: string } | null)?.email ?? null,
      });
      return { ...r, origemPeso: origem.peso };

    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao cotar o frete.";
      await logIntegrationEvent({
        slug: "fretefy",
        level: "error",
        event: "cotacao",
        message: msg,
        durationMs: Date.now() - started,
        actorId: context.userId,
        actorEmail: (context.claims as { email?: string } | null)?.email ?? null,
      });
      throw new Error(msg);
    }
  });

/** Diagnóstico do Fretefy usado no painel de Integrações. */
export const diagnosticarFretefy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cep: string; cidade: string; uf: string; valorNota: number; peso: number }) => input)
  .handler(async ({ data, context }) => {
    const { requireAdminFeature } = await import("@/lib/guards.server");
    await requireAdminFeature(context, "admin.integracoes", "editar");

    const { cotarFreteFretefy } = await import("./frete.server");
    const started = Date.now();
    try {
      const r = await cotarFreteFretefy({
        itens: [{ codigo: "000000000", quantidade: 1, pesoLiquido: Number(data.peso || 1) }],
        valorNota: Number(data.valorNota || 1000),
        destino: { uf: data.uf, cidade: data.cidade, cep: data.cep },
        peso: Number(data.peso || 1),
        tipoEntrega: "S",
      });
      return {
        ok: true as const,
        durationMs: Date.now() - started,
        opcoes: r.opcoes,
        peso: r.peso,
        valorNotaFinal: r.valorNotaFinal,
        erro: null as string | null,
      };
    } catch (e) {
      return {
        ok: false as const,
        durationMs: Date.now() - started,
        opcoes: [],
        peso: Number(data.peso || 1),
        valorNotaFinal: Number(data.valorNota || 0),
        erro: e instanceof Error ? e.message : "Erro desconhecido.",
      };
    }
  });
