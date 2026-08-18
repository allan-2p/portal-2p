import { fmtBRL, fmtPct } from "@/lib/cpo";

export type PropostaPdfItem = {
  codigo?: string | null;
  nome: string;
  /** Código NCM do produto (exibido logo abaixo do nome). */
  ncm?: string | null;
  /** Foto do produto (URL assinada ou data URL) exibida na linha do item. */
  foto?: string | null;
  qtd: number;
  valor: number;
};


export type PropostaPdfData = {
  numero?: string;
  /** Nome/identificação da proposta. */
  propostaNome?: string | null;
  /** Nº do pedido no SAP. */
  numeroSap?: string | null;

  cliente: {
    nome: string;
    nomeFantasia?: string | null;
    doc?: string;
    ie?: string;
    email?: string;
    telefone?: string;
    uf: string;
    contribuinte: boolean;
  };
  /** Finalidade da mercadoria: uso e consumo, revenda ou industrialização. */
  finalidadeUso?: string | null;
  itens: PropostaPdfItem[];
  freteMod: string;
  freteValor: number;
  impostos: {
    ipiRate: number;
    ipiValor: number;
    icmsRate: number;
    icms: number;
    pisCofinsRate: number;
    pisCofins: number;
  };
  totalNf: number;
  valorTotal: number;
  valor?: number;
  interno?: {
    mb: number;
    mbPct: number;
    comissao: number;
    comissaoPct: number;
  };
  observacoes?: string;
  consultor?: string;
  validadeDias?: number;
  /** Forma de pagamento escolhida (exibida no PDF, mas pode estar vazia). */
  formaPagamento?: string | null;
  /** Logomarca do cliente exibida no cabeçalho (data URL ou URL http). */
  logoCliente?: string | null;
};


const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Nome sugerido do arquivo ao salvar/imprimir: nº da proposta + "Proposta" + nome fantasia.
 * O navegador usa o <title> do documento como nome padrão no diálogo de impressão.
 */
export function propostaPdfFileName(p: Pick<PropostaPdfData, "numero" | "cliente" | "propostaNome" | "numeroSap">) {
  const limpo = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const fantasia = limpo(p.cliente.nomeFantasia?.trim() || p.cliente.nome || "Cliente");
  const nome = limpo(p.propostaNome?.trim() || "Proposta");
  const sap = p.numeroSap?.trim() ? [p.numeroSap.trim()] : [];
  return [limpo(p.numero ?? "Proposta"), nome, ...sap, fantasia].filter(Boolean).join(" - ");
}



