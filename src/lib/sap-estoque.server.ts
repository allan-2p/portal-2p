/**
 * Integração com a RFC ZHDIT_ZMMR059 (estoque + NCM por material).
 *
 * É a fonte autoritativa de NCM, custo médio (CMM), preço de venda e saldos —
 * o catálogo (`listar_material`) só devolve código e descrição. A chave que une
 * as duas sincronizações é o código do material.
 */
import { XMLParser } from "fast-xml-parser";

/** Depósitos considerados estoque livre vendável (mesmo recorte do legado). */
export const DEPOSITOS_LIVRE = ["0001", "0002", "0003", "0005", "0007"];
const IGNORAR_CONTAINER = ["LOTE", "LOT", "ETS", "ATL"];

export const CENTRO_PADRAO = "9802";
export const GRUPOS_MERCADORIA = "2P-0002,2P-0006,2P-0007,2P-0013";

export type EstoqueRow = {
  material: string;
  centro: string;
  descricao: string;
  ean: string;
  ncm: string | null;
  cmm: number;
  preco_venda: number;
  valor_estoque: number;
  grp_mercadorias: string;
  tipo_material: string;
  umb: string;
  est_livre: number;
  est_bloqueado: number;
  qtd_pend_faturar: number;
  est_entreposto: number;
};

export type ContainerRow = {
  id_container: string;
  material: string;
  est_entreposto: number;
  supplier: string;
  dt_remessa: string | null;
  g_weight_total: number;
  n_weight_total: number;
  g_weight_un: number;
  n_weight_un: number;
};

