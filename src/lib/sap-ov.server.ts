/**
 * Criação da ordem de venda no SAP — RFC `ZNFE_OV_CRIAR`.
 *
 * Até aqui o portal só simulava (`ZNFE_OV_SIMULAR`, preços/pesos). Este módulo
 * envia de fato o pedido concluído para o SAP no checkout
 * (Salvo → Aguardando Pagamento/Processando) e grava o número da ordem
 * devolvida (`VBELN`) na proposta.
 *
 * Contrato: SOAP 1.1 (`text/xml`), namespace `urn:sap-com:document:sap:rfc:functions`
 * — igual ao cadastro de clientes. Envelope de referência em
 * `docs/sap/znfe_ov_criar.request.xml`.
 *
 * Variáveis de ambiente:
 *   SAP_OV_CRIAR_URL      endpoint da RFC (obrigatório para ativar o envio)
 *   SAP_BRIDGE_USER/PASSWORD ou SAP_BRIDGE_AUTH / SAP_OV_AUTH
 *   SAP_OV_TESTRUN=X      envia como validação (não grava no SAP)
 *   SAP_OV_ZTERM_VISTA    condição de pagamento à vista (default 2P00)
 *   SAP_OV_ZTERM_PRAZO    condição de pagamento a prazo (default B000)
 */

import { XMLParser } from "fast-xml-parser";
import { tpOvDoPedido, contribuinteDoFaturamento } from "./sap-tp-ov";
import * as db from "./propostas-db.server";
import { logIntegrationEvent } from "./integration-logs.server";
import { simularPrecosSap } from "./sap-precos.server";
import { deveCriarOferta } from "./fretefy-oferta";
import { SAP_ACCEPT_LANGUAGE, comIdiomaPT } from "./sap-lang.server";


export type SapOvResultado = {
  enviado: boolean;
  ok: boolean;
  /** Número da ordem de venda no SAP (VBELN). */
  vbeln: string | null;
  mensagem: string | null;
  motivo?: string;
  testrun: boolean;
  /** Problemas encontrados na validação prévia (bloqueiam o envio). */
  pendencias?: string[];
  /** Avisos que não impedem o envio. */
  avisos?: string[];
};

export type SapOvValidacao = { ok: boolean; pendencias: string[]; avisos: string[] };


const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const digitos = (v: unknown) => String(v ?? "").replace(/\D+/g, "");

/**
 * O SAP só aceita FOB ou CIF em INCO1. "DEDICADO" é conceito do portal e vai
 * como CIF (igual à plataforma antiga, calculadora.php:1299).
 */
const incoterm = (mod: unknown) =>
  String(mod ?? "").trim().toUpperCase() === "FOB" ? "FOB" : "CIF";

/** Modalidades aceitas no portal (todas traduzíveis para INCO1). */
const MODALIDADES_FRETE = ["CIF", "FOB", "DEDICADO"];

/**
 * Vendedor da ordem no SAP.
 *
 * Enquanto o pedido está aberto (status "Salvo"), o vendedor é sempre o dono
 * atual da proposta — se a conta for transferida, a oportunidade em aberto vai
 * junto. Ao concluir (envio ao SAP), o código é gravado em
 * `sap_vendedor_codigo` e fica travado para sempre naquele pedido.
 */
export async function enriquecerVendedorSap(row: Record<string, any>): Promise<Record<string, any>> {
  const travado = String(row["sap_vendedor_codigo"] ?? "").trim();
  if (travado) return { ...row, consultor_codigo_sap: travado };

  const id = String(row["consultor_id"] ?? "").trim();
  const nome = String(row["consultor_nome"] ?? "").trim();
  if (!id && !nome) return row;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = supabaseAdmin.from("profiles").select("numero_sap").limit(1);
    const { data } = id ? await q.eq("id", id) : await q.eq("full_name", nome);
    const codigo = String((data?.[0] as any)?.numero_sap ?? "").trim();
    if (codigo) return { ...row, consultor_codigo_sap: codigo };
  } catch {
    /* sem código: a validação apenas avisa */
  }
  return row;
}
const norm = (c: unknown) => String(c ?? "").trim().replace(/^0+(?=\d)/, "");
const hojeIso = () => new Date().toISOString().slice(0, 10);

function achar(o: any, chave: string): any {
  if (o == null || typeof o !== "object") return undefined;
  if (chave in o) return o[chave];
  for (const k of Object.keys(o)) {
    const r = achar(o[k], chave);
    if (r !== undefined) return r;
  }
  return undefined;
}

function credenciais() {
  const url = process.env["SAP_OV_CRIAR_URL"];
  const user = process.env["SAP_BRIDGE_USER"];
  const pass = process.env["SAP_BRIDGE_PASSWORD"];
  const bruto = process.env["SAP_OV_AUTH"] ?? process.env["SAP_BRIDGE_AUTH"];
  const auth = bruto
    ? bruto.startsWith("Basic ") || bruto.startsWith("Bearer ")
      ? bruto
      : `Basic ${bruto}`
    : user && pass
      ? `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`
      : undefined;
  return { url, auth };
}

export function sapOvConfigurado() {
  const { url, auth } = credenciais();
  return Boolean(url && auth);
}

/** Constantes por unidade (ver docs/sap/README.md). */
function constantes(_organizacao: string, row: Record<string, any> = {}) {
  return {
    empresa: "9800",
    // 9800 é a EMPRESA, não uma filial — o SAP recusa ("código da filial 9800 é
    // inválido"). A filial de venda é 9802 para todas as organizações.
    filial: String(process.env["SAP_OV_FILIAL"] ?? "9802").trim() || "9802",
    // TP_OV pela condição fiscal do parceiro faturado (IE), não pela unidade.
    tpOv: tpOvDoPedido(
      row["tipo_nf"],
      contribuinteDoFaturamento({
        contribuinte: row["contribuinte"],
        faturarClienteFinal: row["faturar_cliente_final"],
        faturamento: (row["faturamento"] ?? {}) as { contribuinte?: unknown; doc?: unknown },
        clienteDoc: row["cliente_doc"],
      }),

    ),
  };
}

