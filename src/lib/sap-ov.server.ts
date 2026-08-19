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
import * as db from "./propostas-db.server";
import { logIntegrationEvent } from "./integration-logs.server";
import { simularPrecosSap } from "./sap-precos.server";

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
function constantes(organizacao: string) {
  const carregadores = String(organizacao ?? "").toLowerCase().includes("carregador");
  return {
    empresa: "9800",
    filial: carregadores ? "9802" : "9800",
    tpOv: carregadores ? "ZC2P" : "ZV2P",
    vkorg: "9800",
    vtweg: "10",
    spart: "10",
  };
}

/** Condição de pagamento (ZTERM) a partir da forma escolhida no checkout. */
function zterm(formaPagamento: unknown): string {
  const f = String(formaPagamento ?? "").toLowerCase();
  const prazo = process.env["SAP_OV_ZTERM_PRAZO"] ?? "B000";
  const vista = process.env["SAP_OV_ZTERM_VISTA"] ?? "2P00";
  return f.includes("prazo") ? prazo : vista;
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

  // O SAP corta a observação em 132 caracteres por linha.
  return obs.flatMap((o) => String(o).match(/.{1,130}/g) ?? []).slice(0, 20);
}

function parceiro(role: "AG" | "CL", doc: string, nome: string) {
  const d = digitos(doc);
  return (
    `<item>` +
    `<PARTN_ROLE>${role}</PARTN_ROLE>` +
    `<CNPJ>${d.length === 14 ? esc(d) : ""}</CNPJ>` +
    `<CPF>${d.length === 11 ? esc(d) : ""}</CPF>` +
    `<NAME>${esc(String(nome ?? "").slice(0, 35))}</NAME>` +
    `<PAIS>BR</PAIS>` +
    `</item>`
  );
}

type Peso = { bruto: number; liquido: number };

