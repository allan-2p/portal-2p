/**
 * Verificação de saúde das integrações do Portal 2P.
 *
 * Cada integração devolve um status simples (ok / erro / não configurada) e,
 * quando existe, a data da última sincronização conhecida.
 */

export type IntegrationHealthStatus = "ok" | "error" | "off";

export type IntegrationHealth = {
  slug: string;
  status: IntegrationHealthStatus;
  detail: string;
  lastSync: string | null;
};

function envOk(slug: string, label: string, vars: string[], okDetail: string): IntegrationHealth {
  const missing = vars.filter((v) => !process.env[v]);
  return missing.length
    ? { slug, status: "off", detail: `${label}: credenciais ausentes (${missing.join(", ")})`, lastSync: null }
    : { slug, status: "ok", detail: okDetail, lastSync: null };
}

async function checkSalesforce(): Promise<IntegrationHealth> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sfKey = process.env["SALESFORCE_API_KEY"];
  if (!lovableKey || !sfKey) {
    return { slug: "salesforce", status: "off", detail: "Nenhuma conexão vinculada ao projeto.", lastSync: null };
  }
  try {
    const res = await fetch("https://connector-gateway.lovable.dev/api/v1/verify_credentials", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": sfKey },
    });
    const body = (await res.json().catch(() => ({}))) as { outcome?: string; error?: string };
    if (!res.ok || body?.outcome === "failed") {
      return { slug: "salesforce", status: "error", detail: body?.error ?? `Falha (HTTP ${res.status}).`, lastSync: null };
    }
    return { slug: "salesforce", status: "ok", detail: "Conexão verificada.", lastSync: new Date().toISOString() };
  } catch (e) {
    return { slug: "salesforce", status: "error", detail: e instanceof Error ? e.message : "Erro desconhecido.", lastSync: null };
  }
}

export async function collectIntegrationsHealth(): Promise<IntegrationHealth[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const results: IntegrationHealth[] = [];

  results.push(await checkSalesforce());

  // Lovable Cloud — banco principal
  try {
    const { error } = await supabaseAdmin.from("instances").select("id").limit(1);
    results.push(
      error
        ? { slug: "lovable-cloud", status: "error", detail: error.message, lastSync: null }
        : { slug: "lovable-cloud", status: "ok", detail: "Banco respondendo normalmente.", lastSync: new Date().toISOString() },
    );
  } catch (e) {
    results.push({ slug: "lovable-cloud", status: "error", detail: e instanceof Error ? e.message : "Erro", lastSync: null });
  }

  // SAP — última execução de sincronização
  try {
    const { data } = await supabaseAdmin
      .from("sap_produtos_sync_runs")
      .select("status, finished_at, started_at, error_message")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const configured = Boolean(
      (process.env["SAP_BRIDGE_URL"] ?? process.env["SAP_RFC_URL"]) &&
        (process.env["SAP_BRIDGE_AUTH"] ?? (process.env["SAP_BRIDGE_USER"] && process.env["SAP_BRIDGE_PASSWORD"])),
    );
    if (!configured) {
      results.push({ slug: "sap", status: "off", detail: "SAP Bridge não configurado.", lastSync: data?.finished_at ?? null });
    } else if (data && data.status === "error") {
      results.push({ slug: "sap", status: "error", detail: data.error_message ?? "Última sincronização falhou.", lastSync: data.finished_at ?? null });
    } else {
      results.push({
        slug: "sap",
        status: "ok",
        detail: data ? `Última sincronização: ${data.status}.` : "Configurado — nenhuma sincronização executada ainda.",
        lastSync: data?.finished_at ?? null,
      });
    }
  } catch (e) {
    results.push({ slug: "sap", status: "error", detail: e instanceof Error ? e.message : "Erro", lastSync: null });
  }

  // Storage / Top 20
  try {
    const { data, error } = await supabaseAdmin.storage.from("top20").list("", { search: "top20.csv" });
    const file = data?.find((f) => f.name === "top20.csv") ?? null;
    results.push(
      error
        ? { slug: "storage", status: "error", detail: error.message, lastSync: null }
        : {
            slug: "storage",
            status: "ok",
            detail: file ? "Arquivo Top 20 disponível." : "Nenhum arquivo Top 20 enviado ainda.",
            lastSync: file?.updated_at ?? null,
          },
    );
  } catch (e) {
    results.push({ slug: "storage", status: "error", detail: e instanceof Error ? e.message : "Erro", lastSync: null });
  }
  const storage = results.find((r) => r.slug === "storage")!;
  results.push({ ...storage, slug: "top20" });

  results.push(
    envOk("base-contas-carregadores", "Base de Contas", ["ACCOUNTS_CARREGADORES_SUPABASE_KEY"], "Espelho de contas configurado."),
    envOk("metricool", "Metricool", ["METRICOOL_USER_TOKEN", "METRICOOL_USER_ID"], "Credenciais configuradas."),
    envOk("notion", "Notion", ["NOTION_API_KEY"], "Credenciais configuradas."),
    envOk("lovable-ai", "Lovable AI", ["LOVABLE_API_KEY"], "Gateway de IA disponível."),
    envOk("serpro-cnpja", "Serpro / CNPJá", ["CNPJA_API_KEY"], "Enriquecimento por CNPJ disponível."),
    { slug: "viacep", status: "ok", detail: "Serviço público, sem credenciais.", lastSync: null },
    { slug: "mcp", status: "ok", detail: "Endpoint /mcp publicado.", lastSync: null },
  );

  // E-mails transacionais — último envio registrado
  try {
    const { data } = await supabaseAdmin
      .from("email_send_log")
      .select("status, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    results.push({
      slug: "emails",
      status: data && data.status === "error" ? "error" : "ok",
      detail: data ? `Último envio: ${data.status}.` : "Nenhum envio registrado ainda.",
      lastSync: data?.created_at ?? null,
    });
  } catch (e) {
    results.push({ slug: "emails", status: "error", detail: e instanceof Error ? e.message : "Erro", lastSync: null });
  }

  return results;
}
