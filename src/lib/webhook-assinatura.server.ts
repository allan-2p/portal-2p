/**
 * Validação de assinatura + timestamp para webhooks (Pix/Itaú).
 *
 * Camadas de proteção, na ordem em que são aplicadas:
 *  1. Token secreto na URL/header (já existente na rota).
 *  2. Timestamp dentro de uma janela de tolerância → limita replay antigo.
 *  3. HMAC-SHA256 sobre `<timestamp>.<corpo bruto>` → integridade do evento
 *     (o corpo não pode ser alterado sem invalidar a assinatura).
 *  4. Cache anti-replay em memória por assinatura/timestamp → bloqueia o
 *     reenvio idêntico dentro da janela (a idempotência do motor Pix continua
 *     sendo a garantia final).
 *
 * A assinatura só é exigida quando `ITAU_PIX_WEBHOOK_HMAC_SECRET` está
 * configurado; sem ele o webhook segue funcionando apenas com o token.
 * Nunca registre o segredo nem a assinatura completa em logs.
 */

export type AssinaturaResultado =
  | { ok: true; modo: "hmac" | "sem-assinatura"; timestamp?: number; assinatura?: string }
  | { ok: false; status: 400 | 401 | 409; erro: string };

const HEADERS_ASSINATURA = [
  "x-webhook-signature",
  "x-signature",
  "x-itau-signature",
  "x-hub-signature-256",
];
const HEADERS_TIMESTAMP = ["x-webhook-timestamp", "x-timestamp", "x-request-timestamp"];

/** Comparação em tempo constante entre duas strings hex. */
export function comparaSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(segredo: string, mensagem: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(mensagem)));
}

/**
 * Extrai assinatura e timestamp dos headers. Aceita:
 *  - `t=1699999999,v1=<hex>` (estilo Stripe/Itaú)
 *  - `sha256=<hex>` ou `<hex>` + header de timestamp separado
 */
export function lerCabecalhosAssinatura(headers: Headers): {
  assinatura: string | null;
  timestamp: number | null;
} {
  let bruto: string | null = null;
  for (const h of HEADERS_ASSINATURA) {
    const v = headers.get(h);
    if (v && v.trim()) {
      bruto = v.trim();
      break;
    }
  }

  let assinatura: string | null = null;
  let timestamp: number | null = null;

  if (bruto) {
    if (bruto.includes("=") && bruto.includes(",")) {
      for (const parte of bruto.split(",")) {
        const [k, v] = parte.split("=").map((s) => s?.trim() ?? "");
        if (k === "t" && v) timestamp = Number(v);
        if ((k === "v1" || k === "sha256" || k === "s") && v) assinatura = v.toLowerCase();
      }
    } else {
      assinatura = bruto.replace(/^sha256=/i, "").trim().toLowerCase();
    }
  }

  if (timestamp === null) {
    for (const h of HEADERS_TIMESTAMP) {
      const v = headers.get(h);
      if (v && v.trim()) {
        const n = Number(v.trim());
        timestamp = Number.isFinite(n) ? (n > 1e12 ? Math.floor(n / 1000) : n) : Math.floor(Date.parse(v) / 1000);
        break;
      }
    }
  } else if (timestamp > 1e12) {
    timestamp = Math.floor(timestamp / 1000);
  }

  if (timestamp !== null && !Number.isFinite(timestamp)) timestamp = null;
  return { assinatura, timestamp };
}

/** Cache anti-replay em memória (por instância), com expiração automática. */
const vistos = new Map<string, number>();

export function limparCacheReplay() {
  vistos.clear();
}

export function registrarEntrega(chave: string, ttlSegundos: number, agoraMs = Date.now()): boolean {
  for (const [k, exp] of vistos) if (exp <= agoraMs) vistos.delete(k);
  if (vistos.has(chave)) return false;
  vistos.set(chave, agoraMs + ttlSegundos * 1000);
  return true;
}

export type ValidarOpts = {
  rawBody: string;
  headers: Headers;
  segredo?: string | undefined;
  toleranciaSegundos?: number;
  agoraMs?: number;
  /** Quando true, exige assinatura mesmo sem segredo configurado. */
  exigirAssinatura?: boolean;
};

/**
 * Valida assinatura HMAC + timestamp e protege contra reenvio idêntico.
 * Sem segredo configurado, apenas a proteção anti-replay por corpo é aplicada.
 */
export async function validarAssinaturaWebhook(opts: ValidarOpts): Promise<AssinaturaResultado> {
  const tolerancia = opts.toleranciaSegundos ?? 300;
  const agoraMs = opts.agoraMs ?? Date.now();
  const segredo = (opts.segredo ?? "").trim();
  const { assinatura, timestamp } = lerCabecalhosAssinatura(opts.headers);

  if (!segredo) {
    if (opts.exigirAssinatura) {
      return { ok: false, status: 401, erro: "Assinatura exigida, mas o segredo não está configurado." };
    }
    // Sem assinatura: ainda bloqueia o reenvio byte-a-byte idêntico na janela.
    const chave = `body:${await hmacSha256Hex("replay", opts.rawBody)}`;
    if (!registrarEntrega(chave, tolerancia, agoraMs)) {
      return { ok: false, status: 409, erro: "Evento duplicado (replay) ignorado." };
    }
    return { ok: true, modo: "sem-assinatura" };
  }

  if (!assinatura) return { ok: false, status: 401, erro: "Assinatura ausente." };
  if (timestamp === null) return { ok: false, status: 400, erro: "Timestamp ausente na assinatura." };

  const deltaSeg = Math.abs(agoraMs / 1000 - timestamp);
  if (deltaSeg > tolerancia) {
    return { ok: false, status: 401, erro: `Timestamp fora da janela de ${tolerancia}s.` };
  }

  const esperado = await hmacSha256Hex(segredo, `${timestamp}.${opts.rawBody}`);
  const alternativa = await hmacSha256Hex(segredo, opts.rawBody);
  if (!comparaSeguro(assinatura, esperado) && !comparaSeguro(assinatura, alternativa)) {
    return { ok: false, status: 401, erro: "Assinatura inválida." };
  }

  if (!registrarEntrega(`sig:${timestamp}:${assinatura}`, tolerancia, agoraMs)) {
    return { ok: false, status: 409, erro: "Evento duplicado (replay) ignorado." };
  }

  return { ok: true, modo: "hmac", timestamp, assinatura };
}
