// ============================================================================
// Resumo fiscal por NCM — 2P Carregadores
// Gera o documento (HTML pronto para impressão/PDF) e o CSV com a memória de
// cálculo, valores estimados e o texto padrão de DIFAL/ICMS-ST conforme o
// cliente seja contribuinte ou não contribuinte. Serve para anexar ao processo.
// ============================================================================

import { fmtBRL, fmtPct, textoDifalContribuinte } from "./cpo";
import type { AuditoriaProposta } from "./cpo-auditoria";

export type ResumoFiscalMeta = {
  numero?: string | null;
  cliente: string;
  doc?: string | null;
  ie?: string | null;
  emitidoPor?: string | null;
  criadoEm?: string | null;
};

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Texto padrão para clientes NÃO contribuintes (DIFAL absorvido pela 2P). */
export function textoDifalNaoContribuinte(opts: {
  ufNome: string;
  aliqInterna: number;
  fcp: number;
  valor: number;
}) {
  return (
    `DIFAL: Operação destinada a consumidor final NÃO contribuinte do ICMS. O diferencial de alíquotas é de ` +
    `responsabilidade do remetente (2P) e foi calculado "por dentro" sobre o valor do item da NF-e, considerando ` +
    `ICMS interno de ${fmtPct(opts.aliqInterna)} e adicional de pobreza (FCP) de ${fmtPct(opts.fcp)} para a UF ` +
    `${opts.ufNome}, deduzida a alíquota interestadual destacada na nota. O montante de ${fmtBRL(opts.valor)} está ` +
    `absorvido no custo da operação e recolhido pela 2P, não sendo cobrado do destinatário. Valores estimados, ` +
    `sujeitos a conferência fiscal no faturamento.`
  );
}

/** Texto padrão de ICMS-ST aplicável aos NCMs com substituição tributária. */
export function textoIcmsSt(opts: { ufNome: string; convenio: boolean; ncms: string[] }) {
  if (!opts.ncms.length) return "ICMS-ST: nenhum NCM desta proposta está sujeito à substituição tributária.";
  return (
    `ICMS-ST: os NCMs ${opts.ncms.join(", ")} estão sujeitos à substituição tributária. ` +
    (opts.convenio
      ? `A UF ${opts.ufNome} possui convênio/protocolo de ST com a origem — a retenção deve ser apurada e recolhida no faturamento, conforme MVA vigente.`
      : `A UF ${opts.ufNome} não possui convênio/protocolo de ST com a origem — sem retenção na origem; eventual antecipação é de responsabilidade do destinatário.`)
  );
}

export function textosPadrao(aud: AuditoriaProposta) {
  const difal = aud.contribuinte ? aud.totais.find((t) => t.rotulo === "DIFAL informativo") : aud.totais.find((t) => t.rotulo === "DIFAL absorvido pela 2P");
  const valorDifal = difal?.valor ?? 0;
  const ncmsSt = Array.from(new Set(aud.itens.filter((i) => i.ncm.temSt).map((i) => i.ncm.codigo)));
  return {
    regime: aud.contribuinte ? "Contribuinte do ICMS" : "Não contribuinte do ICMS",
    difal: aud.contribuinte
      ? textoDifalContribuinte({
          ufNome: aud.uf.nome,
          aliqInterna: aud.uf.aliqInterna,
          fcp: aud.uf.fcp,
          valor: valorDifal,
          temIe: true,
        })
      : textoDifalNaoContribuinte({
          ufNome: aud.uf.nome,
          aliqInterna: aud.uf.aliqInterna,
          fcp: aud.uf.fcp,
          valor: valorDifal,
        }),
    st: textoIcmsSt({ ufNome: aud.uf.nome, convenio: aud.uf.convenioSt, ncms: ncmsSt }),
    ressalva:
      `Documento gerado automaticamente pelo Portal 2P Carregadores com base na versão ${aud.versao} das regras fiscais ` +
      `e comerciais. Os valores são estimativas para fins de análise interna e anexo ao processo, podendo variar conforme ` +
      `enquadramento fiscal do destinatário, convênios, MVA e validação no faturamento.`,
  };
}

// ----------------------------------------------------------------- CSV ------

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const num = (v: number) => (isFinite(v) ? v : 0).toFixed(2).replace(".", ",");

