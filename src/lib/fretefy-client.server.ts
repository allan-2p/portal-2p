/**
 * Cliente HTTP do Fretefy (API JSON hospedada no Azure).
 *
 * O token fica exclusivamente no secret FRETEFY_TOKEN e nunca é devolvido
 * para o navegador. Todas as chamadas são feitas a partir do servidor.
 */

const BASE = "https://api-fretefy.azurewebsites.net/api/";

export function fretefyToken() {
  return process.env["FRETEFY_TOKEN"] ?? "";
}

export function fretefyConfigurado() {
  return fretefyToken().length > 0;
}

export type FretefyResposta = {
  status: number;
  ok: boolean;
  response: string;
  json: unknown;
  durationMs: number;
};

/** Chamada genérica à API do Fretefy (mesma base/auth do cálculo). */
export async function fretefyRequest(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<FretefyResposta> {
  const token = fretefyToken();
  if (!token) throw new Error("Fretefy não configurado: informe o token da API em Integrações.");

  const started = Date.now();
  const res = await fetch(BASE + path.replace(/^\//, ""), {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `ApiKey ${token}`,
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, response: text, json, durationMs: Date.now() - started };
}

/**
 * Situação da carga (`GET carga/{id}`) — usada pelo webhook de rastreio, que
 * manda só o `CargaId` e exige reconsulta para saber se houve entrega.
 */
export async function getStatusCarga(cargaId: string): Promise<FretefyResposta> {
  return fretefyRequest("GET", `carga/${encodeURIComponent(cargaId)}`);
}

/** Data/hora da entrega (`entrega.eventoRota.dhEvento`), se já concluída. */
export function lerEntregaCarga(json: unknown): string | null {
  const busca = (obj: unknown, prof = 0): string | null => {
    if (!obj || typeof obj !== "object" || prof > 5) return null;
    const o = obj as Record<string, any>;
    const direto = o["entrega"]?.["eventoRota"]?.["dhEvento"] ?? o["eventoRota"]?.["dhEvento"];
    if (direto && !Number.isNaN(Date.parse(String(direto)))) return new Date(String(direto)).toISOString();
    for (const v of Object.values(o)) {
      const achado = busca(v, prof + 1);
      if (achado) return achado;
    }
    return null;
  };
  return busca(json);
}

export async function calcularFrete(body: unknown): Promise<FretefyResposta> {

  const token = fretefyToken();
  if (!token) throw new Error("Fretefy não configurado: informe o token da API em Integrações.");

  const started = Date.now();
  const res = await fetch(BASE + "tabela-frete/calcular", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `ApiKey ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, response: text, json, durationMs: Date.now() - started };
}
