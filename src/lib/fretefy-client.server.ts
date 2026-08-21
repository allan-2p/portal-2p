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
