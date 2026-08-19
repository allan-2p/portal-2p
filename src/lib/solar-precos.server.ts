/**
 * Preços do 2P Solar por tabela de preço.
 *
 * A fonte oficial é a simulação de preços do SAP (`ZNFE_OV_SIMULAR`), a mesma
 * usada na cotação de frete. Quando o SAP não devolve valor para um item, o
 * portal cai para o preço sugerido do catálogo (`sap_produtos.preco_sugerido`).
 */

import { simularSap } from "./sap-precos.server";

export type PrecoItem = { codigo: string; quantidade: number };

export type PrecoResultado = {
  /** Valor unitário por código de material. */
  precos: Record<string, number>;
  /** Códigos cujo preço veio do catálogo (SAP não respondeu). */
  fallback: string[];
  /** Mensagens do SAP que explicam preços zerados (CNPJ sem parceiro, etc). */
  avisos: string[];
};

const norm = (c: string) => String(c ?? "").trim().replace(/^0+(?=\d)/, "");
const money2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

/**
 * Filiais consultadas, na ordem de preferência.
 *
 * O SAP só devolve VALOR_LIQUIDO para o material quando a filial da simulação
 * é a que possui a condição de preço daquele item: parte do catálogo 2P Solar
 * é precificada em 9800 e parte em 9802. Consultar apenas uma filial devolvia
 * zero para a maioria dos itens.
 */
const FILIAIS = ["9800", "9802"];

export async function precosSolar(
  itens: PrecoItem[],
  opts: { documento?: string; listaPreco?: string; sugeridos?: Record<string, number> },
): Promise<PrecoResultado> {
  const precos: Record<string, number> = {};
  const fallback: string[] = [];
  const avisos: string[] = [];
  if (!itens.length) return { precos, fallback, avisos };

  /** Valor unitário por código, preenchido pela primeira filial que precificar. */
  const unitario = new Map<string, number>();
  let pendentes = itens;

  for (const filial of FILIAIS) {
    if (!pendentes.length) break;
    let sim = new Map<string, { valor: number | null }>();
    try {
      const r = await simularSap(
        pendentes.map((i) => ({ codigo: i.codigo, quantidade: i.quantidade })),
        {
          ...(opts.documento ? { documento: opts.documento } : {}),
          listaPreco: opts.listaPreco || "01",
          filial,
        },
      );
      sim = r.valores as unknown as Map<string, { valor: number | null }>;
      for (const m of [...r.erros, ...(r.motivo ? [r.motivo] : [])])
        if (!avisos.includes(m)) avisos.push(m);
    } catch (e) {
      const m = `Falha ao consultar preços no SAP (filial ${filial}): ${(e as Error).message}`;
      if (!avisos.includes(m)) avisos.push(m);
      sim = new Map();
    }
    const restantes: PrecoItem[] = [];
    for (const item of pendentes) {
      const codigo = norm(item.codigo);
      const qtd = Math.max(1, Number(item.quantidade) || 1);
      const valorLinha = sim.get(codigo)?.valor ?? null;
      if (valorLinha && valorLinha > 0) unitario.set(codigo, money2(valorLinha / qtd));
      else restantes.push(item);
    }
    pendentes = restantes;
  }

  for (const item of itens) {
    const codigo = norm(item.codigo);
    const v = unitario.get(codigo);
    if (v !== undefined && v > 0) {
      precos[codigo] = v;
    } else {
      precos[codigo] = money2(opts.sugeridos?.[codigo] ?? 0);
      fallback.push(codigo);
    }
  }
  return { precos, fallback, avisos };
}