/**
 * Condição de pagamento (ZTERM).
 *
 * À vista 2P00 · Pix 2PPX · Cartão de crédito 2PCC. Boleto a prazo não tem
 * código fixo: o vendedor escolhe a condição no catálogo
 * (`condicoes_pagamento`) e o código escolhido é gravado na proposta em
 * `condicao_pagamento_codigo`. Sem escolha, cai em 2P00.
 */
function zterm(row: Record<string, any>): string {
  const escolhido = String(row["condicao_pagamento_codigo"] ?? "").trim().toUpperCase();
  if (escolhido) return escolhido;

  const f = String(row["forma_pagamento"] ?? "").toLowerCase();
  const vista = process.env["SAP_OV_ZTERM_VISTA"] ?? "2P00";
  if (f.includes("pix")) return process.env["SAP_OV_ZTERM_PIX"] ?? "2PPX";
  if (f.includes("cart")) return process.env["SAP_OV_ZTERM_CARTAO"] ?? "2PCC";
  return vista;
}

/**
 * Parcelas de `T_PAGTO`.
 *
 * Fonte da verdade: o JSONB `parcelas` da condição escolhida
 * (`condicoes_pagamento.parcelas`, ex.: `[{"dias":30},{"dias":60}]`), carregado
 * em `condicao_pagamento_parcelas`. `dias: 0` é parcela válida (à vista no
 * faturamento). Só quando não houver JSONB é que os prazos são inferidos da
 * descrição por regex ("30/60/90 DDL"); sem nada, uma parcela com o total.
 */
