/**
 * Simulação de preços no SAP (RFC de simulação da ordem de venda).
 *
 * A mesma resposta que devolve o preço de cada material devolve também o
 * PESO_LIQUIDO da linha (peso unitário x quantidade), que é a fonte oficial do
 * peso usado na cotação de frete — igual à plataforma antiga:
 *
 *   SAP (simulação) -> PESO_LIQUIDO por item -> soma -> peso total -> Fretefy
 *                                          ^ fallback: catálogo de produtos
 *
 * O endpoint/operação é configurável para não depender do nome do binding:
 *   SAP_SIMULAR_URL (default: SAP_BRIDGE_URL)
 *   SAP_SIMULAR_OP  (default: _-prcitnfe_-nfeOvSimular)
 */

import { XMLParser } from "fast-xml-parser";

export type SimulacaoItem = {
  codigo: string;
  quantidade: number;
};

export type SimulacaoValores = {
  /** Peso líquido da linha em kg (peso unitário x quantidade). */
  pesoLiquido: number;
  /** Valor unitário devolvido pelo SAP, quando informado. */
  valor: number | null;
};

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
  const user = process.env["SAP_BRIDGE_USER"];
  const pass = process.env["SAP_BRIDGE_PASSWORD"];
  const auth = process.env["SAP_BRIDGE_AUTH"];
  if (auth) return auth;
  if (user && pass) return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  const token = process.env["SAP_RFC_TOKEN"];
  return token ? `Bearer ${token}` : null;
}

function envelope(op: string, itens: SimulacaoItem[], listaPreco: string) {
  const linhas = itens
    .map(
      (i) =>
        `<item><Atributo>MATNR</Atributo><Valor>${norm(i.codigo)}</Valor></item>` +
        `<item><Atributo>KWMENG</Atributo><Valor>${Number(i.quantidade || 0)}</Valor></item>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:urn="urn:sap-com:document:sap:soap:functions:mc-style">
  <soap:Header/>
  <soap:Body>
    <urn:${op}>
      <i_t_param>
        <item><Atributo>VK12</Atributo><Valor>${listaPreco}</Valor></item>
        ${linhas}
      </i_t_param>
    </urn:${op}>
  </soap:Body>
</soap:Envelope>`;
}

/**
 * Chama a simulação de preços e devolve, por código de material, o peso
 * líquido da linha e o valor. Devolve mapa vazio quando a RFC não está
 * configurada/disponível (o chamador cai no fallback do catálogo).
 */
export async function simularPrecosSap(
  itens: SimulacaoItem[],
  opts?: { listaPreco?: string },
): Promise<Map<string, SimulacaoValores>> {
  const mapa = new Map<string, SimulacaoValores>();
  if (!itens.length) return mapa;

  const url = process.env["SAP_SIMULAR_URL"] ?? process.env["SAP_BRIDGE_URL"];
  const auth = credencial();
  if (!url || !auth) return mapa;
  const op = process.env["SAP_SIMULAR_OP"] ?? "_-prcitnfe_-nfeOvSimular";

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
      },
      body: envelope(op, itens, opts?.listaPreco ?? "2P-0001"),
      signal: controller.signal,
    });
    xml = await res.text();
    if (!res.ok) return mapa;
  } catch {
    return mapa;
  } finally {
    clearTimeout(timer);
  }

  const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });
  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch {
    return mapa;
  }
  if (achar(doc, "Fault")) return mapa;

  let linhas = achar(doc, "e_t_valores")?.item ?? [];
  if (!Array.isArray(linhas)) linhas = linhas ? [linhas] : [];

  // Resposta em pares Atributo/Valor por material (mesmo formato do legado).
  let atual: string | null = null;
  for (const l of linhas as any[]) {
    const attr = String(l?.Atributo ?? l?.ATRIBUTO ?? "").trim().toUpperCase();
    const valor = l?.Valor ?? l?.VALOR;
    const matnr = l?.Matnr ?? l?.MATNR;
    if (matnr) atual = norm(String(matnr));
    if (attr === "MATNR") {
      atual = norm(String(valor ?? ""));
      if (atual && !mapa.has(atual)) mapa.set(atual, { pesoLiquido: 0, valor: null });
      continue;
    }
    if (!atual) continue;
    const reg = mapa.get(atual) ?? { pesoLiquido: 0, valor: null };
    if (attr === "PESO_LIQUIDO" || attr === "PESO_LIQ" || attr === "NTGEW") {
      reg.pesoLiquido = num(valor);
    } else if (attr === "VALOR" || attr === "PRECO" || attr === "NETWR" || attr === "KBETR") {
      reg.valor = num(valor);
    }
    mapa.set(atual, reg);
  }

  for (const [k, v] of Array.from(mapa)) if (!(v.pesoLiquido > 0) && v.valor == null) mapa.delete(k);
  return mapa;
}
