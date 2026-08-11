// Cliente Salesforce com OAuth client-credentials + retry para 503/429.

import { salesforceConfig } from "./env.js";

const tokens = new Map(); // instance -> { accessToken, instanceUrl, expiresAt }

async function getToken(instance) {
  const cached = tokens.get(instance);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const cfg = salesforceConfig(instance);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const res = await fetch(`${cfg.loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`Salesforce OAuth ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  const token = {
    accessToken: json.access_token,
    instanceUrl: String(json.instance_url).replace(/\/+$/, ""),
    // tokens client-credentials duram ~2h; renovamos a cada 45 min
    expiresAt: Date.now() + 45 * 60_000,
  };
  tokens.set(instance, token);
  return token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sfFetch(instance, path, attempt = 0) {
  const { accessToken, instanceUrl } = await getToken(instance);
  const cfg = salesforceConfig(instance);
  const url = path.startsWith("/services/")
    ? `${instanceUrl}${path}`
    : `${instanceUrl}/services/data/${cfg.apiVersion}${path}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (res.status === 401 && attempt === 0) {
    tokens.delete(instance);
    return sfFetch(instance, path, attempt + 1);
  }
  if ((res.status === 503 || res.status === 429 || res.status >= 500) && attempt < 4) {
    await sleep(2 ** attempt * 1000);
    return sfFetch(instance, path, attempt + 1);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Salesforce ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** Executa uma SOQL paginando por nextRecordsUrl e retorna todos os registros. */
export async function soqlAll(instance, soql, onBatch) {
  let payload = await sfFetch(instance, `/query?q=${encodeURIComponent(soql)}`);
  let total = 0;
  while (payload) {
    const records = payload.records ?? [];
    total += records.length;
    if (records.length && onBatch) await onBatch(records);
    if (payload.done || !payload.nextRecordsUrl) break;
    payload = await sfFetch(instance, payload.nextRecordsUrl);
  }
  return total;
}
