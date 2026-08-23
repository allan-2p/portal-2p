/**
 * Guia de pagamento do boleto (PDF via impressão do navegador).
 *
 * Não substitui o boleto oficial do banco: reproduz os dados de cobrança
 * (beneficiário, pagador, valor, vencimento), a linha digitável e o código de
 * barras padrão FEBRABAN (Interleaved 2 of 5) para o cliente pagar em qualquer
 * banco, app ou lotérica.
 */

export type BoletoGuiaDados = {
  numeroPedido?: string | null;
  clienteNome?: string | null;
  clienteDoc?: string | null;
  valor?: number | null;
  vencimento?: string | null;
  linhaDigitavel?: string | null;
  codigoBarras?: string | null;
  nossoNumero?: string | null;
  beneficiario?: string | null;
};

const I25: Record<string, string> = {
  "0": "NNWWN",
  "1": "WNNNW",
  "2": "NWNNW",
  "3": "WWNNN",
  "4": "NNWNW",
  "5": "WNWNN",
  "6": "NWWNN",
  "7": "NNNWW",
  "8": "WNNWN",
  "9": "NWNWN",
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const brl = (v?: number | null) =>
  typeof v === "number" && Number.isFinite(v)
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

const data = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

/** Barras do padrão Interleaved 2 of 5 (código de barras de 44 dígitos). */
function barras(codigo: string): string {
  const digitos = codigo.replace(/\D+/g, "");
  if (digitos.length < 2) return "";
  const par = digitos.length % 2 === 0 ? digitos : `0${digitos}`;

  const partes: string[] = [];
  const push = (barra: boolean, larga: boolean) =>
    partes.push(
      `<i style="width:${larga ? 3 : 1}px;background:${barra ? "#000" : "transparent"}"></i>`,
    );

  // Início: barra/espaço estreitos alternados.
  for (let i = 0; i < 4; i++) push(i % 2 === 0, false);

  for (let i = 0; i < par.length; i += 2) {
    const b = I25[par[i]!] ?? I25["0"]!;
    const e = I25[par[i + 1]!] ?? I25["0"]!;
    for (let k = 0; k < 5; k++) {
      push(true, b[k] === "W");
      push(false, e[k] === "W");
    }
  }

  // Fim: barra larga, espaço estreito, barra estreita.
  push(true, true);
  push(false, false);
  push(true, false);

  return `<div class="barcode">${partes.join("")}</div>`;
}

export function boletoGuiaHtml(d: BoletoGuiaDados): string {
  const linha = String(d.linhaDigitavel ?? "").trim();
  const codigo = String(d.codigoBarras ?? "").replace(/\D+/g, "");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>Boleto ${esc(d.numeroPedido ?? "")}</title>
<style>
  @page { size:A4; margin:14mm }
  *{ box-sizing:border-box }
  html,body{ -webkit-print-color-adjust:exact; print-color-adjust:exact }
  body{ margin:0; font-family:"Helvetica Neue",Arial,sans-serif; color:#15181d; font-size:12px }
  .head{ display:flex; align-items:center; justify-content:space-between;
    border-bottom:3px solid #ef6c1a; padding-bottom:10px; margin-bottom:16px }
  .head h1{ margin:0; font-size:19px; letter-spacing:.4px }
  .head span{ font-size:11px; color:#5d646e }
  .grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px 22px; margin-bottom:16px }
  .campo{ border:1px solid #d8dce2; border-radius:6px; padding:7px 10px }
  .campo b{ display:block; font-size:9px; text-transform:uppercase; letter-spacing:.7px; color:#6b7280; font-weight:700 }
  .campo span{ font-size:13px; font-weight:600 }
  .destaque{ background:#fff5ee; border-color:#ef6c1a }
  .linha{ border:1px solid #d8dce2; border-radius:6px; padding:10px; margin-bottom:14px; text-align:center }
  .linha b{ display:block; font-size:9px; text-transform:uppercase; letter-spacing:.7px; color:#6b7280 }
  .linha code{ font-family:"Courier New",monospace; font-size:16px; font-weight:700; letter-spacing:.5px; word-break:break-all }
  .barcode{ display:flex; justify-content:center; align-items:flex-end; height:52px; margin:14px 0 4px }
  .barcode i{ display:block; height:52px }
  .obs{ border:1px solid #d8dce2; border-radius:6px; padding:10px 12px; font-size:11px; line-height:1.6; color:#374151 }
  .obs h2{ margin:0 0 4px; font-size:11px; text-transform:uppercase; letter-spacing:.7px; color:#ef6c1a }
  .obs ul{ margin:0; padding-left:16px }
  .rodape{ margin-top:14px; font-size:9.5px; color:#8b929c; text-align:center }
  .bloco{ break-inside:avoid; page-break-inside:avoid }
</style></head><body>
  <div class="head bloco">
    <h1>Boleto para pagamento</h1>
    <span>Pedido ${esc(d.numeroPedido ?? "—")}</span>
  </div>

  <div class="grid bloco">
    <div class="campo"><b>Beneficiário</b><span>${esc(d.beneficiario ?? "2P Group")}</span></div>
    <div class="campo"><b>Nosso número</b><span>${esc(d.nossoNumero ?? "—")}</span></div>
    <div class="campo"><b>Pagador</b><span>${esc(d.clienteNome ?? "—")}</span></div>
    <div class="campo"><b>CPF / CNPJ</b><span>${esc(d.clienteDoc ?? "—")}</span></div>
    <div class="campo destaque"><b>Valor do documento</b><span>${brl(d.valor)}</span></div>
    <div class="campo destaque"><b>Vencimento</b><span>${data(d.vencimento)}</span></div>
  </div>

  <div class="linha bloco">
    <b>Linha digitável</b>
    <code>${esc(linha || "—")}</code>
    ${codigo ? barras(codigo) : ""}
    ${codigo ? `<code style="font-size:11px;font-weight:500">${esc(codigo)}</code>` : ""}
  </div>

  <div class="obs bloco">
    <h2>Instruções</h2>
    <ul>
      <li>Pague em qualquer banco, aplicativo ou lotérica usando a linha digitável ou o código de barras acima.</li>
      <li>Após o vencimento (${data(d.vencimento)}) o pagamento pode ser recusado — solicite a segunda via.</li>
      <li>O pedido entra em separação no próximo dia útil após a confirmação do pagamento pelo banco.</li>
      <li>Não receber valor divergente do informado neste documento.</li>
    </ul>
  </div>

  <p class="rodape">Documento gerado pelo Portal 2P para facilitar o pagamento. O boleto oficial é emitido pelo Banco Itaú.</p>
</body></html>`;
}

/** Abre a guia em nova aba e dispara a impressão (salvar como PDF). */
export function imprimirBoletoGuia(d: BoletoGuiaDados) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(boletoGuiaHtml(d));
  w.document.close();
  setTimeout(() => w.print(), 500);
  return true;
}
