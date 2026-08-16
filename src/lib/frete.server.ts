/**
 * Orquestração da cotação de frete (Fretefy) com as regras da 2P.
 *
 * Mantido fora do módulo de server functions para não quebrar o split do
 * TanStack Start (helpers irmãos de createServerFn somem no bundle do worker).
 */

import { calcularFrete } from "./fretefy-client.server";
import {
  ORIGEM,
  aplicarRegras,
  detectarTrilho,
  filtraFretes,
  normalizarCodigo,
  type ContextoFrete,
  type OpcaoBruta,
  type OpcaoFrete,
} from "./fretefy-rules.server";

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export type CotarFreteInput = {
  itens: { codigo: string; quantidade: number; pesoLiquido?: number; nome?: string }[];
  valorNota: number;
  destino: { uf: string; cidade: string; cep: string };
  peso?: number;
  tipoEntrega: "S" | "D" | "G" | "N";
  areaRural?: boolean;
  documento?: string;
  idTransportadora?: string;
  freteDedicado?: number;
};

export type CotarFreteResultado = {
  opcoes: OpcaoFrete[];
  escolhida: number;
  peso: number;
  valorNotaFinal: number;
  trilho: string | null;
};

export async function cotarFreteFretefy(data: CotarFreteInput): Promise<CotarFreteResultado> {
  // Dedicado: não cota, usa o valor informado manualmente.
  if (data.tipoEntrega === "D") {
    const v = round2(data.freteDedicado ?? 0);
    return {
      opcoes: [
        {
          id_transportadora: "dedicado",
          transportadora: "Frete dedicado",
          transportadoraDocumento: "",
          total: v,
          prazo: 2,
          ajustes: ["Valor informado manualmente"],
        },
      ],
      escolhida: 0,
      peso: 0,
      valorNotaFinal: round2(data.valorNota),
      trilho: null,
    };
  }

  // Peso: recalcula pela soma dos pesos líquidos quando vier ≤ 1 kg.
  let peso = Number(data.peso ?? 1);
  if (peso <= 1) {
    const soma = data.itens.reduce(
      (s, i) => s + Number(i.quantidade || 0) * Number(i.pesoLiquido ?? 0),
      0,
    );
    if (soma > 0) peso = round2(soma);
  }

  const codigosCarrinho = data.itens.map((i) => normalizarCodigo(i.codigo));
  const nomesCarrinho = data.itens.map((i) => String(i.nome ?? ""));
  const codigoTrilho = detectarTrilho(codigosCarrinho);

  const destino: Record<string, unknown> = {
    uf: data.destino.uf,
    cidade: data.destino.cidade,
    cep: (data.destino.cep ?? "").replace(/\D/g, ""),
    cubagem: 0,
    peso,
  };
  if (codigoTrilho) destino["codigoProdutos"] = [codigoTrilho];

  const body: Record<string, unknown> = {
    modalidade: 3,
    paradas: [],
    qntEntregas: 1,
    valorNota: round2(data.valorNota),
    origem: { ...ORIGEM, cubagem: 0, peso },
    destino,
  };

  const ctx: ContextoFrete = {
    codigosCarrinho,
    nomesCarrinho,
    documento: data.documento,
    tipoEntrega: data.tipoEntrega,
    areaRural: data.areaRural,
  };

  let opcoes: OpcaoFrete[] = [];
  // Duas passadas: a segunda recota com o valor da nota "grossado" pelo frete.
  for (let pass = 0; pass < 2; pass++) {
    const res = await calcularFrete(body);
    if (res.status === 401 || res.status === 403)
      throw new Error("Token do Fretefy inválido ou sem permissão.");
    if (res.status === 404) throw new Error("Não foi possível calcular o frete.");
    if (res.status >= 500) throw new Error("Erro interno do Fretefy ao calcular o frete.");

    opcoes = (Array.isArray(res.json) ? (res.json as OpcaoBruta[]) : [])
      .filter((o) =>
        filtraFretes(codigosCarrinho, String(o.transportadoraDocumento ?? ""), nomesCarrinho),
      )
      .map((o) => aplicarRegras(o, ctx))
      .sort((a, b) => a.total - b.total);

    if (opcoes.length === 0)
      throw new Error("Nenhuma transportadora disponível para o CEP informado.");
    if (pass === 0)
      body["valorNota"] = round2(Number(body["valorNota"]) + (opcoes[0]?.total ?? 0));
  }

  let escolhida = 0;
  if (data.idTransportadora) {
    const i = opcoes.findIndex((o) => o.id_transportadora === data.idTransportadora);
    if (i >= 0) escolhida = i;
  }

  return {
    opcoes,
    escolhida,
    peso,
    valorNotaFinal: Number(body["valorNota"]),
    trilho: codigoTrilho,
  };
}

/** Busca o peso líquido unitário dos itens no espelho de containers do SAP. */
export async function pesosLiquidosPorCodigo(codigos: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (!codigos.length) return mapa;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("containers")
      .select("material, n_weight_un")
      .in("material", codigos);
    for (const row of (data ?? []) as { material: string; n_weight_un: number | null }[]) {
      const peso = Number(row.n_weight_un ?? 0);
      const chave = normalizarCodigo(String(row.material));
      if (peso > 0 && !mapa.has(chave)) mapa.set(chave, peso);
    }
  } catch {
    // Sem espelho de estoque a cotação segue com o peso informado.
  }
  return mapa;
}
