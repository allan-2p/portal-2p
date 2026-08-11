// Config do worker. Lê apenas process.env (carregue o .env via `node --env-file=.env`).

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

export const INSTANCES = ["solar", "carregadores"];

export function portalConfig() {
  return {
    url: req("PORTAL_SUPABASE_URL").replace(/\/+$/, ""),
    key: req("PORTAL_SUPABASE_SERVICE_KEY"),
  };
}

export function mirrorConfig(instance) {
  const prefix = instance === "carregadores" ? "ACCOUNTS_CARREGADORES" : "ACCOUNTS_SOLAR";
  return {
    url: req(`${prefix}_SUPABASE_URL`).replace(/\/+$/, ""),
    key: req(`${prefix}_SUPABASE_SERVICE_KEY`),
  };
}

export function salesforceConfig(instance) {
  const prefix = instance === "carregadores" ? "SF_CARREGADORES" : "SF_SOLAR";
  return {
    loginUrl: (process.env[`${prefix}_LOGIN_URL`] || "https://login.salesforce.com").replace(/\/+$/, ""),
    clientId: req(`${prefix}_CLIENT_ID`),
    clientSecret: req(`${prefix}_CLIENT_SECRET`),
    apiVersion: process.env["SF_API_VERSION"] || "v62.0",
  };
}

export const schedule = {
  syncIntervalMs: Number(process.env["SYNC_INTERVAL_MINUTES"] || 30) * 60_000,
  queuePollMs: Number(process.env["QUEUE_POLL_SECONDS"] || 30) * 1000,
};
