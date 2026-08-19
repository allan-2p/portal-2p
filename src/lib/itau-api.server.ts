/**
 * Cliente HTTP do Itaú (boleto + Pix) com mTLS.
 *
 * Toda chamada ao Itaú exige certificado cliente (mTLS) e um token OAuth
 * client_credentials. Este módulo concentra as duas coisas.
 *
 * Nunca logar/retornar certificado, chave privada, client_secret ou token.
 */

type Credenciais = { clientId: string; clientSecret: string };

const TOKEN_URL = "https://sts.itau.com.br/api/oauth/token";

function env(name: string): string | null {
  const v = process.env[name];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Base da API por escopo (produção por padrão; sandbox via env).
 *  - boleto: modelo `secure.api.itau`
 *  - pix:    modelo novo `pix-pj.api.itau.com/regulatorio-pix/v2` (Recebimentos Pix 2.x)
 */
function apiBase(escopo: "boleto" | "pix"): string {
  if (escopo === "pix") {
    return env("ITAU_PIX_API_BASE") ?? "https://pix-pj.api.itau.com/regulatorio-pix/v2";
  }
  return env("ITAU_API_BASE") ?? "https://secure.api.itau";
}

/** Normaliza PEM colado em uma linha só (\n escapado). */
function pem(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

let dispatcherPromise: Promise<unknown> | null = null;

/** Dispatcher com certificado cliente. Só existe no runtime Node (undici). */
async function mtlsDispatcher(): Promise<unknown | null> {
  const cert = env("ITAU_MTLS_CERT_PEM");
  const key = env("ITAU_MTLS_KEY_PEM");
  if (!cert || !key) return null;
  if (!dispatcherPromise) {
    dispatcherPromise = (async () => {
      try {
        const undici = await import("undici");
        return new undici.Agent({
          connect: {
            cert: pem(cert),
            key: pem(key),
            ...(env("ITAU_MTLS_KEY_PASSPHRASE")
              ? { passphrase: env("ITAU_MTLS_KEY_PASSPHRASE") as string }
              : {}),
          },
        });
      } catch {
        return null;
      }
    })();
  }
  return await dispatcherPromise;
}

export class ItauIndisponivel extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ItauIndisponivel";
  }
}

async function itauFetch(url: string, init: RequestInit): Promise<Response> {
  const dispatcher = await mtlsDispatcher();
  if (!dispatcher) {
    throw new ItauIndisponivel(
      "Certificado mTLS do Itaú indisponível neste ambiente (ITAU_MTLS_CERT_PEM/ITAU_MTLS_KEY_PEM).",
    );
  }
  return await fetch(url, { ...init, dispatcher } as RequestInit);
}

const tokenCache = new Map<string, { token: string; exp: number }>();

async function obterToken(escopo: "boleto" | "pix", cred: Credenciais): Promise<string> {
  const cached = tokenCache.get(escopo);
  if (cached && cached.exp > Date.now() + 30_000) return cached.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cred.clientId,
    client_secret: cred.clientSecret,
  });
  const res = await itauFetch(env("ITAU_TOKEN_URL") ?? TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Falha na autenticação do Itaú (${res.status}): ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Itaú não retornou access_token.");
  tokenCache.set(escopo, {
    token: json.access_token,
    exp: Date.now() + (json.expires_in ?? 300) * 1000,
  });
  return json.access_token;
}

export function credenciaisBoleto(): Credenciais | null {
  const clientId = env("ITAU_BOLETO_CLIENT_ID");
  const clientSecret = env("ITAU_BOLETO_CLIENT_SECRET");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function credenciaisPix(): Credenciais | null {
  const clientId = env("ITAU_PIX_CLIENT_ID");
  const clientSecret = env("ITAU_PIX_CLIENT_SECRET");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export type ItauCall = {
  escopo: "boleto" | "pix";
  cred: Credenciais;
  metodo: "GET" | "POST" | "PUT";
  caminho: string;
  body?: unknown;
  correlationId: string;
};

/** Chamada autenticada; devolve o JSON de resposta ou lança erro legível. */
export async function chamarItau(call: ItauCall): Promise<Record<string, any>> {
  const token = await obterToken(call.escopo, call.cred);
  const res = await itauFetch(`${apiBase()}${call.caminho}`, {
    method: call.metodo,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
      "x-itau-apikey": call.cred.clientId,
      "x-itau-correlationID": call.correlationId,
    },
    ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Itaú respondeu ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? (JSON.parse(text) as Record<string, any>) : {};
}

export { env as itauEnv };
