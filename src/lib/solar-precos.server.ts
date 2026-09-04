/**
 * Preços do 2P Solar por tabela de preço.
 *
 * A fonte oficial e ÚNICA é a simulação de preços do SAP (`ZNFE_OV_SIMULAR`),
 * a mesma usada na cotação de frete. Quando o SAP não devolve valor para um
 * item, o portal NÃO completa com o preço sugerido do catálogo: o item volta
 * zerado e entra em `fallback` para ser avisado/bloqueado na tela e no
 * salvamento. Preço genérico virando preço de venda é erro comercial.
 */

import { simularSap } from "./sap-precos.server";

export type PrecoItem = { codigo: string; quantidade: number };

export type PrecoResultado = {
  /** Valor unitário por código de material (0 quando o SAP não precificou). */
  precos: Record<string, number>;
  /** Códigos que o SAP não precificou — nunca preenchidos com preço de catálogo. */
  fallback: string[];
  /** Mensagens do SAP que explicam preços zerados (CNPJ sem parceiro, etc). */
  avisos: string[];
  /**
   * Alíquotas REAIS por código de material, em fração (0,04 = 4%), tal como o
   * SAP devolveu na simulação. É a fonte única do imposto por item mostrado na
   * prévia, no resumo, no PDF e na reimpressão.
   */
  aliquotas: Record<string, { ipi: number | null; icms: number | null; pisCofins: number | null }>;
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
    /** Tipo de ordem (ZV2P / ZC2P / VBON) — muda condição de preço no SAP. */
    tipoOv?: string;
    /**
     * Kit fotovoltaico: venda com isenção de ICMS e IPI. Vale para TODOS os
     * itens da proposta — o preço passa a ser VALOR_LIQUIDO + PIS + COFINS.
     */
    kitFotovoltaico?: boolean;
    /** CNPJ da revenda (CNPJ_CI) quando a simulação usa o cliente fake da UF. */
    empresaCnpj?: string;
    sugeridos?: Record<string, number>;
    /** Quando informado, cada tentativa no SAP entra na auditoria da proposta. */
    auditoria?: import("./proposta-auditoria.server").AuditoriaContexto & { etapa?: string };
  },
): Promise<PrecoResultado> {
  const precos: Record<string, number> = {};
  const fallback: string[] = [];
  const avisos: string[] = [];
  const aliquotas: PrecoResultado["aliquotas"] = {};
  if (!itens.length) return { precos, fallback, avisos, aliquotas };

  /** Valor unitário por código, preenchido pela primeira filial que precificar. */
  const unitario = new Map<string, number>();
  let pendentes = itens;

  for (const filial of FILIAIS) {
    if (!pendentes.length) break;
    let sim = new Map<
      string,
      {
        valor: number | null;
        valorSemIcmsIpi?: number | null;
        aliqIpi?: number | null;
        aliqIcms?: number | null;
        aliqPisCofins?: number | null;
      }
    >();
    const tentativaItens = pendentes.map((i) => ({ codigo: i.codigo, quantidade: i.quantidade }));
    const iniciado = Date.now();
    const errosTentativa: string[] = [];
    let respostaAudit: Record<string, unknown> = {};
    try {
      const r = await simularSap(tentativaItens, {
        ...(opts.documento ? { documento: opts.documento } : {}),
        listaPreco: opts.listaPreco || "01",
        ...(opts.tipoOv ? { tipoOv: opts.tipoOv } : {}),
        ...(opts.empresaCnpj ? { empresaCnpj: opts.empresaCnpj } : {}),
        filial,
      });
      sim = r.valores as unknown as typeof sim;
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
      const reg = sim.get(codigo);
      // Kit: usa o valor sem ICMS/IPI; se o SAP não devolveu os tributos,
      // cai para o valor cheio (nunca precifica zerado por falta do campo).
      const valorLinha = opts.kitFotovoltaico
        ? (reg?.valorSemIcmsIpi ?? reg?.valor ?? null)
        : (reg?.valor ?? null);
      if (reg && aliquotas[codigo] === undefined && (reg.aliqIpi != null || reg.aliqIcms != null || reg.aliqPisCofins != null))
        aliquotas[codigo] = {
          // Kit fotovoltaico é isento de ICMS e IPI — o imposto exibido tem que
          // acompanhar o preço praticado.
          ipi: opts.kitFotovoltaico ? 0 : (reg.aliqIpi ?? null),
          icms: opts.kitFotovoltaico ? 0 : (reg.aliqIcms ?? null),
          pisCofins: reg.aliqPisCofins ?? null,
        };
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
      // Sem preço do SAP o item fica zerado de propósito: quem chama precisa
      // avisar/bloquear. Nunca completar com `preco_sugerido` do catálogo.
      precos[codigo] = 0;
      fallback.push(codigo);
    }
  }
  if (fallback.length) {
    const aviso = `O SAP não devolveu preço para: ${[...new Set(fallback)].join(", ")}. Os valores NÃO foram completados com o preço de catálogo — informe o valor manualmente ou corrija a condição de preço no SAP.`;
    if (!avisos.includes(aviso)) avisos.push(aviso);
  }
  return { precos, fallback, avisos, aliquotas };
}



