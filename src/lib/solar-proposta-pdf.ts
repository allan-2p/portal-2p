import { fmtBRL } from "@/lib/carregadores";
import { cidadeUf } from "./local-format";
import { LOGO_2P_DATA_URI } from "./brand-2p-logo";


export type SolarPdfItem = {
  codigo?: string | null;
  nome: string;
  qtd: number;
  valor: number;
};

export type SolarPdfEndereco = {
  nome?: string | null;
  doc?: string | null;
  contato?: string | null;
  telefone?: string | null;
  linhas: string[];
} | null;

export type SolarPropostaPdfData = {
  numero?: string | null;
  propostaNome?: string | null;
  cliente: {
    nome: string;
    doc?: string | null;
    ie?: string | null;
    email?: string | null;
    telefone?: string | null;
    uf?: string | null;
    cidade?: string | null;
  };
  consultor?: string | null;
  itens: SolarPdfItem[];
  subtotal: number;
  desconto: number;
  cupom?: string | null;
  freteMod?: string | null;
  freteValor: number;
  freteGratis?: boolean;
  /** Frete absorvido pela 2P (cliente não paga). */
  freteBonificado?: boolean;
  transportadora?: string | null;
  total: number;
  listaPreco?: string | null;
  tipoNf?: string | null;
  formaPagamento?: string | null;
  observacoes?: string | null;
  enderecoFaturamento?: SolarPdfEndereco;
  enderecoEntrega?: SolarPdfEndereco;
  /** Resumo da Calculadora 2P (opcional). */
  estrutura?: { distribuicao?: number[]; comprimentos?: number[] } | null;
  validadeDias?: number;
};

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const limpo = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function solarPropostaPdfFileName(p: SolarPropostaPdfData) {
  return [limpo(p.numero ?? "Proposta"), limpo(p.propostaNome ?? "Proposta 2P Solar"), limpo(p.cliente.nome ?? "Cliente")]
    .filter(Boolean)
    .join(" - ");
}

const LABEL_PAGAMENTO: Record<string, string> = {
  boleto_vista: "Boleto à vista",
  boleto_prazo: "Boleto a prazo",
  pix: "Pix",
  cartao_credito: "Cartão de crédito",
};