export function buildResumoFiscalCsv(aud: AuditoriaProposta, meta: ResumoFiscalMeta) {
  const t = textosPadrao(aud);
  const linhas: string[][] = [];

  linhas.push(["Resumo fiscal por NCM — 2P Carregadores"]);
  linhas.push(["Proposta", meta.numero ?? "—"]);
  linhas.push(["Cliente", meta.cliente]);
  linhas.push(["CNPJ/CPF", meta.doc ?? "—"]);
  linhas.push(["Inscrição estadual", meta.ie ?? "—"]);
  linhas.push(["UF de destino", `${aud.uf.nome} (${aud.uf.uf})`]);
  linhas.push(["Regime do destinatário", t.regime]);
  linhas.push(["ICMS interno da UF", fmtPct(aud.uf.aliqInterna)]);
  linhas.push(["FCP da UF", fmtPct(aud.uf.fcp)]);
  linhas.push(["Convênio ICMS-ST", aud.uf.convenioSt ? "Sim" : "Não"]);
  linhas.push(["Versão das regras", aud.versao]);
  linhas.push(["Gerado em", new Date(aud.geradoEm).toLocaleString("pt-BR")]);
  linhas.push([]);

  linhas.push(["Resumo por NCM"]);
  linhas.push([
    "NCM",
    "Descrição",
    "Produto",
    "Qtd",
    "Valor unitário",
    "Valor bruto (com IPI)",
    "Base sem IPI",
    "IPI %",
    "IPI R$",
    "ICMS %",
    "ICMS R$",
    "PIS/COFINS %",
    "PIS/COFINS R$",
    "Base DIFAL",
    "DIFAL R$",
    "ICMS-ST",
  ]);
  for (const i of aud.itens) {
    linhas.push([
      i.ncm.codigo,
      i.ncm.descricao,
      i.produto,
      String(i.qtd),
      num(i.valorUnitario),
      num(i.bruto),
      num(i.semIpi),
      fmtPct(i.ncm.ipi),
      num(i.ipi),
      fmtPct(i.ncm.inter),
      num(i.icms),
      fmtPct(i.ncm.pisCofins),
      num(i.pisCofins),
      num(i.difalBase),
      num(i.difal),
      i.ncm.temSt ? "Sim" : "Não",
    ]);
  }
  linhas.push([]);

  linhas.push(["Memória de cálculo por item"]);
  linhas.push(["Produto", "NCM", "Etapa", "Fórmula", "Substituição", "Resultado"]);
  for (const i of aud.itens) {
    for (const p of i.passos) {
      linhas.push([
        i.produto,
        i.ncm.codigo,
        p.rotulo,
        p.formula,
        p.substituicao,
        p.tipo === "percentual" ? fmtPct(p.valor) : num(p.valor),
      ]);
    }
  }
  linhas.push([]);

  linhas.push(["Totais e valores estimados"]);
  linhas.push(["Etapa", "Fórmula", "Substituição", "Resultado"]);
  for (const p of aud.totais)
    linhas.push([p.rotulo, p.formula, p.substituicao, p.tipo === "percentual" ? fmtPct(p.valor) : num(p.valor)]);
  linhas.push([]);

  linhas.push(["Parâmetros das regras aplicadas"]);
  for (const p of aud.parametros) linhas.push([p.rotulo, p.valor]);
  linhas.push([]);

  linhas.push(["Texto padrão — DIFAL", t.difal]);
  linhas.push(["Texto padrão — ICMS-ST", t.st]);
  linhas.push(["Ressalva", t.ressalva]);

  return "\uFEFF" + linhas.map((l) => l.map(csvCell).join(";")).join("\r\n");
}

