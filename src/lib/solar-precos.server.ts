/**
 * Preços do 2P Solar por tabela de preço.
 *
 * A fonte oficial é a simulação de preços do SAP (`ZNFE_OV_SIMULAR`), a mesma
 * usada na cotação de frete. Quando o SAP não devolve valor para um item, o
 * portal cai para o preço sugerido do catálogo (`sap_produtos.preco_sugerido`).
 */

import { simularPrecosSap } from "./sap-precos.server";

export type PrecoItem = { codigo: string; quantidade: number };

export type PrecoResultado = {
  /** Valor unitário por código de material. */
  precos: Record<string, number>;
  /** Códigos cujo preço veio do catálogo (SAP não respondeu). */
  fallback: string[];
};

const norm = (c: string) => String(c ?? "").trim().replace(/^0+(?=\d)/, "");
const money2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

export async function precosSolar(
  itens: PrecoItem[],
  opts: { documento?: string; listaPreco?: string; sugeridos?: Record<string, number> },
): Promise<PrecoResultado> {
  const precos: Record<string, number> = {};
  const fallback: string[] = [];
  if (!itens.length) return { precos, fallback };

  let sim = new Map<string, { valor: number | null }>();
  try {
    sim = (await simularPrecosSap(
      itens.map((i) => ({ codigo: i.codigo, quantidade: i.quantidade })),
      {
        ...(opts.documento ? { documento: opts.documento } : {}),
        listaPreco: opts.listaPreco || "01",
      },
    )) as unknown as Map<string, { valor: number | null }>;
  } catch {
    sim = new Map();
  }

  for (const item of itens) {
    const codigo = norm(item.codigo);
    const linha = sim.get(codigo);
    const qtd = Math.max(1, Number(item.quantidade) || 1);
    const valorLinha = linha?.valor ?? null;
    if (valorLinha && valorLinha > 0) {
      precos[codigo] = money2(valorLinha / qtd);
    } else {
      precos[codigo] = money2(opts.sugeridos?.[codigo] ?? 0);
      fallback.push(codigo);
    }
  }
  return { precos, fallback };
}
