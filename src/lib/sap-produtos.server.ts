export { classificarTipo, classificarDetalhado, validarRegras, TIPO_PREFIXOS } from "./sap-produtos-rules";

export type SapMaterial = {
  codigo: string;
  descricao: string;
  lista_preco: string | null;
  permissao: string;
  raw: unknown;
};

function pick(r: any, ...keys: string[]) {
  for (const k of keys) {
    const v = r?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

function normalizeMaterial(r: any): SapMaterial | null {
  const codigo = String(pick(r, "codigo", "MATNR", "matnr", "material", "MATERIAL") ?? "").trim();
  const descricao = String(pick(r, "descricao", "MAKTX", "maktx", "descricao_material", "TEXTO") ?? "").trim();
  if (!codigo || !descricao) return null;
  const permissao = String(pick(r, "permissao", "PERMISSAO", "permission") ?? "todos").trim().toLowerCase();
  return {
    // SAP devolve o material com zeros à esquerda; normalizamos para casar com o catálogo.
    codigo: codigo.replace(/^0+(?=\d)/, ""),
    descricao,
    lista_preco: pick(r, "lista_preco", "LISTA_PRECO", "listaPreco", "PLTYP") as string | null,
    permissao: permissao === "admin" ? "admin" : permissao || "todos",
    raw: r,
  };
}

/**
 * getProducts(): chama a RFC `listar_material` no bridge SAP e devolve
 * os materiais já normalizados para gravação em `sap_produtos`.
 */
export async function getProducts(): Promise<SapMaterial[]> {
  const url = process.env["SAP_RFC_URL"];
  const token = process.env["SAP_RFC_TOKEN"];
  if (!url) {
    throw new Error(
      "Integração SAP não configurada: defina SAP_RFC_URL (e SAP_RFC_TOKEN) para habilitar a sincronização.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ rfc: "listar_material", function: "listar_material", params: {} }),
      signal: controller.signal,
    });
  } catch (e: any) {
    throw new Error(
      e?.name === "AbortError" ? "SAP: tempo limite excedido ao chamar listar_material." : `SAP: ${String(e?.message ?? e)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`SAP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const json: any = await res.json().catch(() => null);
  const rows: any[] = Array.isArray(json)
    ? json
    : (json?.data ?? json?.materiais ?? json?.items ?? json?.MATERIAIS ?? json?.result ?? []);
  if (!Array.isArray(rows)) {
    throw new Error("SAP: resposta inesperada da RFC listar_material (lista de materiais não encontrada).");
  }

  // Dedup por código: a RFC pode repetir o material por centro/lista de preço.
  const map = new Map<string, SapMaterial>();
  for (const r of rows) {
    const m = normalizeMaterial(r);
    if (m) map.set(m.codigo, m);
  }
  return Array.from(map.values());
}

/** @deprecated use getProducts() */
export const fetchSapMateriais = getProducts;

