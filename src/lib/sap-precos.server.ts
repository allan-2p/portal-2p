/**
 * Simulação de preços/peso no SAP — RFC `ZNFE_OV_SIMULAR`.
 *
 * É a fonte oficial do peso usado na cotação de frete (mesma chamada da
 * plataforma antiga):
 *
 *   SAP (ZNFE_OV_SIMULAR) -> E_T_VALORES -> PESO_LIQUIDO por item -> Fretefy
 *
 * Atenção: este serviço usa SOAP 1.2 (`application/soap+xml`, envelope
 * `http://www.w3.org/2003/05/soap-envelope`), ao contrário das RFCs de cadastro
 * de clientes e de estoque, que usam SOAP 1.1.
 *
 * Configurável por ambiente:
 *   SAP_SIMULAR_URL (default: endpoint de produção do znfe_ov_simular_ws)
 */

import { XMLParser } from "fast-xml-parser";
import { pltypDaTabela } from "./sap-clientes-map";

export type SimulacaoItem = {
  codigo: string;
  quantidade: number;
};

export type SimulacaoValores = {
  /** Peso líquido da linha em kg (peso unitário x quantidade). */
  pesoLiquido: number;
  /** Peso bruto da linha em kg, quando informado. */
  pesoBruto: number;
  /** Valor líquido da linha devolvido pelo SAP, quando informado. */
  valor: number | null;
};

const URL_PADRAO =
  "https://app.webfiori.com.br/sap/bc/srt/rfc/sap/znfe_ov_simular_ws/500/znfe_ov_simular_ws/znfe_ov_simularbinding";