export function buildPropostaPdfHtml(p: PropostaPdfData) {
  const hoje = new Date();
  const dataStr = hoje.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const validade = new Date(hoje.getTime() + (p.validadeDias ?? 15) * 86400000).toLocaleDateString("pt-BR");
  const numero = p.numero ?? hoje.getTime().toString().slice(-6);

  const temFoto = p.itens.some((i) => !!i.foto);

  const linhas = p.itens
    .map(
      (i, idx) => `
      <tr>
        <td class="idx">${String(idx + 1).padStart(2, "0")}</td>
        ${
          temFoto
            ? `<td class="foto">${i.foto ? `<img src="${esc(i.foto)}" alt="${esc(i.nome)}">` : `<div class="nofoto"></div>`}</td>`
            : ""
        }
        <td class="prod"><span class="pname">${esc(i.nome)}</span>${
          i.ncm || i.codigo
            ? `<div class="pmeta">${[i.ncm ? `NCM ${esc(i.ncm)}` : "", i.codigo ? `Cód. ${esc(i.codigo)}` : ""].filter(Boolean).join(" · ")}</div>`
            : ""
        }</td>
        <td class="c">${i.qtd}</td>
        <td class="r">${fmtBRL(i.valor)}</td>
        <td class="r strong">${fmtBRL(i.valor * i.qtd)}</td>
      </tr>`,
    )
    .join("");


  const qtdTotal = p.itens.reduce((a, i) => a + i.qtd, 0);

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(propostaPdfFileName({ ...p, numero }))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root{
    --ink:#060B18; --ink-2:#16213c; --muted:#78859C; --line:#E2E8F2;
    --accent:#2F6BFF; --accent-2:#22D3EE; --soft:#F4F7FD;
  }
  html,body{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body{ font-family:'Inter',Arial,Helvetica,sans-serif; color:var(--ink); background:#fff; font-size:9.6px; }
  .page{ width:210mm; min-height:297mm; margin:0 auto; padding:0 0 16mm; position:relative; display:flex; flex-direction:column; }

  /* HEADER */
  .hero{ background:linear-gradient(120deg,#060B18 0%,#0C1730 55%,#12224A 100%); color:#fff; padding:10mm 14mm 8mm; position:relative; overflow:hidden; }
  .hero:after{ content:""; position:absolute; right:-35mm; top:-35mm; width:80mm; height:80mm; border-radius:50%;
    background:radial-gradient(circle at 30% 30%, rgba(47,107,255,.55), rgba(34,211,238,0) 65%); }
  .hero:before{ content:""; position:absolute; inset:0;
    background:repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 1px, rgba(255,255,255,0) 1px 14px); }
  .brand{ display:flex; align-items:center; gap:8px; position:relative; z-index:1; }
  .mark{ width:24px; height:24px; border-radius:7px; background:linear-gradient(135deg,var(--accent),var(--accent-2)); color:#04102A; font-weight:800;
    display:flex; align-items:center; justify-content:center; font-size:11px; letter-spacing:-.5px; }
  .brandname{ font-size:11.5px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; }
  .brandsub{ font-size:8px; letter-spacing:.28em; text-transform:uppercase; color:rgba(255,255,255,.5); margin-top:1px; }
  .cliente-logo{ margin-left:auto; display:flex; align-items:center; }
  .cliente-logo img{ max-height:9mm; max-width:32mm; object-fit:contain; opacity:.92;
    filter:brightness(0) invert(1); }


  .hero-main{ display:flex; justify-content:space-between; align-items:flex-end; margin-top:8mm; position:relative; z-index:1; }
  .htitle{ font-size:26px; font-weight:800; letter-spacing:-1px; line-height:1; }
  .hkicker{ font-size:8px; letter-spacing:.32em; text-transform:uppercase; color:var(--accent-2); margin-bottom:5px; font-weight:600; }
  .hmeta{ text-align:right; font-size:8.6px; color:rgba(255,255,255,.62); line-height:1.65; }
  .hmeta b{ color:#fff; font-weight:600; }
  .accentbar{ height:3px; background:linear-gradient(90deg,var(--accent),var(--accent-2),rgba(47,107,255,.1)); }

  .body{ padding:7mm 14mm 0; flex:1; }

  /* SECTIONS */
  .sec{ margin-top:6mm; }
  .sec:first-child{ margin-top:0; }
  .sech{ display:flex; align-items:center; gap:7px; margin-bottom:3mm; }
  .sech span{ font-size:8px; letter-spacing:.26em; text-transform:uppercase; color:var(--muted); font-weight:600; white-space:nowrap; }
  .sech:before{ content:""; width:14px; height:2px; background:linear-gradient(90deg,var(--accent),var(--accent-2)); border-radius:2px; }
  .sech:after{ content:""; flex:1; height:1px; background:var(--line); }

  /* CLIENT CARD */
  .client{ border:1px solid var(--line); border-radius:9px; padding:4mm 5mm; background:var(--soft); }
  .cname{ font-size:13.5px; font-weight:700; letter-spacing:-.3px; }
  .tags{ display:flex; gap:6px; margin-top:4px; }
  .tag{ font-size:7.6px; letter-spacing:.1em; text-transform:uppercase; font-weight:600; padding:2px 7px; border-radius:20px;
    background:#fff; border:1px solid var(--line); color:var(--ink-2); }
  .tag.on{ background:rgba(47,107,255,.12); border-color:rgba(47,107,255,.4); color:#12409E; }
  .grid{ display:grid; grid-template-columns:repeat(4,1fr); gap:4mm; margin-top:4mm; }
  .f label{ display:block; font-size:7.2px; letter-spacing:.18em; text-transform:uppercase; color:var(--muted); margin-bottom:2px; font-weight:600; }
  .f div{ font-size:9.8px; font-weight:500; word-break:break-word; }

  /* TABLE */
  table{ width:100%; border-collapse:collapse; }
  thead th{ font-size:7.4px; letter-spacing:.2em; text-transform:uppercase; color:var(--muted); font-weight:600;
    text-align:left; padding:0 5px 5px; border-bottom:1px solid var(--ink); }
  tbody td{ padding:5.5px 5px; border-bottom:1px solid var(--line); font-size:9.8px; vertical-align:middle; }
  tbody tr:nth-child(even){ background:#F8FAFE; }
  .c{ text-align:center } .r{ text-align:right } .strong{ font-weight:700 }
  .idx{ color:var(--muted); font-size:8.6px; width:20px; font-variant-numeric:tabular-nums; }
  .pname{ font-weight:600; }
  .pmeta{ font-size:8px; color:var(--muted); margin-top:1.5px; letter-spacing:.02em; }
  .foto{ width:16mm; }
  .foto img{ width:14mm; height:14mm; object-fit:contain; border:1px solid var(--line); border-radius:6px; background:#fff; display:block; }
  .foto .nofoto{ width:14mm; height:14mm; border:1px dashed var(--line); border-radius:6px; background:var(--soft); }

  tfoot td{ padding:6px 5px; font-size:9px; color:var(--muted); }

  /* TWO COL */
  .cols{ display:grid; grid-template-columns:1fr 1fr; gap:6mm; margin-top:6mm; }
  .panel{ border:1px solid var(--line); border-radius:9px; overflow:hidden; }
  .panel h4{ font-size:7.8px; letter-spacing:.22em; text-transform:uppercase; color:var(--muted); font-weight:600;
    padding:3mm 4mm; border-bottom:1px solid var(--line); background:var(--soft); }
  .rows{ padding:1.5mm 4mm 3mm; }
  .row{ display:flex; justify-content:space-between; align-items:baseline; padding:3.5px 0; border-bottom:1px dashed var(--line); font-size:9.4px; }
  .row:last-child{ border-bottom:0 }
  .row span{ color:var(--ink-2) } .row b{ font-weight:600; font-variant-numeric:tabular-nums }
  .rate{ font-size:7.6px; color:var(--muted); margin-left:4px; }

  /* TOTAL */
  .total{ margin-top:6mm; background:linear-gradient(120deg,#060B18 0%,#0E1B38 60%,#14265A 100%); color:#fff; border-radius:11px; padding:5mm 6mm;
    display:flex; justify-content:space-between; align-items:center; position:relative; overflow:hidden; }
  .total:after{ content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:linear-gradient(180deg,var(--accent),var(--accent-2)); }
  .total .lbl{ font-size:7.8px; letter-spacing:.28em; text-transform:uppercase; color:rgba(255,255,255,.55); font-weight:600; }
  .total .nf{ font-size:10px; color:rgba(255,255,255,.75); margin-top:3px; }
  .total .val{ font-size:24px; font-weight:800; letter-spacing:-1px; text-align:right; }
  .total .val small{ display:block; font-size:7.6px; font-weight:500; letter-spacing:.22em; text-transform:uppercase; color:var(--accent-2); margin-bottom:2px; }

  /* CONDITIONS */
  .cond{ margin-top:6mm; display:grid; grid-template-columns:repeat(3,1fr); gap:4mm; }
  .cond div{ border-left:2px solid var(--accent); padding-left:3mm; }
  .cond label{ display:block; font-size:7.2px; letter-spacing:.18em; text-transform:uppercase; color:var(--muted); font-weight:600; margin-bottom:2px; }
  .cond p{ font-size:8.8px; line-height:1.45; }

  /* FOOTER */
  .foot{ position:absolute; left:0; right:0; bottom:0; padding:4mm 14mm; border-top:1px solid var(--line);
    display:flex; justify-content:space-between; align-items:center; font-size:7.6px; color:var(--muted); letter-spacing:.05em; }
  .foot b{ color:var(--accent); font-weight:600; letter-spacing:.16em; text-transform:uppercase; }
  @media print{ .page{ margin:0 } }

</style></head>
<body>
<div class="page">
  <div class="hero">
    <div class="brand">
      <div class="mark">2P</div>
      <div>
        <div class="brandname">2P Carregadores</div>
        <div class="brandsub">Infraestrutura de recarga</div>
      </div>
      ${
        p.logoCliente
          ? `<div class="cliente-logo"><img src="${esc(p.logoCliente)}" alt="Logomarca do cliente"></div>`
          : ""
      }
    </div>

    <div class="hero-main">
      <div>
        <div class="hkicker">Proposta comercial</div>
        <div class="htitle">${esc(p.propostaNome?.trim() || numero)}</div>
        <div class="hkicker" style="margin-top:6px">${esc(numero)}</div>
      </div>
      <div class="hmeta">
        Emissão <b>${esc(dataStr)}</b><br>
        Validade <b>${esc(validade)}</b><br>
        Nº SAP <b>${esc(p.numeroSap?.trim() || "em geração")}</b><br>
        Consultor responsável <b>${esc(p.consultor || "—")}</b>
      </div>
    </div>

  </div>
  <div class="accentbar"></div>

  <div class="body">
    <div class="sec">
      <div class="sech"><span>Cliente</span></div>
      <div class="client">
        <div class="cname">${esc(p.cliente.nome)}</div>
        <div class="tags">
          <div class="tag">UF ${esc(p.cliente.uf)}</div>
          <div class="tag ${p.cliente.contribuinte ? "on" : ""}">${p.cliente.contribuinte ? "Contribuinte ICMS" : "Não contribuinte"}</div>
          ${p.finalidadeUso ? `<div class="tag on">Finalidade: ${esc(p.finalidadeUso)}</div>` : ""}
        </div>
        <div class="grid">
          <div class="f"><label>CNPJ / CPF</label><div>${esc(p.cliente.doc) || "—"}</div></div>
          <div class="f"><label>Inscrição estadual</label><div>${esc(p.cliente.ie) || "—"}</div></div>
          <div class="f"><label>E-mail</label><div>${esc(p.cliente.email) || "—"}</div></div>
          <div class="f"><label>Telefone</label><div>${esc(p.cliente.telefone) || "—"}</div></div>
          <div class="f"><label>Finalidade da mercadoria</label><div>${esc(p.finalidadeUso) || "—"}</div></div>
        </div>
      </div>
    </div>

    <div class="sec">
      <div class="sech"><span>Escopo de fornecimento</span></div>
      <table>
        <thead><tr>
          <th></th>${temFoto ? "<th></th>" : ""}<th>Produto</th><th class="c">Qtd</th><th class="r">Valor unit.</th><th class="r">Total</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr>
          <td colspan="${temFoto ? 3 : 2}">${p.itens.length} ${p.itens.length === 1 ? "item" : "itens"} · ${qtdTotal} ${qtdTotal === 1 ? "unidade" : "unidades"}</td>

          <td colspan="3" class="r">Frete ${esc(p.freteMod)} · <b style="color:var(--ink)">${fmtBRL(p.freteValor)}</b></td>
        </tr></tfoot>
      </table>
    </div>

    <div class="cols">
      <div class="panel">
        <h4>Composição fiscal</h4>
        <div class="rows">
          <div class="row"><span>IPI<i class="rate">${fmtPct(p.impostos.ipiRate)}</i></span><b>${fmtBRL(p.impostos.ipiValor)}</b></div>
          <div class="row"><span>ICMS efetivo<i class="rate">${fmtPct(p.impostos.icmsRate)}</i></span><b>${fmtBRL(p.impostos.icms)}</b></div>
          <div class="row"><span>PIS / COFINS<i class="rate">${fmtPct(p.impostos.pisCofinsRate)}</i></span><b>${fmtBRL(p.impostos.pisCofins)}</b></div>
        </div>
      </div>
      <div class="panel">
        <h4>Resumo</h4>
        <div class="rows">
          <div class="row"><span>Equipamentos</span><b>${fmtBRL(p.totalNf - p.freteValor)}</b></div>
          <div class="row"><span>Frete (${esc(p.freteMod)})</span><b>${fmtBRL(p.freteValor)}</b></div>
          <div class="row"><span>Total da nota fiscal</span><b>${fmtBRL(p.totalNf)}</b></div>
        </div>
      </div>
    </div>

    <div class="total">
      <div>
        <div class="lbl">Investimento total</div>
        <div class="nf">Total NF ${fmtBRL(p.totalNf)} · impostos inclusos</div>
      </div>
      <div class="val"><small>Valor da proposta</small>${fmtBRL(p.valorTotal)}</div>
    </div>

    ${p.observacoes ? `<div class="sec">
      <div class="sech"><span>Observações</span></div>
      <div class="client"><div style="font-size:11px;line-height:1.5">${esc(p.observacoes)}</div></div>
    </div>` : ""}


    <div class="cond">
      <div><label>Validade</label><p>Proposta válida até ${esc(validade)}, sujeita a disponibilidade de estoque.</p></div>
      <div><label>Prazo de entrega</label><p>A confirmar na aprovação do pedido, conforme modalidade de frete ${esc(p.freteMod)}.</p></div>
      <div><label>Condições</label><p>Valores em reais, impostos conforme legislação vigente na UF ${esc(p.cliente.uf)}.</p></div>
    </div>
  </div>


  <div class="foot">
    <div><b>2P Carregadores</b> · Eletropostos e infraestrutura de recarga</div>
    <div>${esc(numero)} · ${esc(hoje.toLocaleDateString("pt-BR"))}</div>
  </div>
</div>
</body></html>`;
}
