import { XMLParser } from "fast-xml-parser";
import { SAP_ACCEPT_LANGUAGE, comIdiomaPT } from "./sap-lang.server";

export {
  classificarTipo,
  classificarDetalhado,
  validarRegras,
  TIPO_PREFIXOS,
  TIPO_LABELS,
  TIPO_ORDEM,
} from "./sap-produtos-rules";

export type SapMaterial = {
  codigo: string;
  descricao: string;
  lista_preco: string | null;
  /** 'Todos' | 'Admin' */
  permissao: string;
  /** NCM devolvido pelo SAP (8 dígitos), quando a RFC informa. */
  ncm: string | null;
  raw: unknown;
};

export type SapMaterialCompleto = {
  codigo: string;
  descricao: string;
  unidade: string | null;
  ncm: string | null;
  /** true quando o código faz parte do catálogo liberado do portal. */
  liberado: boolean;
  raw: any;
};

/** Códigos que entram na calculadora (whitelist do legado). */
const LIBERADOS = new Set([
  "100000000","100000001","100000005","100000006","100000012","100000013","100000020","100000022","100000024","100000047","100000048","100000049","100000050","100000052","100000054","100000055","100000056","100000057","100000058","100000059","100000060","100000061","100000062","100000063","100000064","100000065","100000066","100000067","100000068","100000069","100000070","100000080","100000081","100000082","100000083","100000084","100000085","100000090","100000091","100000092","100000093","100000094","100000095","100000096","100000097","100000100","100000101","100000102","100000103","100000104","100000105","100000106","100000110","100000111","100000112","100000113","100000114","100000115","200000001","200000005","200000006","200000007","200000008","200000010","200000011","200000012","200000013","200000014","200000015","200000016","200000018","200000019","200000020","200000021","200000025","200000028","200000030","200000034","200000035","200000036","200000037","200000039","200000040","200000041","200000043","200000044","200000045","200000048","200000051","200000052","200000059","200000072","200000587","200000607","200000076","200000077","200000080","200000082","200000100","200000103","200000104","200000105","200000106","200000120","200000132","200000133","200000134","200000135","300000006","200000170","200000645","200000646","200000647","200000666","200000684","200000694","100000350",
]);

/** Visíveis a qualquer cliente (getExtrasCli do legado); o restante fica só para Admin. */
const EXTRAS_CLI = new Set([
  "200000028","200000080","100000020","200000051","100000001","100000000","200000006","200000008","200000030","200000007","200000016","200000587","200000607","200000001","200000005","200000010","200000018","200000012","200000019","200000014","200000025","200000048","200000034","200000072","200000076","200000077","200000015","200000050","200000011","200000059","100000052","100000054","100000055","100000056","200000082","200000100","100000084","100000082","100000013","100000083","100000085","100000080","100000024","200000120","200000684","200000694","100000350",
]);

const SOAP_BODY = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:urn="urn:sap-com:document:sap:soap:functions:mc-style">
  <soap:Header/>
  <soap:Body>
    <urn:_-prcitnfe_-nfeOvMaterial>
      <i_t_param>
        <item><Atributo>VK12</Atributo><Valor>2P-0001</Valor></item>
        <item><Atributo>VK12</Atributo><Valor>2P-0002</Valor></item>
      </i_t_param>
    </urn:_-prcitnfe_-nfeOvMaterial>
  </soap:Body>
