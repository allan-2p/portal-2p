/**
 * Describe de objetos do Salesforce: lista os campos graváveis da org para a
 * tela de mapeamento. Cache em memória de 10 minutos (describe é pesado).
 */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";

export type CampoOrg = {
  name: string;
  label: string;
  type: string;
  required: boolean;
  picklist: string[];
};

type Cache = { at: number; campos: CampoOrg[] };
const cache = new Map<string, Cache>();
const TTL_MS = 10 * 60_000;

function secrets() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sfKey = process.env["SALESFORCE_API_KEY"];
  if (!lovableKey || !sfKey) return null;
  return { lovableKey, sfKey };
}

export async function describeObjeto(objeto: string): Promise<{ campos: CampoOrg[]; erro: string | null }> {
  const c = cache.get(objeto);
  if (c && Date.now() - c.at < TTL_MS) return { campos: c.campos, erro: null };

  const s = secrets();
  if (!s) return { campos: [], erro: "Conector do Salesforce não está configurado." };

  try {
    const res = await fetch(`${GATEWAY_URL}/sobjects/${encodeURIComponent(objeto)}/describe`, {
      headers: {
        Authorization: `Bearer ${s.lovableKey}`,
        "X-Connection-Api-Key": s.sfKey,
        Accept: "application/json",
      },
    });
    const text = await res.text();
    if (!res.ok) return { campos: [], erro: `Salesforce ${res.status}: ${text.slice(0, 300)}` };
    const body = JSON.parse(text);
    const campos: CampoOrg[] = (body?.fields ?? [])
      .filter((f: any) => f?.createable || f?.updateable || f?.name === "Id")
      .map((f: any) => ({
        name: String(f.name),
        label: String(f.label ?? f.name),
        type: String(f.type ?? ""),
        required: Boolean(f.createable && !f.nillable && !f.defaultedOnCreate),
        picklist: Array.isArray(f.picklistValues)
          ? f.picklistValues.filter((p: any) => p?.active !== false).map((p: any) => String(p.value))
          : [],
      }))
      .sort((a: CampoOrg, b: CampoOrg) => a.label.localeCompare(b.label, "pt-BR"));
    cache.set(objeto, { at: Date.now(), campos });
    return { campos, erro: null };
  } catch (e) {
    return { campos: [], erro: (e as Error).message.slice(0, 300) };
  }
}
