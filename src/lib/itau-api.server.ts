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

/**
 * Junta base + caminho sem duplicar prefixos: se a base já terminar com o
 * mesmo segmento inicial do caminho (ex.: base `.../cash_management/v2` e
 * caminho `/cash_management/v2/boletos`), o trecho repetido é removido.
 */
function montarUrl(base: string, caminho: string): string {
  const b = base.replace(/\/+$/, "");
  const partesBase = b.split("/").filter(Boolean);
  const partesCam = caminho.replace(/^\/+/, "").split("/").filter(Boolean);
  let overlap = 0;
  for (let n = Math.min(partesBase.length, partesCam.length); n > 0; n--) {
    if (partesBase.slice(-n).join("/") === partesCam.slice(0, n).join("/")) {
      overlap = n;
      break;
    }
  }
  return `${b}/${partesCam.slice(overlap).join("/")}`;
}

/**
 * Normaliza o PEM salvo no segredo. Aceita:
 *  - PEM normal;
 *  - PEM colado em uma linha só (\n escapado) ou entre aspas;
 *  - PEM inteiro codificado em base64 (formato comum ao exportar arquivos).
 * Sem isso o OpenSSL falha com ERR_OSSL_PEM_NO_START_LINE.
 */
function pem(value: string, nome: string): string {
  let v = value.trim().replace(/^['"]|['"]$/g, "");
  if (v.includes("\\n")) v = v.replace(/\\n/g, "\n");
  v = v.replace(/\r\n/g, "\n");

  if (!v.includes("-----BEGIN")) {
    try {
      const decoded = Buffer.from(v.replace(/\s+/g, ""), "base64").toString("utf8");
      if (decoded.includes("-----BEGIN")) v = decoded.replace(/\r\n/g, "\n");
    } catch {
      /* ignora: cai no erro abaixo */
    }
  }

  if (!v.includes("-----BEGIN")) {
    throw new ItauIndisponivel(
      `${nome} não está em formato PEM (falta a linha "-----BEGIN ...-----"). ` +
        "Salve o conteúdo do arquivo .pem/.key (ou o mesmo conteúdo em base64).",
    );
  }

  // Reconstrói as quebras de linha: segredos colados em linha única perdem os
  // "\n" e o OpenSSL rejeita com ERR_OSSL_PEM_NO_START_LINE.
  const blocos = [...v.matchAll(/-----BEGIN ([^-]+)-----([\s\S]*?)-----END \1-----/g)];
  if (blocos.length === 0) {
    throw new ItauIndisponivel(`${nome} está incompleto (falta a linha "-----END ...-----").`);
  }
  const saida = blocos
    .map(([, tipo, corpo]) => {
      const b64 = (corpo ?? "").replace(/\s+/g, "");
      const linhas = b64.match(/.{1,64}/g) ?? [];
      return `-----BEGIN ${tipo}-----\n${linhas.join("\n")}\n-----END ${tipo}-----`;
    })
    .join("\n");
  return `${saida}\n`;
}

let dispatcherPromise: Promise<unknown> | null = null;

/** Dispatcher com certificado cliente. Só existe no runtime Node (undici). */
async function mtlsDispatcher(): Promise<unknown | null> {
  const cert = env("ITAU_MTLS_CERT_PEM");
  const key = env("ITAU_MTLS_KEY_PEM");
  if (!cert || !key) return null;
  if (!dispatcherPromise) {
    dispatcherPromise = (async () => {
      // Erros de PEM inválido devem subir com mensagem legível, não virar null.
      const certPem = pem(cert, "ITAU_MTLS_CERT_PEM");
      const keyPem = pem(key, "ITAU_MTLS_KEY_PEM");
      try {
        const undici = await import("undici");
        return new undici.Agent({
          connect: {
            cert: certPem,
            key: keyPem,
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
      "As chamadas ao Itaú exigem certificado mTLS, e este ambiente não consegue apresentá-lo. " +
        "Configure o proxy mTLS (ITAU_PROXY_URL + ITAU_PROXY_SECRET) para emitir Pix/boleto.",
    );
  }

  try {
    return await fetch(url, { ...init, dispatcher } as RequestInit);
  } catch (e) {
    // "fetch failed" cru não diz nada ao usuário: normalmente é bloqueio de
    // rede ou handshake mTLS recusado (certificado inválido/expirado).
    const causa = (e as { cause?: { code?: string; message?: string } })?.cause;
    const detalhe = causa?.code ?? causa?.message ?? (e as Error)?.message ?? "erro desconhecido";
    throw new ItauIndisponivel(
      `Não foi possível conectar ao Itaú (${new URL(url).host}): ${detalhe}. ` +
        "Verifique a liberação de rede do ambiente e o certificado mTLS.",
    );
  }
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

/**
 * Credenciais do Itaú. No modo proxy o token OAuth é resolvido pelo próprio
 * proxy (que guarda client_id/secret junto do certificado), então o portal
 * não precisa delas.
 */
export function credenciaisBoleto(): Credenciais | null {
  const clientId = env("ITAU_BOLETO_CLIENT_ID");
  const clientSecret = env("ITAU_BOLETO_CLIENT_SECRET");
  if (clientId && clientSecret) return { clientId, clientSecret };
  return proxyConfigurado() ? { clientId: "", clientSecret: "" } : null;
}

export function credenciaisPix(): Credenciais | null {
  const clientId = env("ITAU_PIX_CLIENT_ID");
  const clientSecret = env("ITAU_PIX_CLIENT_SECRET");
  if (clientId && clientSecret) return { clientId, clientSecret };
  return proxyConfigurado() ? { clientId: "", clientSecret: "" } : null;
}


export type ItauCall = {
  escopo: "boleto" | "pix";
  cred: Credenciais;
  metodo: "GET" | "POST" | "PUT" | "DELETE";
  caminho: string;
  body?: unknown;
  correlationId: string;
};

/** Proxy mTLS externo (servidor que guarda o certificado do Itaú). */
export function proxyConfigurado(): { url: string; secret: string } | null {
  const url = env("ITAU_PROXY_URL");
  const secret = env("ITAU_PROXY_SECRET");
  return url && secret ? { url, secret } : null;
}

/** Modo de operação atual, para exibição no painel de Integrações. */
export function modoItau(): "proxy" | "direto" | "indisponivel" {
  if (proxyConfigurado()) return "proxy";
  if (env("ITAU_MTLS_CERT_PEM") && env("ITAU_MTLS_KEY_PEM")) return "direto";
  return "indisponivel";
}

/**
 * Chamada via proxy mTLS: o proxy resolve o token OAuth e apresenta o
 * certificado; o portal só envia o segredo do proxy. A resposta repassa
 * status e corpo crus do Itaú.
 */
async function chamarViaProxy(
  call: ItauCall,
  proxy: { url: string; secret: string },
): Promise<Record<string, any>> {
  let res: Response | null = null;
  let text = "";
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      res = await fetch(proxy.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-proxy-secret": proxy.secret,
          "x-itau-correlationID": call.correlationId,
        },
        body: JSON.stringify({
          metodo: call.metodo,
          api: call.escopo,
          caminho: call.caminho,
          ...(call.body === undefined ? {} : { corpo: call.body }),
        }),
      });
    } catch (e) {
      throw new ItauIndisponivel(
        `Não foi possível falar com o proxy mTLS do Itaú: ${(e as Error)?.message ?? "erro de rede"}.`,
      );
    }
    text = await res.text();
    if (res.ok || res.status < 500) break;
    if (tentativa < 3) await new Promise((r) => setTimeout(r, tentativa * 1500));
  }

  if (res && !res.ok) {
    if (res.status === 501 && call.escopo === "boleto") {
      throw new Error(
        `Rota de boleto não habilitada no proxy mTLS do Itaú. Detalhe: ${text.slice(0, 300)}`,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Proxy mTLS recusou a chamada (${res.status}). Confira ITAU_PROXY_SECRET no portal e no servidor do proxy. Detalhe: ${text.slice(0, 300)}`,
      );
    }
    if (res.status >= 500) {
      throw new ItauIndisponivel(
        `Itaú/proxy indisponível no momento (HTTP ${res.status}). Detalhe: ${text.slice(0, 300)}`,
      );
    }
    throw new Error(`Itaú respondeu ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? (JSON.parse(text) as Record<string, any>) : {};
}

/** Chamada autenticada; devolve o JSON de resposta ou lança erro legível. */
export async function chamarItau(call: ItauCall): Promise<Record<string, any>> {
  const proxy = proxyConfigurado();
  if (proxy) return await chamarViaProxy(call, proxy);

  const token = await obterToken(call.escopo, call.cred);
  const url = montarUrl(apiBase(call.escopo), call.caminho);

  // 5xx do Itaú costuma ser instabilidade/janela de manutenção: tenta de novo.
  let res: Response | null = null;
  let text = "";
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    res = await itauFetch(url, {
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
    text = await res.text();
    if (res.ok || res.status < 500) break;
    if (tentativa < 3) await new Promise((r) => setTimeout(r, tentativa * 1500));
  }

  if (res && !res.ok) {
    if (res.status >= 500) {
      throw new ItauIndisponivel(
        `O serviço do Itaú está indisponível no momento (HTTP ${res.status}). ` +
          "Isso costuma ser manutenção ou janela de funcionamento do Pix — tente novamente em alguns minutos. " +
          `Detalhe: ${text.slice(0, 300)}`,
      );
    }
    throw new Error(`Itaú respondeu ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? (JSON.parse(text) as Record<string, any>) : {};
}

export { env as itauEnv };

