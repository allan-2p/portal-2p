/** Regras de classificação por prefixo da descrição (espelha o legado tbl_prj_prd_calc). */
export const TIPO_PREFIXOS: Array<{ prefixo: string; tipo: string }> = [
  { prefixo: "MOD", tipo: "Módulo" },
  { prefixo: "PAINEL", tipo: "Módulo" },
  { prefixo: "INV", tipo: "Inversor" },
  { prefixo: "MICRO", tipo: "Microinversor" },
  { prefixo: "EST", tipo: "Estrutura" },
  { prefixo: "ESTRUT", tipo: "Estrutura" },
  { prefixo: "CAB", tipo: "Cabo" },
  { prefixo: "CONECTOR", tipo: "Conector" },
  { prefixo: "STR", tipo: "String Box" },
  { prefixo: "BAT", tipo: "Bateria" },
  { prefixo: "CARR", tipo: "Carregador" },
  { prefixo: "WALLBOX", tipo: "Carregador" },
  { prefixo: "SERV", tipo: "Serviço" },
  { prefixo: "FRETE", tipo: "Frete" },
];

export function classificarTipo(descricao: string): string {
  const d = (descricao || "").trim().toUpperCase();
  for (const { prefixo, tipo } of TIPO_PREFIXOS) {
    if (d.startsWith(prefixo)) return tipo;
  }
  return "Outros";
}

export type SapMaterial = {
  codigo: string;
  descricao: string;
  lista_preco: string | null;
  permissao: string;
  raw: unknown;
};

/** Chama a RFC listar_material através do bridge SAP configurado. */
export async function fetchSapMateriais(): Promise<SapMaterial[]> {
  const url = process.env["SAP_RFC_URL"];
  const token = process.env["SAP_RFC_TOKEN"];
  if (!url) {
    throw new Error(
      "Integração SAP não configurada: defina SAP_RFC_URL (e SAP_RFC_TOKEN) para habilitar a sincronização.",
    );
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ rfc: "listar_material" }),
  });
  if (!res.ok) {
    throw new Error(`SAP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json: any = await res.json();
  const rows: any[] = Array.isArray(json) ? json : (json?.data ?? json?.materiais ?? json?.items ?? []);

  return rows
    .map((r) => {
      const codigo = String(r.codigo ?? r.MATNR ?? r.matnr ?? "").trim();
      const descricao = String(r.descricao ?? r.MAKTX ?? r.maktx ?? "").trim();
      if (!codigo || !descricao) return null;
      return {
        codigo,
        descricao,
        lista_preco: r.lista_preco ?? r.LISTA_PRECO ?? null,
        permissao: String(r.permissao ?? r.PERMISSAO ?? "todos"),
        raw: r,
      } satisfies SapMaterial;
    })
    .filter((r): r is SapMaterial => r !== null);
}