export function parcelasDoPedido(
  row: Record<string, any>,
  total: number,
  hoje = hojeIso(),
): { parcela: number; vencimento: string; valor: number }[] {
  const jsonb = row["condicao_pagamento_parcelas"];
  const doJson = Array.isArray(jsonb)
    ? jsonb
        .map((p: any) => Number(typeof p === "number" ? p : (p?.dias ?? p?.days ?? NaN)))
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 720)
    : [];

  const dias = doJson.length
    ? doJson
    : (String(row["condicao_pagamento_descricao"] ?? "")
        .trim()
        .match(/\d{1,3}/g) ?? [])
        .map(Number)
        .filter((n) => n > 0 && n <= 720);

  if (!dias.length) {
    const venc = String(row["pagamento_vencimento"] ?? "").slice(0, 10) || hoje;
    return [{ parcela: 1, vencimento: venc, valor: Math.round(total * 100) / 100 }];
  }

  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / dias.length);
  return dias.map((d, i) => {
    const dt = new Date(`${hoje}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + d);
    const valor = (i === dias.length - 1 ? centavos - base * (dias.length - 1) : base) / 100;
    return { parcela: i + 1, vencimento: dt.toISOString().slice(0, 10), valor };
  });
}

/** Carrega o JSONB `parcelas` da condição de pagamento escolhida no pedido. */
export async function carregarParcelasCondicao(row: Record<string, any>): Promise<unknown[] | null> {
  const codigo = String(row["condicao_pagamento_codigo"] ?? "").trim();
  if (!codigo) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("condicoes_pagamento")
      .select("parcelas")
      .eq("codigo", codigo)
      .maybeSingle();
    const p = (data as any)?.parcelas;
    return Array.isArray(p) && p.length ? p : null;
  } catch {
    return null;
  }
}



function observacoes(row: Record<string, any>): string[] {
  const obs: string[] = [];
  const texto = String(row["observacoes"] ?? "").trim();
  if (texto) obs.push(...texto.split(/\r?\n/).filter(Boolean));

  const contatoNome = String(row["cliente_contato"] ?? row["cliente_nome"] ?? "").trim();
  const tel = String(row["cliente_telefone"] ?? "").trim();
  if (contatoNome || tel) obs.push(`Contato: ${contatoNome}${tel ? ` Telefone ${tel}` : ""}`);

  if (row["entrega_diferente"]) {
    const e = (row["entrega"] ?? {}) as Record<string, any>;
    const partes = [
      [e["logradouro"], e["numero"]].filter(Boolean).join(", "),
      e["complemento"],
      e["bairro"],
      [e["cidade"], e["uf"]].filter(Boolean).join(" - "),
      e["cep"] ? `CEP: ${e["cep"]}` : "",
    ]
      .filter((p) => String(p ?? "").trim())
      .join(" - ");
    if (partes) obs.push(`Entregar no endereço: ${partes}`);
  }

  const transp = String(row["transportadora"] ?? "").trim();
  if (transp) obs.push(`Transportadora: ${transp} (${String(row["frete_mod"] ?? "").toUpperCase()})`);

  if (row["kit_fotovoltaico"]) obs.push("PEDIDO KIT FOTOVOLTAICO");
  if (row["frete_bonificado"])
    obs.push(`FRETE BONIFICADO - valor R$ ${Number(row["frete_valor"] ?? 0).toFixed(2)} por conta da 2P`);

  // O SAP corta a observação em 132 caracteres por linha.
  return obs.flatMap((o) => String(o).match(/.{1,130}/g) ?? []).slice(0, 20);
}

function parceiro(role: "AG" | "CL" | "ZT", doc: string, nome: string) {
  const d = digitos(doc);
  // Documento pode chegar sem o zero à esquerda (13 dígitos): o SAP exige
  // 14 posições no CNPJ e 11 no CPF, senão não encontra o parceiro.
  const cnpj = d.length > 11 ? d.padStart(14, "0") : "";
  const cpf = d && d.length <= 11 ? d.padStart(11, "0") : "";
  // Ordem e conjunto de campos idênticos ao request validado (ov-testrun.xml):
  // o deserializador do SAP é estrito quanto à ordem/presença dos elementos.
  return (
    `<item>` +
    `<PARTN_ROLE>${role}</PARTN_ROLE>` +
    `<CNPJ>${esc(cnpj)}</CNPJ>` +
    `<CPF>${esc(cpf)}</CPF>` +
    `<NAME>${esc(String(nome ?? "").slice(0, 35))}</NAME>` +
    `<NAME_2></NAME_2>` +
    `<NAME_3></NAME_3>` +
    `<NAME_4></NAME_4>` +
    `<STREET></STREET>` +
    `<POSTL_CODE></POSTL_CODE>` +
    `<CITY></CITY>` +
    `<DISTRICT></DISTRICT>` +
    `<REGION></REGION>` +
    `<TELEPHONE></TELEPHONE>` +
    `<FAX_NUMBER></FAX_NUMBER>` +
    `<E_MAIL></E_MAIL>` +
    `<PAIS></PAIS>` +
    `<NUMERO></NUMERO>` +
    `<COMPLEMENTO></COMPLEMENTO>` +
    `<KUNNR></KUNNR>` +
    `<PLTYP>01</PLTYP>` +
    `</item>`
  );
}


type Peso = { bruto: number; liquido: number };

function envelope(row: Record<string, any>, peso: Peso, testrun: boolean): string {
  const c = constantes(String(row["organizacao"] ?? "carregadores"), row);
  const hoje = hojeIso();
  const itens = (Array.isArray(row["itens"]) ? (row["itens"] as any[]) : []).filter(
    (i) => norm(i?.codigo) && Number(i?.qtd ?? 0) > 0,
  );

  // Kit fotovoltaico: o material comercial 100000350 é enviado ao SAP como o
  // material de produção 100000278 (regra da plataforma antiga).
  const kit = Boolean(row["kit_fotovoltaico"]);
  const materialSap = (codigo: string) =>
    kit && codigo === "100000350" ? "100000278" : codigo;
  // VALOR_PROD vai VAZIO: o preço vem da condição do SAP (igual à antiga).
  const linhas = itens
    .map(
      (i, idx) =>
        `<item>` +
        `<ITM_NUMBER>${idx + 1}</ITM_NUMBER>` +
        `<MATERIAL>${esc(materialSap(norm(i.codigo)))}</MATERIAL>` +
        `<BILL_DATE>${hoje}</BILL_DATE>` +
        `<UM>UN</UM>` +
        `<QTDE>${Number(i.qtd)}</QTDE>` +
        `<PESO_BRUTO></PESO_BRUTO>` +
        `<PESO_LIQ></PESO_LIQ>` +
        `<UM_PESO></UM_PESO>` +
        `<VALOR_PROD></VALOR_PROD>` +
        `<VALOR_DESC></VALOR_DESC>` +
        `<PERC_DESC></PERC_DESC>` +
        `<NCM></NCM>` +
        `<FCI></FCI>` +
        `<EAN></EAN>` +
        `<DEPOSITO></DEPOSITO>` +
        `</item>`,
    )
    .join("");


  const docCliente = digitos(row["cliente_doc"]);
  const nomeCliente = String(row["cliente_nome"] ?? "");
  const emissor =
    row["faturar_cliente_final"] && digitos((row["faturamento"] ?? {})["doc"])
      ? parceiro("AG", (row["faturamento"] ?? {})["doc"], (row["faturamento"] ?? {})["nome"] ?? nomeCliente)
      : parceiro("AG", docCliente, nomeCliente);

  // Transportadora escolhida (CIF ou dedicado) entra na OV como parceiro ZT.
  const docTransp = digitos(row["transportadora_documento"]);
  const transportadoraParceiro = docTransp
    ? parceiro("ZT", docTransp, String(row["transportadora"] ?? ""))
    : "";

  const obs = observacoes(row)
    .map((o) => `<item><OBS>${esc(o)}</OBS></item>`)
    .join("");

  const email = String(row["cliente_email"] ?? "").trim();
  const totais = (row["totais"] ?? {}) as Record<string, number>;
  const valorTotal = Number(totais["valorTotal"] ?? 0);
  const freteValor = Number(row["frete_valor"] ?? 0);

  // Frete bonificado: INCO2 = "CIF BONIFICADO" e o valor do frete entra como
  // desconto do pedido (mesma regra da plataforma antiga).
  const bonificado = Boolean(row["frete_bonificado"]);
  const desconto = Number(totais["desconto"] ?? 0) + (bonificado ? freteValor : 0);

  const parcelas = parcelasDoPedido(row, valorTotal, hoje)
    .map(
      (p) =>
        `<item>` +
        `<PARCELA>${p.parcela}</PARCELA>` +
        `<DT_VENCTO>${esc(p.vencimento)}</DT_VENCTO>` +
        `<VALOR>${p.valor.toFixed(2)}</VALOR>` +
        `<TIPO_PG></TIPO_PG>` +
        `</item>`,
    )
    .join("");

  // Espelho byte a byte do request validado em produção (docs: ov-testrun.xml).
  // O deserializador do SAP é estrito: ordem, presença dos elementos e prefixo
  // `n0` do nome da função precisam ser exatamente estes.
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:urn="urn:sap-com:document:sap:rfc:functions">
  <soap:Header/>
  <soap:Body>
    <n0:ZNFE_OV_CRIAR xmlns:n0="urn:sap-com:document:sap:rfc:functions">
      <I_CARGA>S</I_CARGA>
      <I_JOB></I_JOB>
      <I_JOBNAME></I_JOBNAME>
      <I_ORIG_PEDIDO>4</I_ORIG_PEDIDO>
      <I_S_OV>
        <EMPRESA>${c.empresa}</EMPRESA>
        <FILIAL>${c.filial}</FILIAL>
        <TP_OV>${c.tpOv}</TP_OV>
        <VKBUR></VKBUR>
        <VKGRP></VKGRP>
        <INCO1>${incoterm(row["frete_mod"])}</INCO1>
        <INCO2>${bonificado ? "CIF BONIFICADO" : ""}</INCO2>
        <PURCH_DATE>${hoje}</PURCH_DATE>
        <DATA_REMESSA>${hoje}</DATA_REMESSA>
        <NROPED>${esc(String(row["numero"] ?? "").trim())}</NROPED>
        <VALOR_DESC>${desconto > 0 ? desconto.toFixed(2) : "0"}</VALOR_DESC>
        <PERC_DESC></PERC_DESC>
        <VLR_FRETE>${freteValor.toFixed(2)}</VLR_FRETE>
        <ZTERM>${esc(zterm(row))}</ZTERM>
        <NRO_BANCO></NRO_BANCO>
        <XPED>${esc(String(row["numero"] ?? "").trim())}</XPED>
        <QVOL></QVOL>
        <PESO_BRUTO></PESO_BRUTO>
        <PESO_LIQ></PESO_LIQ>
        <ESP></ESP>
        <VKORG></VKORG>
        <VTWEG></VTWEG>
        <SPART></SPART>
        <AUGRU></AUGRU>
        <VENDEDOR>${esc(String(row["consultor_codigo_sap"] ?? "").trim())}</VENDEDOR>
        <IMEI_VENDEDOR></IMEI_VENDEDOR>
        <NOME_VENDEDOR>${esc(String(row["consultor_nome"] ?? "").slice(0, 35))}</NOME_VENDEDOR>
        <EMAIL_VENDEDOR></EMAIL_VENDEDOR>
        <CPF_VENDEDOR></CPF_VENDEDOR>
      </I_S_OV>
      <I_S_TRANSP>
        <QVOL></QVOL>
        <PESO_BRUTO>${peso.bruto ? peso.bruto.toFixed(3) : ""}</PESO_BRUTO>
        <PESO_LIQ>${peso.liquido ? peso.liquido.toFixed(3) : ""}</PESO_LIQ>
        <ESP></ESP>
      </I_S_TRANSP>
      <I_TESTRUN>${testrun ? "X" : ""}</I_TESTRUN>
      <I_USUARIO></I_USUARIO>
      <I_XMLNFE></I_XMLNFE>
      <T_EMAIL><item><EMAIL>${esc(email)}</EMAIL></item></T_EMAIL>
      <T_ITEM>${linhas}</T_ITEM>
      <T_MSG><item><TYPE>S</TYPE><MSGNR>000</MSGNR><MESSAGE></MESSAGE><MSGID></MSGID></item></T_MSG>
      <T_OBS>${obs}</T_OBS>
      <T_PAGTO>${parcelas}</T_PAGTO>
      <T_PARCEIRO>
        ${emissor}
        ${parceiro("CL", docCliente, nomeCliente)}
        ${transportadoraParceiro}
      </T_PARCEIRO>
    </n0:ZNFE_OV_CRIAR>
  </soap:Body>
</soap:Envelope>`;
}

/** Soma os pesos dos itens usando a própria simulação do SAP. */
async function pesosDoPedido(itens: any[]): Promise<Peso> {
  try {
    const mapa = await simularPrecosSap(
      itens.map((i) => ({ codigo: String(i.codigo), quantidade: Number(i.qtd ?? 0) })),
    );
    let bruto = 0;
    let liquido = 0;
    for (const i of itens) {
      const v = mapa.get(norm(i.codigo));
      if (!v) continue;
      bruto += v.pesoBruto || v.pesoLiquido || 0;
      liquido += v.pesoLiquido || 0;
    }
    return { bruto: Math.round(bruto * 1000) / 1000, liquido: Math.round(liquido * 1000) / 1000 };
  } catch {
    return { bruto: 0, liquido: 0 };
  }
}

export type SapMsgItem = { tipo: string; msgnr: string; texto: string };

function mensagens(doc: any): {
  erro: string | null;
  aviso: string | null;
  texto: string | null;
  /** Nº da OV extraído de T_MSG (TYPE=S, MSGNR=000) — como faz a plataforma antiga. */
  numeroSucesso: string | null;
  /** Todos os itens do T_MSG, para diagnóstico. */
  itens: SapMsgItem[];
  /** Texto completo (TYPE/MSGNR: MESSAGE) de todos os itens do T_MSG. */
  detalhado: string | null;
  /** O SAP indicou que já existe ordem para este NROPED. */
  duplicado: boolean;
} {
  let msgs = achar(doc, "T_MSG")?.item ?? [];
  if (!Array.isArray(msgs)) msgs = msgs ? [msgs] : [];
  const linhas = (msgs as any[]).map((m) => ({
    tipo: String(m?.TYPE ?? "").toUpperCase(),
    msgnr: String(m?.MSGNR ?? "").trim(),
    texto: String(m?.MESSAGE ?? "").trim(),
  }));
  const num = (v: string) => Number(v.replace(/\D+/g, "") || "-1");
  // Erro = TYPE E/A/X, ou W com MSGNR 036 (rejeição disfarçada de aviso).
  const erro = linhas.find(
    (l) => l.tipo === "E" || l.tipo === "A" || l.tipo === "X" || (l.tipo === "W" && num(l.msgnr) === 36),
  );
  const aviso = linhas.find((l) => l.tipo === "W" && num(l.msgnr) !== 36);
  const texto = linhas.map((l) => l.texto).filter(Boolean).join(" | ").slice(0, 500) || null;
  const detalhado =
    linhas
      .map((l) => `${l.tipo || "?"}${l.msgnr ? `/${l.msgnr}` : ""}: ${l.texto}`)
      .filter((s) => s.trim().length > 3)
      .join(" | ") || null;

  const duplicado = linhas.some((l) =>
    /(j[áa]\s+existe|duplicad|already exists|pedido\s+j[áa]\s+(criado|cadastrado))/i.test(l.texto),
  );

  // Nº da OV: item com MSGNR=000 (MSGNR=017 é só a confirmação textual).
  const sucesso = linhas.find((l) => num(l.msgnr) === 0 && /\d{4,}/.test(l.texto));
  const numeroSucesso = sucesso ? (/(\d{4,12})/.exec(sucesso.texto)?.[1] ?? null) : null;

  return {
    erro: erro?.texto || (erro ? "Erro retornado pelo SAP." : null),
    aviso: aviso?.texto || (aviso ? "Aviso retornado pelo SAP." : null),
    texto,
    numeroSucesso,
    itens: linhas,
    detalhado,
    duplicado,
  };
}



/** Valida CNPJ pelos dígitos verificadores. */
function cnpjValido(v: unknown): boolean {
  const d = digitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (base: string) => {
    let peso = base.length - 7;
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(d.slice(0, 12)) === Number(d[12]) && calc(d.slice(0, 13)) === Number(d[13]);
}

/**
 * Validação prévia ao `ZNFE_OV_CRIAR`: campos obrigatórios do cabeçalho,
 * documento do cliente/emissor, itens (código SAP, quantidade e valor) e
 * coerência dos totais. Evita gastar uma tentativa em erro do SAP.
 */
export function validarPedidoParaSap(row: Record<string, any>): SapOvValidacao {
  const pendencias: string[] = [];
  const avisos: string[] = [];

  const numero = String(row["numero"] ?? "").trim();
  if (!numero) pendencias.push("Número do pedido não definido.");
  if (!String(row["cliente_nome"] ?? "").trim()) pendencias.push("Cliente sem nome/razão social.");

  const docCliente = digitos(row["cliente_doc"]);
  if (!docCliente) pendencias.push("Cliente sem CNPJ informado.");
  else if (docCliente.length !== 14) pendencias.push("CNPJ do cliente inválido (são necessários 14 dígitos).");
  else if (!cnpjValido(docCliente)) pendencias.push(`CNPJ do cliente inválido (${docCliente}).`);

  if (row["faturar_cliente_final"]) {
    const fat = (row["faturamento"] ?? {}) as Record<string, any>;
    const docFat = digitos(fat["doc"]);
    if (!docFat) pendencias.push("Faturamento para cliente final marcado, mas sem CPF/CNPJ do emissor.");
    else if (docFat.length === 14 && !cnpjValido(docFat)) pendencias.push(`CNPJ de faturamento inválido (${docFat}).`);
    else if (docFat.length !== 14 && docFat.length !== 11)
      pendencias.push("CPF/CNPJ de faturamento com quantidade de dígitos inválida.");
    if (!String(fat["nome"] ?? "").trim()) avisos.push("Faturamento sem nome — será usado o nome do cliente.");
  }

  const mod = String(row["frete_mod"] ?? "").trim().toUpperCase();
  if (!mod) pendencias.push("Modalidade de frete (CIF/FOB) não definida.");
  else if (!MODALIDADES_FRETE.includes(mod))
    pendencias.push(`Modalidade de frete inválida para o SAP: "${mod}".`);
  if ((mod === "CIF" || mod === "DEDICADO") && !(Number(row["frete_valor"] ?? 0) > 0))
    avisos.push("Frete CIF sem valor calculado — a ordem irá com frete zerado.");

  if (!String(row["forma_pagamento"] ?? "").trim()) pendencias.push("Forma de pagamento não definida.");
  if (!String(row["consultor_codigo_sap"] ?? "").trim())
    avisos.push("Vendedor sem código SAP cadastrado — a ordem irá sem o vendedor.");

  const venc = String(row["pagamento_vencimento"] ?? "").slice(0, 10);
  if (venc && !/^\d{4}-\d{2}-\d{2}$/.test(venc)) pendencias.push(`Data de vencimento inválida: "${venc}".`);

  // Itens
  const brutos = Array.isArray(row["itens"]) ? (row["itens"] as any[]) : [];
  const itens = brutos.filter((i) => Number(i?.qtd ?? 0) > 0);
  if (!itens.length) pendencias.push("Pedido sem itens com quantidade maior que zero.");

  const semCodigo = itens.filter((i) => !norm(i?.codigo));
  if (semCodigo.length)
    pendencias.push(
      `${semCodigo.length} item(ns) sem código SAP (de-para do material): ${semCodigo
        .map((i) => String(i?.descricao ?? i?.nome ?? "item").slice(0, 40))
        .slice(0, 5)
        .join(", ")}.`,
    );

  // O SAP só aceita material numérico; SKU comercial (2P-...) é de/para pendente.
  const codigoAlfa = itens.filter((i) => norm(i?.codigo) && !/^\d+$/.test(norm(i?.codigo)));
  if (codigoAlfa.length)
    pendencias.push(
      `${codigoAlfa.length} item(ns) sem código SAP numérico no catálogo (de-para pendente): ${codigoAlfa
        .map((i) => norm(i?.codigo))
        .slice(0, 5)
        .join(", ")}.`,
    );


  const qtdInvalida = itens.filter((i) => !Number.isFinite(Number(i?.qtd)) || Number(i?.qtd) <= 0);
  if (qtdInvalida.length) pendencias.push(`${qtdInvalida.length} item(ns) com quantidade inválida.`);

  const semValor = itens.filter((i) => !(Number(i?.valor ?? 0) > 0));
  if (semValor.length)
    pendencias.push(
      `${semValor.length} item(ns) sem valor (preço não retornado do SAP): ${semValor
        .map((i) => norm(i?.codigo) || String(i?.descricao ?? "item").slice(0, 30))
        .slice(0, 5)
        .join(", ")}.`,
    );

  const duplicados = new Map<string, number>();
  for (const i of itens) {
    const k = norm(i?.codigo);
    if (k) duplicados.set(k, (duplicados.get(k) ?? 0) + 1);
  }
  const repetidos = [...duplicados.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  if (repetidos.length) avisos.push(`Material repetido em mais de uma linha: ${repetidos.slice(0, 5).join(", ")}.`);

  // Totais
  // Carregadores grava `valor` como total da linha; Solar grava `valor`
  // unitário e `total` da linha. O esperado desconta cupom e usa o frete
  // efetivamente cobrado (bonificado não entra no total do cliente).
  const totais = (row["totais"] ?? {}) as Record<string, any>;
  const valorTotal = Number(totais["valorTotal"] ?? 0);
  if (!(valorTotal > 0)) pendencias.push("Valor total do pedido zerado ou ausente.");
  else {
    const somaItens = itens.reduce((a, i) => {
      const total = Number(i?.total ?? 0);
      return a + (Number.isFinite(total) && total > 0 ? total : Number(i?.valor ?? 0));
    }, 0);
    const desconto = Number(totais["desconto"] ?? 0);
    const frete =
      totais["freteCobrado"] !== undefined && totais["freteCobrado"] !== null
        ? Number(totais["freteCobrado"])
        : row["frete_bonificado"]
          ? 0
          : Number(row["frete_valor"] ?? 0);
    const esperado = somaItens - desconto + frete;
    if (somaItens > 0 && Math.abs(esperado - valorTotal) > Math.max(1, valorTotal * 0.02))
      avisos.push(
        `Total do pedido (${valorTotal.toFixed(2)}) difere da soma dos itens + frete (${esperado.toFixed(2)}).`,
      );
  }


  return { ok: pendencias.length === 0, pendencias, avisos };
}



/**
 * Envia a ordem de venda ao SAP e grava o retorno na proposta.
 * Nunca lança: devolve o resultado para o chamador registrar/exibir.
 */
export async function criarOrdemVendaSap(
  propostaId: string,
  opts: { testrun?: boolean; forcar?: boolean } = {},
): Promise<SapOvResultado> {
  const inicio = Date.now();
  const base = { slug: "sap", event: "ov.criar" } as const;
  const base0 = await db.getProposta(propostaId);
  if (!base0)
    return { enviado: false, ok: false, vbeln: null, mensagem: "Proposta não encontrada.", testrun: false };
  const row: Record<string, any> = base0;

  const jaEnviada = String(row["sap_ov_numero"] ?? "").trim();
  if (jaEnviada && !opts.forcar) {
    return {
      enviado: false,
      ok: true,
      vbeln: jaEnviada,
      mensagem: "Ordem de venda já criada no SAP.",
      motivo: "ja_criada",
      testrun: false,
    };
  }

  const { url, auth } = credenciais();
  if (!url || !auth) {
    return {
      enviado: false,
      ok: false,
      vbeln: null,
      mensagem: "Integração de ordem de venda não configurada (SAP_OV_CRIAR_URL / credenciais).",
      motivo: "nao_configurado",
      testrun: false,
    };
  }

  // Claim atômico: com o fluxo do Pix, o webhook e a reconsulta de 15min podem
  // disparar a criação do mesmo pedido quase ao mesmo tempo. Só um envio ganha
  // o lock; o outro sai sem erro (o SAP recusaria por NROPED duplicado).
  // Falha FECHADO: erro no claim aborta o envio (uma retentativa depois é
  // sempre mais barata que uma ordem duplicada no SAP).
  if (!opts.forcar) {
    let ganhou: unknown;
    try {
      ganhou = await db.atualizarProposta(propostaId, { sap_ov_status: "enviando" }, {
        or: '(sap_ov_status.is.null,sap_ov_status.not.in.("enviando","criada"))',
      });
    } catch (e) {
      const mensagem = `Não foi possível reservar o envio da ordem de venda: ${(e as Error).message}`;
      await logIntegrationEvent({
        ...base,
        level: "error",
        message: mensagem.slice(0, 500),
        detail: { proposta_id: propostaId, numero: row["numero"] ?? null, etapa: "claim" },
      });
      return { enviado: false, ok: false, vbeln: null, mensagem, motivo: "claim_falhou", testrun: false };
    }
    if (ganhou === null) {
      return {
        enviado: false,
        ok: true,
        vbeln: null,
        mensagem: "Envio da ordem de venda já em andamento.",
        motivo: "em_andamento",
        testrun: false,
      };
    }
  }

  const itens = (Array.isArray(row["itens"]) ? (row["itens"] as any[]) : []).filter(
    (i) => Number(i?.qtd ?? 0) > 0,
  );

  Object.assign(row, await enriquecerVendedorSap(row));
  // T_PAGTO usa o JSONB `parcelas` da condição escolhida (fallback: descrição).
  row["condicao_pagamento_parcelas"] = await carregarParcelasCondicao(row);

  const validacao = validarPedidoParaSap(row);
  if (!validacao.ok) {
    const mensagem = `Pedido não passou na validação prévia: ${validacao.pendencias.join(" ")}`.slice(0, 500);
    await gravar(propostaId, { sap_ov_status: "erro", sap_ov_mensagem: mensagem });
    await logIntegrationEvent({
      ...base,
      level: "error",
      message: mensagem,
      detail: {
        proposta_id: propostaId,
        numero: row["numero"] ?? null,
        pendencias: validacao.pendencias,
        avisos: validacao.avisos,
        etapa: "validacao",
      },
      durationMs: Date.now() - inicio,
    });
    return {
      enviado: false,
      ok: false,
      vbeln: null,
      mensagem,
      motivo: "validacao",
      testrun: false,
      pendencias: validacao.pendencias,
      avisos: validacao.avisos,
    };
  }
  if (validacao.avisos.length) {
    await logIntegrationEvent({
      ...base,
      level: "warn",
      message: `Avisos na validação do pedido: ${validacao.avisos.join(" ")}`.slice(0, 500),
      detail: { proposta_id: propostaId, numero: row["numero"] ?? null, avisos: validacao.avisos },
    });
  }

  const testrun = opts.testrun ?? String(process.env["SAP_OV_TESTRUN"] ?? "").toUpperCase() === "X";

  // Faturamento para cliente final: o parceiro (AG) precisa existir no SAP
  // antes da ordem. Cadastra/atualiza pela mesma RFC de clientes; se falhar, a
  // ordem NÃO é enviada (o SAP recusaria com erro de parceiro inexistente).
  if (!testrun && row["faturar_cliente_final"]) {
    const r = await cadastrarParceiroFaturamento(row);
    if (!r.ok) {
      const mensagem = `Cliente final não pôde ser cadastrado no SAP: ${r.erro}`.slice(0, 500);
      await gravar(propostaId, { sap_ov_status: "erro", sap_ov_mensagem: mensagem });
      await logIntegrationEvent({
        ...base,
        level: "error",
        message: mensagem,
        detail: { proposta_id: propostaId, numero: row["numero"] ?? null, etapa: "parceiro-faturamento" },
        durationMs: Date.now() - inicio,
      });
      return { enviado: false, ok: false, vbeln: null, mensagem, motivo: "parceiro_faturamento", testrun: false };
    }
  }


  const peso = await pesosDoPedido(itens);
  const corpo = envelope(row, peso, testrun);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let xml = "";
  let httpStatus = 0;
  try {
    const res = await fetch(comIdiomaPT(url), {
      method: "POST",
      // Exatamente os headers do request validado: só Authorization e
      // Content-Type (o mandante 500 vem na própria URL). Nada de SOAPAction,
      // accept-language ou cookie sap-usercontext.
      headers: {
        "content-type": "application/soap+xml; charset=utf-8",
        "accept-language": SAP_ACCEPT_LANGUAGE,
        authorization: auth,
      },


      body: corpo,
      signal: controller.signal,
    });
    httpStatus = res.status;
    xml = await res.text();
  } catch (e) {
    const mensagem = `Falha de comunicação com o SAP: ${(e as Error).message}`;
    // libera o claim para a próxima tentativa
    await gravar(propostaId, { sap_ov_status: "erro", sap_ov_mensagem: mensagem.slice(0, 500) });
    await logIntegrationEvent({
      ...base,
      level: "error",
      message: mensagem,
      detail: { proposta_id: propostaId, numero: row["numero"] ?? null },
      durationMs: Date.now() - inicio,
    });
    return { enviado: true, ok: false, vbeln: null, mensagem, testrun };
  } finally {
    clearTimeout(timer);
  }

  const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false });
  let doc: any = null;
  try {
    doc = parser.parse(xml);
  } catch {
    /* resposta não-XML cai no tratamento abaixo */
  }

  const fault = doc ? achar(doc, "Fault") : null;
  if (!doc || fault || httpStatus >= 400) {
    const texto =
      (/<[^>]*Text[^>]*>([\s\S]*?)<\/[^>]*Text>/i.exec(xml)?.[1] ?? xml)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 400) || `HTTP ${httpStatus}`;
    const mensagem = `SAP recusou a ordem de venda (${httpStatus}): ${texto}`;
    await gravar(propostaId, { sap_ov_status: "erro", sap_ov_mensagem: mensagem });
    await logIntegrationEvent({
      ...base,
      level: "error",
      message: mensagem,
      detail: { proposta_id: propostaId, numero: row["numero"] ?? null, http: httpStatus },
      durationMs: Date.now() - inicio,
    });
    return { enviado: true, ok: false, vbeln: null, mensagem, testrun };
  }

  const { erro, aviso, texto, numeroSucesso, itens: msgItens, detalhado, duplicado } = mensagens(doc);
  let vbeln =
    String(achar(doc, "E_VBELN") ?? achar(doc, "E_VBELN_VA") ?? achar(doc, "E_NRO_OV") ?? "").trim() ||
    numeroSucesso ||
    null;

  // Auto-recuperação: o SAP diz que já existe ordem para este NROPED — a ordem
  // existe, só não veio o número. Busca no ZNFE_OV_CONSULTAR pelo mesmo pedido.
  if (!vbeln && !testrun && duplicado) {
    const nroped = String(row["sap_nroped"] ?? row["numero"] ?? "").trim();
    if (nroped) {
      const { consultarVbelnPorPedido } = await import("./sap-nfs.server");
      const achado = await consultarVbelnPorPedido(nroped);
      if (achado) {
        vbeln = achado;
        await logIntegrationEvent({
          ...base,
          level: "warn",
          message: `Ordem já existia no SAP para o pedido ${nroped}: recuperada ${achado}`,
          detail: { proposta_id: propostaId, numero: row["numero"] ?? null, t_msg: msgItens },
        });
      }
    }
  }

  // Em test run o SAP valida o pedido sem gravar a ordem: não devolve VBELN.
  // Fora do test run, sem VBELN é falha — inclusive quando o SAP só devolve
  // avisos (W), que nesse caso explicam por que a ordem não foi criada.
  if ((erro && !vbeln) || (!vbeln && !testrun)) {
    // A mensagem gravada é SEMPRE o conteúdo completo do T_MSG — sem isso não
    // dá para diagnosticar nada em produção. A genérica só entra se o SAP não
    // devolveu nenhum item (T_MSG vazio).
    const mensagem =
      detalhado ??
      erro ??
      aviso ??
      texto ??
      `O SAP não devolveu o número da ordem de venda nem mensagens (T_MSG vazio, HTTP ${httpStatus}).`;

    await gravar(propostaId, { sap_ov_status: "erro", sap_ov_mensagem: mensagem.slice(0, 500) });
    await logIntegrationEvent({
      ...base,
      level: "error",
      message: mensagem,
      detail: {
        proposta_id: propostaId,
        numero: row["numero"] ?? null,
        testrun,
        t_msg: msgItens,
        payload_resumo: {
          tipo: row["tipo_nf"] ?? null,
          modalidade_frete: row["frete_mod"] ?? null,
          uf: row["uf"] ?? null,
          itens: Array.isArray(row["itens"]) ? row["itens"].length : 0,
          testrun,
        },
        resposta: xml.replace(/\s+/g, " ").slice(0, 1500),
      },
      durationMs: Date.now() - inicio,
    });
    return { enviado: true, ok: false, vbeln: null, mensagem, testrun };
  }




  if (!testrun) {
    await gravar(propostaId, {
      sap_ov_numero: vbeln,
      sap_ov_status: "criada",
      sap_ov_mensagem: texto,
      sap_ov_enviado_em: new Date().toISOString(),
      // vendedor travado no pedido concluído
      sap_vendedor_codigo: String(row["consultor_codigo_sap"] ?? "").trim() || null,
      sap_vendedor_nome: String(row["consultor_nome"] ?? "").trim() || null,
    });

    // Reserva local do estoque (espelha a reserva do SAP até o próximo sync).
    const itensPedido = Array.isArray(row["itens"]) ? (row["itens"] as any[]) : [];
    if (itensPedido.length) {
      const { reservarEstoquePedido } = await import("./estoque-sync.server");
      const reserva = await reservarEstoquePedido(
        itensPedido.map((i) => ({ codigo: String(i?.codigo ?? i?.material ?? ""), qtd: Number(i?.qtd ?? 0) })),
      );
      // Best effort, mas nunca em silêncio: sem log, uma reserva perdida vira
      // estoque disponível fantasma até o próximo sync.
      if (reserva.erro) {
        await logIntegrationEvent({
          ...base,
          level: "warn",
          event: "reserva-estoque",
          message: `Ordem ${vbeln} criada, mas a reserva local de estoque falhou: ${reserva.erro}`.slice(0, 500),
          detail: { proposta_id: propostaId, numero: row["numero"] ?? null, vbeln },
        });
      }
    }

    // Oferta de carga na Fretefy (frete da 2P). Best effort e auditado como
    // job próprio: uma falha aqui nunca desfaz a ordem de venda.
    if (deveCriarOferta(row["frete_mod"])) {
      try {
        const { runJob } = await import("./job-runs.server");
        const { criarOfertaCarga } = await import("./fretefy-oferta.server");
        await runJob(
          { job: "fretefy.oferta-carga", trigger: "portal", payload: { propostaId }, refId: propostaId },
          () => criarOfertaCarga(propostaId),
        );
      } catch {
        /* best effort */
      }
    }



  } else {
    await gravar(propostaId, {
      sap_ov_status: "validada",
      sap_ov_mensagem: texto ?? "Validação OK no SAP (test run).",
    });
  }


  await logIntegrationEvent({
    ...base,
    level: "info",
    message: testrun ? `Validação OK (test run) do pedido ${row["numero"]}` : `Ordem de venda ${vbeln} criada no SAP`,
    detail: { proposta_id: propostaId, numero: row["numero"] ?? null, vbeln, testrun },
    durationMs: Date.now() - inicio,
  });

  return { enviado: true, ok: true, vbeln, mensagem: texto, testrun };
}

/** Gravação tolerante: se as colunas ainda não existirem, não quebra o checkout. */
async function gravar(id: string, patch: Record<string, unknown>) {
  try {
    await db.atualizarProposta(id, patch);
  } catch (e) {
    if (!/sap_ov_|42703|PGRST204/i.test((e as Error).message)) throw e;
  }
}

/**
 * Cadastra/atualiza no SAP o parceiro faturado quando o pedido fatura o
 * cliente final (ZHDIT_CLIENTES_CADASTRO). Reaproveita a mesma integração do
 * cadastro de clientes do portal.
 */
async function cadastrarParceiroFaturamento(
  row: Record<string, any>,
): Promise<{ ok: true; numeroSap: string | null } | { ok: false; erro: string }> {
  const fat = (row["faturamento"] ?? {}) as Record<string, any>;
  const doc = digitos(fat["doc"]);
  if (!doc) return { ok: false, erro: "CPF/CNPJ do cliente final não informado." };

  const { sapClientesConfigurado, enviarClienteParaSap } = await import("./sap-clientes.server");
  if (!sapClientesConfigurado())
    return { ok: false, erro: "Integração de cadastro de clientes do SAP não configurada (SAP_CLIENTES_URL)." };

  const org = String(row["organizacao"] ?? "solar");
  const escopo = org === "carregadores" ? "carregadores" : org === "grupo" ? "grupo" : "solar";

  const r = await enviarClienteParaSap({
    doc,
    razao_social: String(fat["nome"] ?? row["cliente_nome"] ?? "").trim(),
    ie: String(fat["ie"] ?? ""),
    contribuinte: doc.length === 11 ? false : fat["contribuinte"] === true,
    finalidade: String(row["finalidade_uso"] ?? "") || null,
    email: String(row["cliente_email"] ?? ""),
    telefone: String(fat["telefone"] ?? row["cliente_telefone"] ?? ""),
    cep: String(fat["cep"] ?? ""),
    logradouro: String(fat["logradouro"] ?? ""),
    numero: String(fat["numero"] ?? ""),
    complemento: String(fat["complemento"] ?? ""),
    bairro: String(fat["bairro"] ?? ""),
    cidade: String(fat["cidade"] ?? ""),
    uf: String(fat["uf"] ?? row["uf"] ?? ""),
    vendedor_sap: String(row["consultor_codigo_sap"] ?? "") || null,
    condicao_pgto_sap: String(row["condicao_pagamento_codigo"] ?? "") || null,
    escopo_org: escopo as "solar" | "carregadores" | "grupo",
  });

  if (!r.ok) return { ok: false, erro: r.erro };

  await logIntegrationEvent({
    slug: "sap",
    event: "cliente-final.cadastro",
    level: "info",
    message: `Cliente final ${doc} cadastrado/atualizado no SAP para o pedido ${row["numero"] ?? ""}`,
    detail: { proposta_id: row["id"] ?? null, numero_sap: r.numero_sap, mensagem: r.mensagem },
  });
  return { ok: true, numeroSap: r.numero_sap };
}