const norm = (c: string) => String(c ?? "").trim().replace(/^0+(?=\d)/, "");
const num = (v: unknown) => {
  const s = String(v ?? "").replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

function achar(o: any, chave: string): any {
  if (o == null || typeof o !== "object") return undefined;
  if (chave in o) return o[chave];
  for (const k of Object.keys(o)) {
    const r = achar(o[k], chave);
    if (r !== undefined) return r;
  }
  return undefined;
}

function credencial(): string | null {
  const auth = process.env["SAP_BRIDGE_AUTH"];
  if (auth) return auth.startsWith("Basic ") || auth.startsWith("Bearer ") ? auth : `Basic ${auth}`;
  const user = process.env["SAP_BRIDGE_USER"];
  const pass = process.env["SAP_BRIDGE_PASSWORD"];
  if (user && pass) return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  return null;
}

const esc = (v: string) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type SimulacaoOpts = {
  /** CNPJ/CPF do cliente (só dígitos). */
  documento?: string;
  /** Lista de preço (PLTYP) — 01 a 05. */
  listaPreco?: string;
  /** Filial de faturamento (9802 padrão). */
  filial?: string;
  /** Tipo de ordem (ZV2P / ZC2P / VBON). */
  tipoOv?: string;
};

function envelope(itens: SimulacaoItem[], opts: SimulacaoOpts) {
  const hoje = new Date().toISOString().slice(0, 10);
  const linhas = itens
    .map(
      (i, idx) =>
        `<item>` +
        `<ITM_NUMBER>${String((idx + 1) * 10).padStart(6, "0")}</ITM_NUMBER>` +
        `<MATERIAL>${esc(norm(i.codigo))}</MATERIAL>` +
        `<UM>UN</UM>` +
        `<QTDE>${Number(i.quantidade || 0)}</QTDE>` +
        `</item>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:urn="urn:sap-com:document:sap:rfc:functions">
  <soap:Header/>
  <soap:Body>
    <urn:ZNFE_OV_SIMULAR>
      <I_S_OV>
        <EMPRESA>9800</EMPRESA>
        <FILIAL>${esc(opts.filial ?? "9802")}</FILIAL>
        <TP_OV>${esc(opts.tipoOv ?? "ZV2P")}</TP_OV>
        <VKORG>9800</VKORG>
        <VTWEG>10</VTWEG>
        <SPART>10</SPART>
        <ZTERM>B000</ZTERM>
        <VLR_FRETE>0</VLR_FRETE>
        <PURCH_DATE>${hoje}</PURCH_DATE>
        <DATA_REMESSA>${hoje}</DATA_REMESSA>
      </I_S_OV>
      <I_S_PARCEIRO>
        <PLTYP>${esc(pltypDaTabela(opts.listaPreco))}</PLTYP>
        ${(() => {
          const d = String(opts.documento ?? "").replace(/\D/g, "");
          if (d.length === 14) return `<CNPJ>${esc(d)}</CNPJ>`;
          if (d.length === 11) return `<CPF>${esc(d)}</CPF>`;
          return "";
        })()}
      </I_S_PARCEIRO>

      <I_T_ITENS>${linhas}</I_T_ITENS>
    </urn:ZNFE_OV_SIMULAR>
  </soap:Body>
</soap:Envelope>`;
}

export type SimulacaoResultado = {
  /** Valores por código de material (vazio quando o SAP recusou a simulação). */
  valores: Map<string, SimulacaoValores>;
  /** Mensagens de erro devolvidas pelo SAP (E_T_MSG tipo E/A). */
  erros: string[];
  /** Motivo técnico quando nem chegamos a receber uma resposta válida. */
  motivo: string | null;
};

/**
 * Chama a simulação e devolve, por código de material, o peso líquido/bruto da
 * linha e o valor — junto das mensagens de erro do SAP, para que a origem de um
 * preço zerado nunca fique silenciosa.
 */
export async function simularSap(
  itens: SimulacaoItem[],
  opts?: SimulacaoOpts,
): Promise<SimulacaoResultado> {
  const mapa = new Map<string, SimulacaoValores>();
  const erros: string[] = [];
  if (!itens.length) return { valores: mapa, erros, motivo: null };

  const url = process.env["SAP_SIMULAR_URL"] ?? URL_PADRAO;
  const auth = credencial();
  if (!auth)
    return {
      valores: mapa,
      erros,
      motivo: "Credencial do SAP não configurada (SAP_BRIDGE_AUTH ou SAP_BRIDGE_USER/PASSWORD).",
    };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let xml = "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/soap+xml; charset=utf-8",
        accept: "application/soap+xml, text/xml, */*",
        "accept-language": "pt-BR",
        authorization: auth,
        cookie: "sap-usercontext=sap-client=500",
      },
      body: envelope(itens, opts ?? {}),
      signal: controller.signal,
    });
    xml = await res.text();
    if (!res.ok) return { valores: mapa, erros, motivo: `SAP respondeu ${res.status}.` };
  } catch (e) {
    return { valores: mapa, erros, motivo: `Falha de conexão com o SAP: ${(e as Error).message}` };
  } finally {
    clearTimeout(timer);
  }

  const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false });
  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch {
    return { valores: mapa, erros, motivo: "Resposta do SAP em formato inesperado." };
  }
  if (achar(doc, "Fault")) return { valores: mapa, erros, motivo: "SAP devolveu SOAP Fault." };

  // Mensagens de negócio (ex.: CNPJ sem parceiro cadastrado no SAP).
  let msgs = achar(doc, "E_T_MSG")?.item ?? [];
  if (!Array.isArray(msgs)) msgs = msgs ? [msgs] : [];
  for (const m of msgs as any[]) {
    const tipo = String(m?.TYPE ?? "").trim().toUpperCase();
    const texto = String(m?.MESSAGE ?? "").trim();
    if (texto && (tipo === "E" || tipo === "A" || tipo === "X")) erros.push(texto);
  }

  let linhas = achar(doc, "E_T_VALORES")?.item ?? achar(doc, "e_t_valores")?.item ?? [];
  if (!Array.isArray(linhas)) linhas = linhas ? [linhas] : [];

  // A resposta vem em pares ATRIBUTO/VALOR agrupados por ITM_NUMBER.
  const porItem = new Map<string, Record<string, string>>();
  for (const l of linhas as any[]) {
    const item = String(l?.ITM_NUMBER ?? l?.Itm_number ?? "").trim() || "000010";
    const attr = String(l?.ATRIBUTO ?? l?.Atributo ?? "").trim().toUpperCase();
    const valor = String(l?.VALOR ?? l?.Valor ?? "");
    if (!attr) continue;
    const reg = porItem.get(item) ?? {};
    reg[attr] = valor;
    porItem.set(item, reg);
  }

  for (const reg of porItem.values()) {
    const codigo = norm(String(reg["MATERIAL"] ?? ""));
    if (!codigo) continue;
    const pesoLiquido = num(reg["PESO_LIQUIDO"]);
    const pesoBruto = num(reg["PESO_BRUTO"]);
    const valorTxt = reg["VALOR_LIQUIDO"];
    mapa.set(codigo, {
      pesoLiquido,
      pesoBruto,
      valor: valorTxt !== undefined ? num(valorTxt) : null,
    });
  }

  return { valores: mapa, erros, motivo: null };
}

/** Compatibilidade: apenas os valores, sem diagnóstico. */
export async function simularPrecosSap(
  itens: SimulacaoItem[],
  opts?: SimulacaoOpts,
): Promise<Map<string, SimulacaoValores>> {
  return (await simularSap(itens, opts)).valores;
}

