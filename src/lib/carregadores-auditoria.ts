// ============================================================================
// Auditoria de cálculo — 2P Carregadores
// Reproduz, passo a passo, o mesmo motor de src/lib/carregadores.ts e carregadores-comissao.ts,
// expondo cada valor intermediário (ICMS, DIFAL, ICMS-ST, impostos, CMV e
// comissão) por item e no total, junto da versão das regras utilizadas.
// ============================================================================

import {
  calcularCarregadores,
  calcularDifal,
  finalidadeGeraDifal,
  pctComissaoPorCmv,
  type CarregadoresConfig,
  type CarregadoresNcm,
  type CarregadoresProduct,
  type CarregadoresState,
  type CarregadoresUf,
} from "./carregadores";
import { VALOR_INDICACAO, ratearComissao, type Rateio, type Regime } from "./carregadores-comissao";

/** Versão da política fiscal/comercial implementada no motor. */
export const REGRAS_VERSAO = "2026.07";

export type PassoCalculo = {
  rotulo: string;
  formula: string;
  /** Substituição numérica da fórmula (memória de cálculo). */
  substituicao: string;
  valor: number;
  tipo: "moeda" | "percentual";
  nota?: string;
};

export type AuditoriaItem = {
  key: string;
  produto: string;
  qtd: number;
  valorUnitario: number;
  ncm: { codigo: string; descricao: string; origem: "NCM" | "Config (fallback)" } & {
    ipi: number;
    pisCofins: number;
    inter: number;
    temSt: boolean;
    geraDifal: boolean;
  };
  passos: PassoCalculo[];
  bruto: number;
  semIpi: number;
  ipi: number;
  icms: number;
  pisCofins: number;
  difalBase: number;
  difal: number;
  custo: number;
};

export type AuditoriaProposta = {
  versao: string;
  geradoEm: string;
  uf: { uf: string; nome: string; aliqInterna: number; fcp: number; convenioSt: boolean };
  contribuinte: boolean;
  itens: AuditoriaItem[];
  totais: PassoCalculo[];
  comissao: PassoCalculo[];
  rateio: Rateio;
  parametros: { rotulo: string; valor: string }[];
  alertas: string[];
};