function envelope(row: Record<string, any>, peso: Peso, testrun: boolean): string {
  const c = constantes(String(row["organizacao"] ?? "carregadores"));
  const hoje = hojeIso();
  const itens = (Array.isArray(row["itens"]) ? (row["itens"] as any[]) : []).filter(
    (i) => norm(i?.codigo) && Number(i?.qtd ?? 0) > 0,
  );

  const linhas = itens
    .map(
      (i, idx) =>
        `<item>` +
        `<ITM_NUMBER>${String((idx + 1) * 10).padStart(6, "0")}</ITM_NUMBER>` +
        `<MATERIAL>${esc(norm(i.codigo))}</MATERIAL>` +
        `<BILL_DATE>${hoje}</BILL_DATE>` +
        `<UM>UN</UM>` +
        `<QTDE>${Number(i.qtd)}</QTDE>` +
        `<VALOR_PROD>${Number(i.valor ?? 0).toFixed(2)}</VALOR_PROD>` +
        `</item>`,
    )
    .join("");

  const docCliente = digitos(row["cliente_doc"]);
  const nomeCliente = String(row["cliente_nome"] ?? "");
  const emissor =
    row["faturar_cliente_final"] && digitos((row["faturamento"] ?? {})["doc"])
      ? parceiro("AG", (row["faturamento"] ?? {})["doc"], (row["faturamento"] ?? {})["nome"] ?? nomeCliente)
      : parceiro("AG", docCliente, nomeCliente);

  const obs = observacoes(row)
    .map((o) => `<item><OBS>${esc(o)}</OBS></item>`)
    .join("");

  const email = String(row["cliente_email"] ?? "").trim();
  const totais = (row["totais"] ?? {}) as Record<string, number>;
  const valorTotal = Number(totais["valorTotal"] ?? 0);
  const vencimento = String(row["pagamento_vencimento"] ?? "").slice(0, 10) || hoje;

  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:sap-com:document:sap:rfc:functions">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:ZNFE_OV_CRIAR>
      <I_CARGA>S</I_CARGA>
      <I_ORIG_PEDIDO>4</I_ORIG_PEDIDO>
      <I_S_OV>
        <EMPRESA>${c.empresa}</EMPRESA>
        <FILIAL>${c.filial}</FILIAL>
        <TP_OV>${c.tpOv}</TP_OV>
        <INCO1>${esc(String(row["frete_mod"] ?? "FOB").toUpperCase())}</INCO1>
        <INCO2></INCO2>
        <PURCH_DATE>${hoje}</PURCH_DATE>
        <DATA_REMESSA>${hoje}</DATA_REMESSA>
        <NROPED>${esc(String(row["numero"] ?? "").trim())}</NROPED>
        <VLR_FRETE>${Number(row["frete_valor"] ?? 0).toFixed(2)}</VLR_FRETE>
        <ZTERM>${esc(zterm(row["forma_pagamento"]))}</ZTERM>
        <XPED>${esc(String(row["numero"] ?? "").trim())}</XPED>
        <QVOL></QVOL>
        <PESO_BRUTO>${peso.bruto ? peso.bruto.toFixed(3) : ""}</PESO_BRUTO>
        <PESO_LIQ>${peso.liquido ? peso.liquido.toFixed(3) : ""}</PESO_LIQ>
        <ESP></ESP>
        <VKORG>${c.vkorg}</VKORG>
        <VTWEG>${c.vtweg}</VTWEG>
        <SPART>${c.spart}</SPART>
        <NOME_VENDEDOR>${esc(String(row["consultor_nome"] ?? "").slice(0, 35))}</NOME_VENDEDOR>
        <VENDEDOR>${esc(String(row["consultor_codigo_sap"] ?? "").trim())}</VENDEDOR>
      </I_S_OV>
      <I_S_TRANSP>
        <QVOL></QVOL>
        <PESO_BRUTO>${peso.bruto ? peso.bruto.toFixed(3) : ""}</PESO_BRUTO>
        <PESO_LIQ>${peso.liquido ? peso.liquido.toFixed(3) : ""}</PESO_LIQ>
        <ESP></ESP>
      </I_S_TRANSP>
      <I_TESTRUN>${testrun ? "X" : ""}</I_TESTRUN>
      <T_EMAIL>${email ? `<item><EMAIL>${esc(email)}</EMAIL></item>` : ""}</T_EMAIL>
      <T_ITEM>${linhas}</T_ITEM>
      <T_OBS>${obs}</T_OBS>
      <T_PAGTO>
        <item>
          <PARCELA>1</PARCELA>
          <DT_VENCTO>${esc(vencimento)}</DT_VENCTO>
          <VALOR>${valorTotal.toFixed(2)}</VALOR>
          <TIPO_PG></TIPO_PG>
        </item>
      </T_PAGTO>
      <T_PARCEIRO>
        ${emissor}
        ${parceiro("CL", docCliente, nomeCliente)}
      </T_PARCEIRO>
    </urn:ZNFE_OV_CRIAR>
  </soapenv:Body>
</soapenv:Envelope>`;
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

function mensagens(doc: any): { erro: string | null; texto: string | null } {
  let msgs = achar(doc, "T_MSG")?.item ?? [];
  if (!Array.isArray(msgs)) msgs = msgs ? [msgs] : [];
  const linhas = (msgs as any[]).map((m) => ({
    tipo: String(m?.TYPE ?? "").toUpperCase(),
    texto: String(m?.MESSAGE ?? "").trim(),
  }));
  const erro = linhas.find((l) => l.tipo === "E" || l.tipo === "A" || l.tipo === "X");
  const texto = linhas.map((l) => l.texto).filter(Boolean).join(" | ").slice(0, 500) || null;
  return { erro: erro?.texto || (erro ? "Erro retornado pelo SAP." : null), texto };
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
  const row = await db.getProposta(propostaId);
  if (!row) return { enviado: false, ok: false, vbeln: null, mensagem: "Proposta não encontrada.", testrun: false };

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

  const itens = (Array.isArray(row["itens"]) ? (row["itens"] as any[]) : []).filter(
    (i) => Number(i?.qtd ?? 0) > 0,
  );
  if (!itens.length)
    return { enviado: false, ok: false, vbeln: null, mensagem: "Pedido sem itens.", testrun: false };
  const semCodigo = itens.filter((i) => !norm(i?.codigo));
  if (semCodigo.length)
    return {
      enviado: false,
      ok: false,
      vbeln: null,
      mensagem: `Há ${semCodigo.length} item(ns) sem código SAP (de-para do material).`,
      testrun: false,
    };

  const testrun = opts.testrun ?? String(process.env["SAP_OV_TESTRUN"] ?? "").toUpperCase() === "X";
  const peso = await pesosDoPedido(itens);
  const corpo = envelope(row, peso, testrun);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let xml = "";
  let httpStatus = 0;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "text/xml; charset=utf-8",
        accept: "text/xml, */*",
        soapaction: '"urn:sap-com:document:sap:rfc:functions:ZNFE_OV_CRIAR"',
        authorization: auth,
        cookie: "sap-usercontext=sap-client=500",
      },
      body: corpo,
      signal: controller.signal,
    });
    httpStatus = res.status;
    xml = await res.text();
  } catch (e) {
    const mensagem = `Falha de comunicação com o SAP: ${(e as Error).message}`;
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

  const vbeln =
    String(achar(doc, "E_VBELN") ?? achar(doc, "E_VBELN_VA") ?? achar(doc, "E_NRO_OV") ?? "").trim() ||
    null;
  const { erro, texto } = mensagens(doc);

  if (erro || !vbeln) {
    const mensagem = erro ?? texto ?? "O SAP não devolveu o número da ordem de venda.";
    await gravar(propostaId, { sap_ov_status: "erro", sap_ov_mensagem: mensagem.slice(0, 500) });
    await logIntegrationEvent({
      ...base,
      level: "error",
      message: mensagem,
      detail: { proposta_id: propostaId, numero: row["numero"] ?? null, testrun },
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