</soap:Envelope>`;

function achar(o: any, chave: string): any {
  if (o == null || typeof o !== "object") return undefined;
  if (chave in o) return o[chave];
  for (const k of Object.keys(o)) {
    const r = achar(o[k], chave);
    if (r !== undefined) return r;
  }
  return undefined;
}

function pick(r: any, ...keys: string[]) {
  for (const k of keys) {
    const v = r?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

/**
 * fetchMateriaisSap(): chama a RFC `listar_material` (SOAP) no bridge SAP e
 * devolve os itens crus retornados pela tabela `e_t_material`.
 */
async function fetchMateriaisSap(): Promise<any[]> {
  const url = process.env["SAP_BRIDGE_URL"] ?? process.env["SAP_RFC_URL"];
  const user = process.env["SAP_BRIDGE_USER"];
  const pass = process.env["SAP_BRIDGE_PASSWORD"];
  const auth =
    process.env["SAP_BRIDGE_AUTH"] ??
    (user && pass ? `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` : undefined);
  const token = process.env["SAP_RFC_TOKEN"];
  if (!url) {
    throw new Error(
      "Integração SAP não configurada: defina SAP_BRIDGE_URL e SAP_BRIDGE_AUTH para habilitar a sincronização.",
    );
  }
  if (!auth && !token) {
    throw new Error(
      "Integração SAP sem credencial: defina SAP_BRIDGE_AUTH (Basic ...) ou SAP_BRIDGE_USER + SAP_BRIDGE_PASSWORD.",
    );
  }


  const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });

  // Credenciais candidatas: a RFC devolve tabelas vazias (HTTP 200) quando o
  // usuário não tem autorização, então tentamos as alternativas configuradas.
  const credenciais: { nome: string; header: string }[] = [];
  if (auth) credenciais.push({ nome: "SAP_BRIDGE_AUTH", header: auth });
  if (user && pass) {
    const basic = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
    if (!credenciais.some((c) => c.header === basic)) {
      credenciais.push({ nome: "SAP_BRIDGE_USER/PASSWORD", header: basic });
    }
  }
  if (token) credenciais.push({ nome: "SAP_RFC_TOKEN", header: `Bearer ${token}` });

  async function chamar(credencial: { nome: string; header: string }): Promise<any[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    let res: Response;
    try {
      res = await fetch(comIdiomaPT(url!), {
        method: "POST",
        headers: {
          "content-type": "application/soap+xml; charset=utf-8",
          accept: "application/soap+xml, text/xml, */*",
          // Sem isto o runtime envia "Accept-Language: *", que o SAP trata como
          // idioma inválido e responde com as tabelas vazias (HTTP 200).
          "accept-language": "pt-BR",
          authorization: credencial.header,
        },
        body: SOAP_BODY,
        signal: controller.signal,
      });
    } catch (e: any) {
      throw new Error(
        e?.name === "AbortError"
          ? "SAP: tempo limite excedido ao chamar listar_material."
          : `SAP: ${String(e?.message ?? e)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    const xml = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error(`SAP: credencial ${credencial.nome} recusada (HTTP ${res.status}).`);
    }
    if (!res.ok) throw new Error(`SAP ${res.status}: ${xml.slice(0, 300)}`);

    const doc = parser.parse(xml);
    const fault = achar(doc, "Fault");
    if (fault) {
      const motivo =
        achar(fault, "Text") ?? achar(fault, "faultstring") ?? JSON.stringify(fault).slice(0, 300);
      throw new Error(`SAP: falha na RFC listar_material — ${String(motivo)}`);
    }
    let items = achar(doc, "e_t_material")?.item ?? [];
    if (!Array.isArray(items)) items = items ? [items] : [];
    if (items.length === 0) {
      throw new Error(
        `SAP: resposta sem materiais (e_t_material vazio) usando ${credencial.nome}. ` +
          `HTTP ${res.status}, ${xml.length} bytes.`,
      );
    }
    return items as any[];
  }

  let items: any[] | null = null;
  let ultimoErro: unknown = null;
  for (const cred of credenciais) {
    for (let tentativa = 0; tentativa < 2 && !items; tentativa++) {
      try {
        items = await chamar(cred);
      } catch (e) {
        ultimoErro = e;
        // Falha transitória: uma segunda tentativa com a mesma credencial resolve.
        if (tentativa === 0) await new Promise((r) => setTimeout(r, 2_000));
      }
    }
    if (items) break;
  }
  if (!items) throw ultimoErro instanceof Error ? ultimoErro : new Error(String(ultimoErro));
  return items;
}

/** Normaliza o NCM devolvido pelo SAP (campo STEUC / NCM) para só dígitos. */
function extrairNcm(m: any): string | null {
  const bruto = pick(m, "Steuc", "STEUC", "steuc", "Stawn", "STAWN", "Ncm", "NCM", "ncm", "ncm_codigo");
  if (bruto == null) return null;
  const digitos = String(bruto).replace(/\D/g, "");
  return digitos.length >= 8 ? digitos.slice(0, 8) : null;
}

/**
 * getAllMaterials(): catálogo completo do SAP, sem a whitelist do portal.
 * Usado na aba "Todos os produtos do SAP" (espelho somente leitura).
 */
export async function getAllMaterials(): Promise<SapMaterialCompleto[]> {
  const items = await fetchMateriaisSap();
  const map = new Map<string, SapMaterialCompleto>();
  for (const m of items) {
    const codigo = String(pick(m, "Matnr", "MATNR", "matnr", "codigo") ?? "")
      .trim()
      .replace(/^0+(?=\d)/, "");
    const descricao = String(pick(m, "Maktx", "MAKTX", "maktx", "descricao") ?? "").trim();
    if (!codigo || !descricao) continue;
    map.set(codigo, {
      codigo,
      descricao,
      unidade: (pick(m, "Meins", "MEINS", "unidade") as string | null) ?? null,
      ncm: extrairNcm(m),
      liberado: LIBERADOS.has(codigo),
      raw: m,
    });
  }
  return Array.from(map.values());
}

/**
 * getProducts(): materiais liberados, já normalizados para gravação em
 * `sap_produtos` (inclui o NCM devolvido pelo SAP, quando disponível).
 */
export async function getProducts(): Promise<SapMaterial[]> {
  return selecionarLiberados(await getAllMaterials());
}

/** Recorta o catálogo liberado do portal a partir do catálogo completo do SAP. */
export function selecionarLiberados(todos: SapMaterialCompleto[]): SapMaterial[] {
  return todos
    .filter((m) => m.liberado)
    .map((m) => ({
      codigo: m.codigo,
      descricao: m.descricao,
      lista_preco: (pick(m.raw, "Pltyp", "PLTYP", "lista_preco") as string | null) ?? null,
      permissao: EXTRAS_CLI.has(m.codigo) ? "Todos" : "Admin",
      ncm: m.ncm,
      raw: m.raw,
    }));
}

/** @deprecated use getProducts() */
export const fetchSapMateriais = getProducts;