const brl = (v: number) =>
  (isFinite(v) ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) =>
  `${(isFinite(v) ? v * 100 : 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;

export function auditarProposta(args: {
  state: CarregadoresState;
  produtos: CarregadoresProduct[];
  ufs: CarregadoresUf[];
  config: CarregadoresConfig;
  ncms: CarregadoresNcm[];
  regimeVendedor?: Regime;
}): AuditoriaProposta {
  const { state, produtos, ufs, config, ncms } = args;
  const r = calcularCarregadores(state, produtos, ufs, config, ncms);
  const uf = ufs.find((u) => u.uf === state.uf);
  const interna = uf?.aliq_interna ?? 0.18;
  const fcp = uf?.fcp ?? 0;
  const alertas: string[] = [];

  const itens: AuditoriaItem[] = state.itens
    .filter((i) => i.produtoId)
    .map((it) => {
      const prod = produtos.find((p) => p.id === it.produtoId);
      const ncm = prod?.ncm_id ? ncms.find((n) => n.id === prod.ncm_id) : undefined;
      const ipiR = ncm?.ipi ?? config.ipi;
      const pcR = ncm?.pis_cofins ?? config.pis_cofins;
      const interR = ncm?.aliq_inter ?? config.aliq_inter;
      const geraDifal = (ncm ? ncm.gera_difal : true) && finalidadeGeraDifal(state.finalidadeUso);
      const motivoSemDifal = finalidadeGeraDifal(state.finalidadeUso)
        ? "NCM não gera DIFAL"
        : "Industrialização não gera DIFAL";
      const temSt = !!ncm?.tem_st;

      const qtd = it.qtd || 0;
      const bruto = (it.valor || 0) * qtd;
      const semIpi = bruto / (1 + ipiR);
      const ipi = bruto - semIpi;
      const icms = semIpi * interR;
      const pisCofins = (semIpi - icms) * pcR;
      const d = geraDifal ? calcularDifal(bruto, interna, fcp, interR) : { base: 0, valor: 0, pct: 0 };
      const custo = (prod?.custo || 0) * qtd;

      if (!ncm) alertas.push(`"${prod?.nome ?? "Item"}" sem NCM vinculado — usadas as alíquotas padrão da configuração.`);
      if (temSt && uf?.convenio_st)
        alertas.push(
          `"${prod?.nome ?? "Item"}" possui ICMS-ST e ${uf.nome} tem convênio de ST — confirmar recolhimento no faturamento.`,
        );

      const passos: PassoCalculo[] = [
        {
          rotulo: "Valor bruto do item (com IPI)",
          formula: "Valor unitário × Quantidade",
          substituicao: `${brl(it.valor || 0)} × ${qtd}`,
          valor: bruto,
          tipo: "moeda",
        },
        {
          rotulo: "Base sem IPI",
          formula: "Bruto ÷ (1 + IPI)",
          substituicao: `${brl(bruto)} ÷ (1 + ${pct(ipiR)})`,
          valor: semIpi,
          tipo: "moeda",
        },
        {
          rotulo: "IPI",
          formula: "Bruto − Base sem IPI",
          substituicao: `${brl(bruto)} − ${brl(semIpi)}`,
          valor: ipi,
          tipo: "moeda",
        },
        {
          rotulo: "ICMS na NF",
          formula: "Base sem IPI × alíquota interestadual",
          substituicao: `${brl(semIpi)} × ${pct(interR)}`,
          valor: icms,
          tipo: "moeda",
          nota: "A alíquota da NF é sempre a interestadual do NCM — o DIFAL não altera este valor.",
        },
        {
          rotulo: "PIS/COFINS",
          formula: "(Base sem IPI − ICMS) × alíquota PIS/COFINS",
          substituicao: `(${brl(semIpi)} − ${brl(icms)}) × ${pct(pcR)}`,
          valor: pisCofins,
          tipo: "moeda",
        },
        {
          rotulo: "Base do DIFAL (por dentro)",
          formula: geraDifal ? "Bruto ÷ (1 − (interna + FCP))" : motivoSemDifal,
          substituicao: geraDifal ? `${brl(bruto)} ÷ (1 − (${pct(interna)} + ${pct(fcp)}))` : "—",
          valor: d.base,
          tipo: "moeda",
        },
        {
          rotulo: "DIFAL",
          formula: geraDifal ? "Base × (interna + FCP − interestadual)" : motivoSemDifal,
          substituicao: geraDifal
            ? `${brl(d.base)} × (${pct(interna)} + ${pct(fcp)} − ${pct(interR)})`
            : "—",
          valor: d.valor,
          tipo: "moeda",
          nota:
            state.finalidadeUso === "revenda"
              ? "Revenda: DIFAL apenas informativo — não afeta a receita líquida nem a margem."
              : state.contribuinte
                ? "Cliente contribuinte: DIFAL informativo, recolhido pelo destinatário."
                : "Cliente não contribuinte: DIFAL é custo adicional no cabeçalho da NF (absorvido pela 2P).",
        },
        {
          rotulo: "ICMS-ST",
          formula: temSt ? "Regra de ST do NCM aplicável na UF de destino" : "NCM sem ICMS-ST",
          substituicao: temSt
            ? uf?.convenio_st
              ? `${uf.nome} possui convênio de ST — apurar no faturamento`
              : `${uf?.nome ?? state.uf} sem convênio de ST — sem retenção na origem`
            : "—",
          valor: 0,
          tipo: "moeda",
        },
        {
          rotulo: "Custo do item",
          formula: "Custo unitário × Quantidade",
          substituicao: `${brl(prod?.custo || 0)} × ${qtd}`,
          valor: custo,
          tipo: "moeda",
        },
      ];

      return {
        key: it.key,
        produto: prod?.nome ?? "—",
        qtd,
        valorUnitario: it.valor || 0,
        ncm: {
          codigo: ncm?.codigo ?? "—",
          descricao: ncm?.descricao ?? "Sem NCM vinculado",
          origem: ncm ? "NCM" : "Config (fallback)",
          ipi: ipiR,
          pisCofins: pcR,
          inter: interR,
          temSt,
          geraDifal,
        },
        passos,
        bruto,
        semIpi,
        ipi,
        icms,
        pisCofins,
        difalBase: d.base,
        difal: d.valor,
        custo,
      };
    });

  const totais: PassoCalculo[] = [
    {
      rotulo: "Valor dos itens",
      formula: "Σ valor bruto dos itens",
      substituicao: itens.map((i) => brl(i.bruto)).join(" + ") || "—",
      valor: r.valorItens,
      tipo: "moeda",
    },
    {
      rotulo: "Frete",
      formula: `Modalidade ${state.freteMod}`,
      substituicao: brl(state.freteValor || 0),
      valor: state.freteValor || 0,
      tipo: "moeda",
    },
    {
      rotulo: "Total da proposta",
      formula: "Itens + Frete",
      substituicao: `${brl(r.valorItens)} + ${brl(state.freteValor || 0)}`,
      valor: r.valorTotalProposta,
      tipo: "moeda",
    },
    { rotulo: "IPI total", formula: "Σ IPI dos itens", substituicao: "—", valor: r.ipiValor, tipo: "moeda" },
    { rotulo: "ICMS total", formula: "Σ ICMS dos itens", substituicao: "—", valor: r.icms, tipo: "moeda" },
    {
      rotulo: "PIS/COFINS total",
      formula: "Σ PIS/COFINS dos itens",
      substituicao: "—",
      valor: r.pisCofins,
      tipo: "moeda",
    },
    {
      rotulo: r.difalAbs > 0 ? "DIFAL absorvido pela 2P" : "DIFAL informativo",
      formula: "Σ DIFAL dos itens",
      substituicao: brl(r.difalAbs > 0 ? r.difalAbs : r.difalEstimado),
      valor: r.difalAbs > 0 ? r.difalAbs : r.difalEstimado,
      tipo: "moeda",
    },
    {
      rotulo: "Receita líquida",
      formula: "Itens − IPI − ICMS − PIS/COFINS − DIFAL absorvido",
      substituicao: `${brl(r.valorItens)} − ${brl(r.ipiValor)} − ${brl(r.icms)} − ${brl(r.pisCofins)} − ${brl(r.difalAbs)}`,
      valor: r.rl,
      tipo: "moeda",
    },
    {
      rotulo: "Custo total (CMV R$)",
      formula: "Σ custo dos itens",
      substituicao: itens.map((i) => brl(i.custo)).join(" + ") || "—",
      valor: r.custoTotal,
      tipo: "moeda",
    },
    {
      rotulo: "CMV %",
      formula: "Custo ÷ Receita líquida",
      substituicao: `${brl(r.custoTotal)} ÷ ${brl(r.rl)}`,
      valor: r.cmv,
      tipo: "percentual",
      nota: `Limite da política: ${pct(config.cmv_max)}${r.cmvExcedido ? " — EXCEDIDO" : ""}`,
    },
    {
      rotulo: "Margem bruta",
      formula: "Receita líquida − Custo",
      substituicao: `${brl(r.rl)} − ${brl(r.custoTotal)}`,
      valor: r.mb,
      tipo: "moeda",
    },
    {
      rotulo: "MB %",
      formula: "Margem bruta ÷ Valor dos itens",
      substituicao: `${brl(r.mb)} ÷ ${brl(r.valorItens)}`,
      valor: r.mbPct,
      tipo: "percentual",
    },
  ];

  const x = r.cmv * 100;
  const rateio = ratearComissao({
    venda: r.valorItens,
    comissaoTotal: r.comValor,
    cmv: r.cmv,
    regimeVendedor: args.regimeVendedor ?? "CLT",
    params: {
      cmvMax: config.cmv_max,
      pctGerente: config.pct_gerente,
      valorIndicacao: VALOR_INDICACAO,
      fatorClt: config.fator_clt,
    },
  });

  const comissao: PassoCalculo[] = [
    {
      rotulo: "% comissão total (curva sigmoide)",
      formula: "(4 + 7,4 ÷ (1 + e^(2,05 × (CMV% − 57,8)))) ÷ 100",
      substituicao: `(4 + 7,4 ÷ (1 + e^(2,05 × (${x.toFixed(2)} − 57,8)))) ÷ 100`,
      valor: r.custoTotal > 0 ? pctComissaoPorCmv(r.cmv) : 0,
      tipo: "percentual",
    },
    {
      rotulo: "Comissão total (custo da empresa)",
      formula: "Margem bruta × % comissão total",
      substituicao: `${brl(r.mb)} × ${pct(r.comPct)}`,
      valor: r.comValor,
      tipo: "moeda",
      nota: r.cmvExcedido ? "Zerada: CMV acima do limite exige aprovação da diretoria." : undefined,
    },
    {
      rotulo: "Custo gerente (fixo)",
      formula: "Venda × % gerente",
      substituicao: `${brl(r.valorItens)} × ${pct(config.pct_gerente)}`,
      valor: r.valorItens * config.pct_gerente,
      tipo: "moeda",
    },
    {
      rotulo: "Custo indicação (fixo)",
      formula: "Valor fixo por venda",
      substituicao: brl(r.valorItens > 0 ? VALOR_INDICACAO : 0),
      valor: r.valorItens > 0 ? VALOR_INDICACAO : 0,
      tipo: "moeda",
    },
    {
      rotulo: "Custo do vendedor (saldo)",
      formula: "Comissão total − gerente − indicação",
      substituicao: `${brl(rateio.comissaoTotal)} − ${brl(r.valorItens * config.pct_gerente)} − ${brl(r.valorItens > 0 ? VALOR_INDICACAO : 0)}`,
      valor: rateio.custoVendedor,
      tipo: "moeda",
    },
  ];

  if (r.cmvExcedido)
    alertas.push(`CMV de ${pct(r.cmv)} acima do limite de ${pct(config.cmv_max)} — comissão zerada e orçamento bloqueado.`);
  if (r.mbPct < config.politica_mb_min)
    alertas.push(`MB% de ${pct(r.mbPct)} abaixo da política mínima de ${pct(config.politica_mb_min)}.`);

  return {
    versao: REGRAS_VERSAO,
    geradoEm: new Date().toISOString(),
    uf: {
      uf: state.uf,
      nome: uf?.nome ?? state.uf,
      aliqInterna: interna,
      fcp,
      convenioSt: !!uf?.convenio_st,
    },
    contribuinte: state.contribuinte,
    itens,
    totais,
    comissao,
    rateio,
    parametros: [
      { rotulo: "Versão das regras", valor: REGRAS_VERSAO },
      { rotulo: "IPI padrão (fallback)", valor: pct(config.ipi) },
      { rotulo: "PIS/COFINS padrão (fallback)", valor: pct(config.pis_cofins) },
      { rotulo: "Interestadual padrão", valor: pct(config.aliq_inter) },
      { rotulo: "CMV máximo", valor: pct(config.cmv_max) },
      { rotulo: "MB mínima", valor: pct(config.politica_mb_min) },
      { rotulo: "% gerente", valor: pct(config.pct_gerente) },
      { rotulo: "Indicação (fixo)", valor: brl(VALOR_INDICACAO) },
      { rotulo: "Fator CLT", valor: config.fator_clt.toLocaleString("pt-BR") },
      { rotulo: "ICMS interno da UF", valor: pct(interna) },
      { rotulo: "FCP da UF", valor: pct(fcp) },
    ],
    alertas: Array.from(new Set(alertas)),
  };
}