export function baixarCsv(nome: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

// ----------------------------------------------------------------- PDF ------

export function buildResumoFiscalHtml(aud: AuditoriaProposta, meta: ResumoFiscalMeta) {
  const t = textosPadrao(aud);
  const hoje = new Date(aud.geradoEm);
  const numero = meta.numero ? `#${esc(meta.numero)}` : "—";

  const totalCell = (v: number, tipo: "moeda" | "percentual") =>
    tipo === "percentual" ? fmtPct(v) : fmtBRL(v);

  const resumoNcm = aud.itens
    .map(
      (i) => `<tr>
        <td><b>${esc(i.ncm.codigo)}</b><small>${esc(i.ncm.descricao)}</small></td>
        <td>${esc(i.produto)}<small>${i.qtd} × ${fmtBRL(i.valorUnitario)}</small></td>
        <td class="r">${fmtBRL(i.bruto)}</td>
        <td class="r">${fmtPct(i.ncm.ipi)}<small>${fmtBRL(i.ipi)}</small></td>
        <td class="r">${fmtPct(i.ncm.inter)}<small>${fmtBRL(i.icms)}</small></td>
        <td class="r">${fmtPct(i.ncm.pisCofins)}<small>${fmtBRL(i.pisCofins)}</small></td>
        <td class="r">${fmtBRL(i.difal)}<small>base ${fmtBRL(i.difalBase)}</small></td>
        <td class="r">${i.ncm.temSt ? "Sim" : "Não"}</td>
      </tr>`,
    )
    .join("");

  const memoria = aud.itens
    .map(
      (i) => `<div class="mem">
        <h4>${esc(i.produto)} · NCM ${esc(i.ncm.codigo)}</h4>
        <table class="calc">
          <thead><tr><th>Etapa</th><th>Fórmula</th><th>Memória</th><th class="r">Resultado</th></tr></thead>
          <tbody>
            ${i.passos
              .map(
                (p) => `<tr>
                  <td>${esc(p.rotulo)}</td>
                  <td class="mut">${esc(p.formula)}</td>
                  <td class="mono">${esc(p.substituicao)}</td>
                  <td class="r"><b>${totalCell(p.valor, p.tipo)}</b></td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>`,
    )
    .join("");

  const totais = aud.totais
    .map(
      (p) => `<tr>
        <td>${esc(p.rotulo)}</td>
        <td class="mut">${esc(p.formula)}</td>
        <td class="mono">${esc(p.substituicao)}</td>
        <td class="r"><b>${totalCell(p.valor, p.tipo)}</b></td>
      </tr>`,
    )
    .join("");

  const params = aud.parametros
    .map((p) => `<div class="param"><small>${esc(p.rotulo)}</small><b>${esc(p.valor)}</b></div>`)
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>Resumo fiscal por NCM ${numero} — 2P Carregadores</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; font-size: 11px; margin: 0; }
  h1 { font-size: 18px; margin: 0; letter-spacing: -.02em; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #555; margin: 18px 0 6px; border-bottom: 1px solid #e3e3e3; padding-bottom: 4px; }
  h4 { font-size: 11px; margin: 12px 0 4px; }
  small { display: block; color: #777; font-size: 9px; font-weight: 400; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8px; }
  .tag { display: inline-block; border: 1px solid #111; border-radius: 999px; padding: 2px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; }
  .grid div small { text-transform: uppercase; letter-spacing: .05em; font-size: 8px; }
  .grid div b { font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #666; border-bottom: 1px solid #ccc; padding: 5px 6px; }
  td { padding: 5px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  td.r, th.r { text-align: right; }
  .mut { color: #666; }
  .mono { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 9px; color: #555; }
  .mem { break-inside: avoid; }
  .texto { border: 1px solid #ddd; border-left: 3px solid #111; padding: 8px 10px; margin-bottom: 8px; text-align: justify; line-height: 1.45; }
  .texto b { display: block; text-transform: uppercase; font-size: 9px; letter-spacing: .06em; margin-bottom: 3px; }
  .params { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .param { border: 1px solid #eee; padding: 5px 7px; }
  .param small { text-transform: uppercase; font-size: 8px; }
  .alerta { background: #fff8e1; border: 1px solid #f0d48a; padding: 8px 10px; margin-top: 8px; }
  .foot { margin-top: 16px; border-top: 1px solid #ddd; padding-top: 6px; display: flex; justify-content: space-between; color: #777; font-size: 9px; }
</style></head><body>
  <div class="head">
    <div>
      <h1>Resumo fiscal por NCM</h1>
      <small>2P Carregadores · documento para anexo ao processo</small>
    </div>
    <div style="text-align:right">
      <span class="tag">Regras v${esc(aud.versao)}</span>
      <small>Proposta ${numero} · ${esc(hoje.toLocaleDateString("pt-BR"))}</small>
    </div>
  </div>

  <div class="grid">
    <div><small>Cliente</small><b>${esc(meta.cliente)}</b></div>
    <div><small>CNPJ/CPF</small><b>${esc(meta.doc || "—")}</b></div>
    <div><small>Inscrição estadual</small><b>${esc(meta.ie || "—")}</b></div>
    <div><small>Regime</small><b>${esc(t.regime)}</b></div>
    <div><small>UF de destino</small><b>${esc(aud.uf.nome)} (${esc(aud.uf.uf)})</b></div>
    <div><small>ICMS interno</small><b>${fmtPct(aud.uf.aliqInterna)}</b></div>
    <div><small>FCP</small><b>${fmtPct(aud.uf.fcp)}</b></div>
    <div><small>Convênio ICMS-ST</small><b>${aud.uf.convenioSt ? "Sim" : "Não"}</b></div>
  </div>

  <h2>Resumo por NCM</h2>
  <table>
    <thead><tr>
      <th>NCM</th><th>Produto</th><th class="r">Valor bruto</th><th class="r">IPI</th>
      <th class="r">ICMS NF</th><th class="r">PIS/COFINS</th><th class="r">DIFAL</th><th class="r">ST</th>
    </tr></thead>
    <tbody>${resumoNcm}</tbody>
  </table>

  <h2>Memória de cálculo por item</h2>
  ${memoria}

  <h2>Totais e valores estimados</h2>
  <table class="calc">
    <thead><tr><th>Etapa</th><th>Fórmula</th><th>Memória</th><th class="r">Resultado</th></tr></thead>
    <tbody>${totais}</tbody>
  </table>

  <h2>Texto padrão</h2>
  <div class="texto"><b>Regime do destinatário — ${esc(t.regime)}</b>${esc(t.difal)}</div>
  <div class="texto"><b>Substituição tributária</b>${esc(t.st)}</div>
  <div class="texto"><b>Ressalva</b>${esc(t.ressalva)}</div>

  <h2>Parâmetros das regras aplicadas</h2>
  <div class="params">${params}</div>

  ${
    aud.alertas.length
      ? `<div class="alerta"><b>Pontos de atenção</b><ul>${aud.alertas.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>`
      : ""
  }

  <div class="foot">
    <div><b>2P Carregadores</b> · Resumo fiscal gerado pelo portal</div>
    <div>${esc(meta.emitidoPor || "")} · ${esc(hoje.toLocaleString("pt-BR"))}</div>
  </div>
</body></html>`;
}
