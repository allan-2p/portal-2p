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
 * é a que possui a condição de preço daquele item. A lista pode ser ajustada
 * por SAP_FILIAIS (ex.: "9802,9801"); filiais recusadas pelo SAP ("código da
 * filial X é inválido") são apenas ignoradas — nunca bloqueiam a proposta.
 */
const FILIAIS = (process.env["SAP_FILIAIS"] ?? "9802")
  .split(",")
  .map((f) => f.trim())
  .filter(Boolean);

/** Mensagem de filial inexistente no SAP — tentativa descartada, sem bloquear. */
const filialInvalida = (m: string) => /filial\s+\d+\s+(é|e)\s+inv[áa]lid/i.test(m);


export async function precosSolar(
  itens: PrecoItem[],
  opts: {
    documento?: string;
    listaPreco?: string;
    sugeridos?: Record<string, number>;
    /** Quando informado, cada tentativa no SAP entra na auditoria da proposta. */
    auditoria?: import("./proposta-auditoria.server").AuditoriaContexto & { etapa?: string };
  },
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
    const tentativaItens = pendentes.map((i) => ({ codigo: i.codigo, quantidade: i.quantidade }));
    const iniciado = Date.now();
    const errosTentativa: string[] = [];
    let respostaAudit: Record<string, unknown> = {};
    try {
      const r = await simularSap(tentativaItens, {
        ...(opts.documento ? { documento: opts.documento } : {}),
        listaPreco: opts.listaPreco || "01",
        filial,
      });
      sim = r.valores as unknown as Map<string, { valor: number | null }>;
      for (const m of [...r.erros, ...(r.motivo ? [r.motivo] : [])]) {
        errosTentativa.push(m);
        if (!filialInvalida(m) && !avisos.includes(m)) avisos.push(m);
      }

      respostaAudit = {
        valores: Object.fromEntries([...sim.entries()].map(([k, v]) => [k, v])),
        erros: r.erros,
        motivo: r.motivo ?? null,
      };
    } catch (e) {
      const m = `Falha ao consultar preços no SAP (filial ${filial}): ${(e as Error).message}`;
      errosTentativa.push(m);
      if (!avisos.includes(m)) avisos.push(m);
      sim = new Map();
      respostaAudit = { erro: m };
    }
    if (opts.auditoria) {
      const { auditarTentativaSap } = await import("./proposta-auditoria.server");
      const { etapa = "precos", ...ctx } = opts.auditoria;
      await auditarTentativaSap(ctx, {
        etapa,
        filial,
        ...(opts.listaPreco ? { listaPreco: opts.listaPreco } : {}),
        itens: tentativaItens,
        resposta: respostaAudit,
        erros: errosTentativa,
        durationMs: Date.now() - iniciado,
      });
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