/** SAP devolve negativos com o sinal no fim ("123-"). */
export function num(v: unknown): number {
  if (v == null) return 0;
  let s = String(v).trim();
  if (s.endsWith("-")) s = "-" + s.slice(0, -1);
  const n = parseFloat(s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const str = (v: unknown) => (v == null ? "" : String(v).trim());

function achar(o: any, chave: string): any {
  if (o == null || typeof o !== "object") return undefined;
  if (chave in o) return o[chave];
  for (const k of Object.keys(o)) {
    const r = achar(o[k], chave);
    if (r !== undefined) return r;
  }
  return undefined;
}

function soapBody(grupos: string = GRUPOS_MERCADORIA) {
  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:sap-com:document:sap:rfc:functions"><soapenv:Header/><soapenv:Body><urn:ZHDIT_ZMMR059><I_FILTRO><MATERIAL_DE></MATERIAL_DE><MATERIAL_ATE></MATERIAL_ATE><CENTRO_DE>${CENTRO_PADRAO}</CENTRO_DE><CENTRO_ATE>${CENTRO_PADRAO}</CENTRO_ATE><DEPOSITO_DE></DEPOSITO_DE><DEPOSITO_ATE></DEPOSITO_ATE><LOTE_DE></LOTE_DE><LOTE_ATE></LOTE_ATE><TP_MATERIAL_DE></TP_MATERIAL_DE><TP_MATERIAL_ATE></TP_MATERIAL_ATE><GRP_MERC_DE>${grupos}</GRP_MERC_DE><GRP_MERC_ATE></GRP_MERC_ATE><GRP_COMP_DE></GRP_COMP_DE><GRP_COMP_ATE></GRP_COMP_ATE><UNID_EXIB></UNID_EXIB></I_FILTRO></urn:ZHDIT_ZMMR059></soapenv:Body></soapenv:Envelope>`;
}

function credencial(): string {
  const explicito = process.env["SAP_ZMMR059_AUTH"] ?? process.env["SAP_BRIDGE_AUTH"];
  if (explicito) return explicito.startsWith("Basic ") ? explicito : `Basic ${explicito}`;
  const user = process.env["SAP_BRIDGE_USER"];
  const pass = process.env["SAP_BRIDGE_PASSWORD"];
  if (user && pass) return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  throw new Error(
    "Integração de estoque sem credencial: cadastre SAP_ZMMR059_AUTH (Basic ...) do usuário SAPMM.",
  );
}

/** Chama a RFC e devolve os itens crus de //REGISTROS. */
export async function fetchEstoqueSap(opts?: { grupos?: string }): Promise<any[]> {
  const url =
    process.env["SAP_ZMMR059_URL"] ??
    "https://app.webfiori.com.br/sap/bc/srt/rfc/sap/zhdit_zmmr059/500/zhdit_zmmr059/zhdit_zmmr059";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: credencial(),
        "content-type": "text/xml;charset=UTF-8",
        "accept-language": "pt-BR",
        cookie: "sap-usercontext=sap-client=500",
      },
      body: soapBody(opts?.grupos ?? GRUPOS_MERCADORIA),
      signal: controller.signal,
    });
  } catch (e: any) {
    throw new Error(
      e?.name === "AbortError"
        ? "SAP: tempo limite excedido ao chamar ZHDIT_ZMMR059 (estoque)."
        : `SAP: ${String(e?.message ?? e)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const xml = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new Error(`SAP: credencial recusada pela RFC de estoque (HTTP ${res.status}).`);
  }
  if (!res.ok) throw new Error(`SAP ${res.status}: ${xml.slice(0, 300)}`);

  const doc = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false }).parse(xml);
  const fault = achar(doc, "Fault");
  if (fault) {
    const motivo = achar(fault, "Text") ?? achar(fault, "faultstring") ?? JSON.stringify(fault).slice(0, 300);
    throw new Error(`SAP: falha na RFC ZHDIT_ZMMR059 — ${String(motivo)}`);
  }
  let items = achar(doc, "REGISTROS")?.item ?? [];
  if (!Array.isArray(items)) items = items ? [items] : [];
  if (items.length === 0) throw new Error("SAP: a RFC de estoque não devolveu registros.");
  return items as any[];
}

function normalizarNcm(v: unknown): string | null {
  const digitos = str(v).replace(/\D/g, "");
  return digitos.length >= 8 ? digitos.slice(0, 8) : null;
}

/** Converte os itens da RFC nas linhas de `estoque` e `containers`. */
export function mapearEstoque(items: any[]): { estoque: EstoqueRow[]; containers: ContainerRow[] } {
  const estoque: EstoqueRow[] = [];
  const containers: ContainerRow[] = [];
  const vistos = new Set<string>();

  for (const it of items) {
    const material = str(it.MATERIAL).replace(/^0+(?=\d)/, "");
    if (!material || vistos.has(material)) continue;
    vistos.add(material);

    estoque.push({
      material,
      centro: str(it.CENTRO) || CENTRO_PADRAO,
      descricao: str(it.DESCRICAO),
      ean: str(it.EAN),
      ncm: normalizarNcm(it.NCM),
      cmm: num(it.CMM),
      preco_venda: num(it.PRECO_VENDA),
      valor_estoque: num(it.VALOR_ESTOQUE),
      grp_mercadorias: str(it.GRP_MERCADORIAS),
      tipo_material: str(it.TIPO_MATERIAL),
      umb: str(it.UMB),
      est_livre: DEPOSITOS_LIVRE.reduce((s, d) => s + num(it["EST_LIVRE_" + d]), 0),
      est_bloqueado: DEPOSITOS_LIVRE.reduce((s, d) => s + num(it["EST_BLOQ_" + d]), 0),
      qtd_pend_faturar: num(it.QTD_PEND_FATURAR),
      est_entreposto: num(it.EST_ENTREPOSTO),
    });

    for (let i = 1; i <= 8; i++) {
      const cont = str(it["CONTAINER_" + i]);
      const qtd = num(it["QTD_PEDIDO_" + i]);
      if (!cont || qtd <= 0) continue;
      if (IGNORAR_CONTAINER.some((p) => cont.toUpperCase().startsWith(p))) continue;
      const pbt = num(it["PESO_BRUTO_TOT_" + i]);
      const plt = num(it["PESO_LIQ_TOT_" + i]);
      containers.push({
        id_container: cont,
        material,
        est_entreposto: qtd,
        supplier: str(it["FORNECEDOR_" + i]).split(" - ")[0] ?? "",
        dt_remessa: str(it["DATA_ENTREGA_" + i]) || null,
        g_weight_total: pbt,
        n_weight_total: plt,
        g_weight_un: qtd > 0 ? pbt / qtd : 0,
        n_weight_un: qtd > 0 ? plt / qtd : 0,
      });
    }
  }

  // Um mesmo container pode repetir para o mesmo material em linhas distintas.
  const unicos = new Map(containers.map((c) => [`${c.id_container}::${c.material}`, c]));
  return { estoque, containers: Array.from(unicos.values()) };
}