/** Proposta 2P Solar em HTML pronto para impressão/PDF (A4, minimalista). */
export function buildSolarPropostaPdfHtml(p: SolarPropostaPdfData) {
  const hoje = new Date();
  const dataStr = hoje.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const validade = new Date(hoje.getTime() + (p.validadeDias ?? 15) * 86400000).toLocaleDateString("pt-BR");
  const numero = p.numero ?? "—";
  const qtdTotal = p.itens.reduce((a, i) => a + i.qtd, 0);

  const linhas = p.itens
    .map(
      (i, idx) => `
      <tr>
        <td class="idx">${String(idx + 1).padStart(2, "0")}</td>
        <td class="prod"><span class="pname">${esc(i.nome)}</span>${
          i.codigo ? `<div class="pmeta">Cód. ${esc(i.codigo)}</div>` : ""
        }</td>
        <td class="c">${i.qtd}</td>
        <td class="r">${fmtBRL(i.valor)}</td>
        <td class="r strong">${fmtBRL(i.valor * i.qtd)}</td>
      </tr>`,
    )
    .join("");

  const bloco = (titulo: string, d: SolarPdfEndereco) => {
    const ls = (d?.linhas ?? []).filter((l) => l && l.trim());
    const meta = [d?.doc ? `Doc. ${d.doc}` : "", d?.contato ? `Contato ${d.contato}` : "", d?.telefone ? `Tel. ${d.telefone}` : ""].filter(Boolean);
    return `
      <div class="f">
        <label>${esc(titulo)}</label>
        <div>
          ${d?.nome ? `<b>${esc(d.nome)}</b><br>` : ""}
          ${ls.length ? ls.map((l) => esc(l)).join("<br>") : "—"}
          ${meta.length ? `<br><span class="soft">${esc(meta.join(" · "))}</span>` : ""}
        </div>
      </div>`;
  };

  const estrutura =
    p.estrutura?.distribuicao?.length || p.estrutura?.comprimentos?.length
      ? `
    <div class="sec">
      <div class="sech"><span>Estrutura calculada</span></div>
      <div class="card"><div class="soft" style="font-size:9.6px;line-height:1.6">
        ${p.estrutura?.distribuicao?.length ? `Fileiras: <b>${esc(p.estrutura.distribuicao.join(" + "))}</b> módulos<br>` : ""}
        ${p.estrutura?.comprimentos?.length ? `Comprimentos: <b>${esc(p.estrutura.comprimentos.map((c) => `${(c / 1000).toFixed(2)} m`).join(" · "))}</b>` : ""}
      </div></div>
    </div>`
      : "";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(solarPropostaPdfFileName(p))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 10mm 0 10mm; }
  @page :first { margin-top: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root{ --ink:#101418; --muted:#7A838F; --line:#E7EAEF; --accent:#F58220; --accent-2:#FFB25C; --soft:#FBF8F4; }
  html,body{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body{ font-family:'Inter',Arial,Helvetica,sans-serif; color:var(--ink); background:#fff; font-size:9.2px; }
  .page{ width:210mm; margin:0 auto; padding:0; position:relative; }

  /* ---- Cabeçalho premium (faixa escura + marca 2P) ---- */
  .hero{ position:relative; overflow:hidden; padding:9mm 14mm 8mm; color:#fff;
    background:radial-gradient(120% 160% at 88% -30%, rgba(245,130,32,.55) 0%, rgba(245,130,32,0) 58%), linear-gradient(120deg,#0C1116 0%,#161C23 58%,#20272F 100%); }
  .hero:before{ content:""; position:absolute; right:-46mm; top:-26mm; width:92mm; height:92mm; border-radius:50%;
    background:radial-gradient(circle, rgba(255,178,92,.28) 0%, rgba(255,178,92,0) 70%); }
  .hero:after{ content:""; position:absolute; left:0; right:0; bottom:0; height:3px;
    background:linear-gradient(90deg,var(--accent) 0%,var(--accent-2) 42%,rgba(255,178,92,0) 100%); }
  .heroin{ position:relative; display:flex; justify-content:space-between; align-items:flex-start; gap:10mm; }
  .brand{ display:flex; align-items:center; gap:10px; }
  .brand img{ width:46px; height:auto; display:block; }
  .brandname{ font-size:13px; font-weight:800; letter-spacing:.2em; text-transform:uppercase; }
  .brandsub{ font-size:7.2px; letter-spacing:.26em; text-transform:uppercase; color:rgba(255,255,255,.62); margin-top:3px; }
  .hmeta{ text-align:right; font-size:8.2px; color:rgba(255,255,255,.6); line-height:1.75; white-space:nowrap; }
  .hmeta b{ color:#fff; font-weight:600; }
  .herotitle{ position:relative; margin-top:8mm; }
  .kicker{ font-size:7.4px; letter-spacing:.34em; text-transform:uppercase; color:var(--accent-2); font-weight:700; }
  .htitle{ font-size:22px; font-weight:800; letter-spacing:-.7px; line-height:1.12; margin-top:4px; }
  .hnum{ font-size:8.6px; color:rgba(255,255,255,.55); margin-top:3px; letter-spacing:.12em; }

  .body{ padding:6mm 14mm 0; }
  .sec{ margin-top:5mm; }
  .sech{ display:flex; align-items:center; gap:7px; margin-bottom:2.5mm; }
  .sech span{ font-size:7.2px; letter-spacing:.26em; text-transform:uppercase; color:var(--muted); font-weight:700; white-space:nowrap; }
  .sech:after{ content:""; flex:1; height:1px; background:var(--line); }

  .card{ border:1px solid var(--line); border-radius:10px; padding:3.5mm 4.5mm; background:var(--soft); }
  .cname{ font-size:12.5px; font-weight:700; letter-spacing:-.3px; }
  .grid{ display:grid; grid-template-columns:repeat(4,1fr); gap:3mm 4mm; margin-top:3mm; }
  .grid.two{ grid-template-columns:repeat(2,1fr); }
  .f label{ display:block; font-size:7px; letter-spacing:.18em; text-transform:uppercase; color:var(--muted); margin-bottom:2px; font-weight:700; }
  .f div{ font-size:9.2px; font-weight:500; word-break:break-word; line-height:1.45; }
  .soft{ color:var(--muted); }

  table{ width:100%; border-collapse:collapse; }
  thead th{ font-size:7px; letter-spacing:.2em; text-transform:uppercase; color:var(--muted); font-weight:700;
    text-align:left; padding:0 5px 4px; border-bottom:1px solid var(--ink); }
  tbody td{ padding:4px 5px; border-bottom:1px solid var(--line); font-size:9.2px; vertical-align:middle; }
  .c{ text-align:center } .r{ text-align:right } .strong{ font-weight:700 }
  .idx{ color:var(--muted); font-size:8px; width:20px; font-variant-numeric:tabular-nums; }
  .pname{ font-weight:600; }
  .pmeta{ font-size:7.4px; color:var(--muted); margin-top:1px; }
  tfoot td{ padding:5px 5px; font-size:8.2px; color:var(--muted); }

  .totais{ margin-top:5mm; display:grid; grid-template-columns:1fr 80mm; gap:5mm; align-items:stretch; }
  .rows{ border:1px solid var(--line); border-radius:10px; padding:2mm 4mm; display:flex; flex-direction:column; justify-content:center; }
  .row{ display:flex; justify-content:space-between; align-items:baseline; padding:3px 0; border-bottom:1px dashed var(--line); font-size:9.2px; }
  .row:last-child{ border-bottom:0 }
  .row b{ font-weight:600; font-variant-numeric:tabular-nums }
  .total{ background:linear-gradient(135deg,#0C1116,#20272F); color:#fff; border-radius:11px; padding:4.5mm 5.5mm; position:relative; overflow:hidden; }
  .total:after{ content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:linear-gradient(180deg,var(--accent),var(--accent-2)); }
  .total small{ display:block; font-size:7.2px; font-weight:600; letter-spacing:.26em; text-transform:uppercase; color:var(--accent-2); margin-bottom:3px; }
  .total .val{ font-size:22px; font-weight:800; letter-spacing:-1px; }
  .total .sub{ font-size:8px; color:rgba(255,255,255,.6); margin-top:3px; }

  .cond{ margin-top:5mm; display:grid; grid-template-columns:repeat(4,1fr); gap:4mm; }
  .cond div{ border-left:2px solid var(--accent); padding-left:3mm; }
  .cond label{ display:block; font-size:7px; letter-spacing:.18em; text-transform:uppercase; color:var(--muted); font-weight:700; margin-bottom:2px; }
  .cond p{ font-size:8.4px; line-height:1.45; }

  .foot{ margin-top:6mm; padding:3.5mm 14mm 0; border-top:1px solid var(--line);
    display:flex; justify-content:space-between; align-items:center; font-size:7.4px; color:var(--muted); letter-spacing:.05em; }
  .foot b{ color:var(--accent); font-weight:700; letter-spacing:.16em; text-transform:uppercase; }

  .card div, .client div, .f div, .cond p, td { overflow-wrap:anywhere; }
  .idx, .c, .r, tfoot td { white-space:nowrap; overflow-wrap:normal; }
  /* Quebra de página por BLOCO inteiro — nunca corta um bloco ao meio */
  .sec, .totais, .cond, .card, .rows, .total, .cond div, .f, tr, tfoot, .foot { break-inside:avoid; page-break-inside:avoid; }
  .sec.flow { break-inside:auto; page-break-inside:auto; }
  .sech { break-after:avoid; page-break-after:avoid; }
  thead { display:table-header-group; }
  tfoot { display:table-row-group; }
  @media print{ .page{ margin:0; width:auto } }



</style></head>
<body>
<div class="page">
  <div class="hero">
    <div class="heroin">
      <div class="brand">
        <img src="${LOGO_2P_DATA_URI}" alt="2P">
        <div>
          <div class="brandname">2P Solar</div>
          <div class="brandsub">Estruturas e soluções fotovoltaicas</div>
        </div>
      </div>
      <div class="hmeta">
        Emissão <b>${esc(dataStr)}</b><br>
        Validade <b>${esc(validade)}</b><br>
        Consultor <b>${esc(p.consultor || "—")}</b>
      </div>
    </div>
    <div class="herotitle">
      <div class="kicker">Proposta comercial</div>
      <div class="htitle">${esc(p.propostaNome?.trim() || "Proposta 2P Solar")}</div>
      <div class="hnum">Nº ${esc(numero)}</div>
    </div>
  </div>


  <div class="body">
    <div class="sec">
      <div class="sech"><span>Cliente</span></div>
      <div class="card">
        <div class="cname">${esc(p.cliente.nome)}</div>
        <div class="grid">
          <div class="f"><label>CNPJ / CPF</label><div>${esc(p.cliente.doc) || "—"}</div></div>
          <div class="f"><label>Inscrição estadual</label><div>${esc(p.cliente.ie) || "—"}</div></div>
          <div class="f"><label>E-mail</label><div>${esc(p.cliente.email) || "—"}</div></div>
          <div class="f"><label>Telefone</label><div>${esc(p.cliente.telefone) || "—"}</div></div>
          <div class="f"><label>Cidade / UF</label><div>${esc(cidadeUf(p.cliente.cidade, p.cliente.uf))}</div></div>
          <div class="f"><label>Tipo de NF</label><div>${esc(p.tipoNf) || "—"}</div></div>
          <div class="f"><label>Tabela de preço</label><div>${p.listaPreco ? `Tabela ${esc(p.listaPreco)}` : "—"}</div></div>
          <div class="f"><label>Forma de pagamento</label><div>${esc(p.formaPagamento ? (LABEL_PAGAMENTO[p.formaPagamento] ?? p.formaPagamento) : "") || "—"}</div></div>
        </div>
      </div>
    </div>

    ${
      p.enderecoFaturamento || p.enderecoEntrega
        ? `<div class="sec">
      <div class="sech"><span>Endereços</span></div>
      <div class="grid two" style="margin-top:0">
        ${bloco("Faturamento", p.enderecoFaturamento ?? null)}
        ${bloco("Entrega", p.enderecoEntrega ?? null)}
      </div>
    </div>`
        : ""
    }

    <div class="sec flow">

      <div class="sech"><span>Escopo de fornecimento</span></div>
      <table>
        <thead><tr><th></th><th>Produto</th><th class="c">Qtd</th><th class="r">Valor unit.</th><th class="r">Total</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr>
          <td colspan="2">${p.itens.length} ${p.itens.length === 1 ? "item" : "itens"} · ${qtdTotal} ${qtdTotal === 1 ? "unidade" : "unidades"}</td>
          <td colspan="3" class="r">Frete ${esc(p.freteMod || "—")}${p.transportadora ? ` · ${esc(p.transportadora)}` : ""}${p.freteGratis || p.freteBonificado ? " · <b>Frete grátis</b>" : ""}</td>
        </tr></tfoot>
      </table>
    </div>

    ${estrutura}

    <div class="totais">
      <div class="rows">
        <div class="row"><span>Subtotal dos itens</span><b>${fmtBRL(p.subtotal)}</b></div>
        ${p.desconto > 0 ? `<div class="row"><span>Desconto${p.cupom ? ` · cupom ${esc(p.cupom)}` : ""}</span><b>- ${fmtBRL(p.desconto)}</b></div>` : ""}
        <div class="row"><span>Frete ${esc(p.freteMod || "—")}</span><b>${
          p.freteGratis
            ? "Frete grátis"
            : p.freteBonificado
              ? `Frete grátis${p.freteValor > 0 ? ` <span style="font-weight:400;text-decoration:line-through;opacity:.6">${fmtBRL(p.freteValor)}</span>` : ""}`
              : fmtBRL(p.freteValor)
        }</b></div>
      </div>
      <div class="total">
        <small>Investimento total</small>
        <div class="val">${fmtBRL(p.total)}</div>
        <div class="sub">Impostos inclusos conforme legislação vigente.</div>
      </div>
    </div>

    ${
      p.observacoes?.trim()
        ? `<div class="sec">
      <div class="sech"><span>Observações</span></div>
      <div class="card"><div style="font-size:9.6px;line-height:1.55">${esc(p.observacoes)}</div></div>
    </div>`
        : ""
    }

    <div class="cond">
      <div><label>Validade</label><p>Proposta válida até ${esc(validade)}, sujeita a disponibilidade de estoque.</p></div>
      <div><label>Prazo de entrega</label><p>A confirmar na aprovação, conforme modalidade ${esc(p.freteMod || "de frete")}.</p></div>
      <div><label>Condições</label><p>Valores em reais${p.listaPreco ? `, tabela ${esc(p.listaPreco)}` : ""}.</p></div>
      <div><label>Forma de pagamento</label><p>${esc(p.formaPagamento ? (LABEL_PAGAMENTO[p.formaPagamento] ?? p.formaPagamento) : "") || "A definir"}</p></div>
    </div>
  </div>

  <div class="foot">
    <div><b>2P Solar</b> · Estruturas e soluções fotovoltaicas</div>
    <div>${esc(numero)} · ${esc(hoje.toLocaleDateString("pt-BR"))}</div>
  </div>
</div>
</body></html>`;
}
