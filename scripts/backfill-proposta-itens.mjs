/**
 * Backfill de public.proposta_itens (banco Grupo 2P) a partir do JSON `itens`
 * de public.propostas — em lotes, idempotente (apaga e regrava os itens de
 * cada proposta processada).
 *
 * Uso:
 *   bun scripts/backfill-proposta-itens.mjs [--lote 200] [--max 1000] [--org solar]
 *
 * Pré-requisito: supabase/external/proposta-itens.sql aplicado no Grupo 2P.
 * Lacunas (item sem código SAP, proposta sem itens) são registradas no
 * integration_logs do portal (visível no painel do administrador).
 */

const G2P_URL = process.env.GRUPO2P_SUPABASE_URL;
const G2P_KEY = process.env.GRUPO2P_SUPABASE_SERVICE_ROLE_KEY;
const PORTAL_URL = process.env.SUPABASE_URL;
const PORTAL_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!G2P_URL || !G2P_KEY) throw new Error("GRUPO2P_SUPABASE_URL/KEY ausentes.");

const arg = (nome, def) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const LOTE = Math.max(50, Math.min(500, Number(arg("lote", 200)) || 200));
const MAX = Number(arg("max", 0)) || Infinity;
const ORG = arg("org", null);

async function g2p(path, init = {}) {
  const res = await fetch(`${G2P_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: G2P_KEY,
      Authorization: `Bearer ${G2P_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function logPortal(level, event, message, detail = {}) {
  if (!PORTAL_URL || !PORTAL_KEY) return;
  try {
    await fetch(`${PORTAL_URL}/rest/v1/integration_logs`, {
      method: "POST",
      headers: {
        apikey: PORTAL_KEY,
        Authorization: `Bearer ${PORTAL_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ slug: "backfill-proposta-itens", level, event, message, detail }),
    });
  } catch {
    /* log nunca derruba o backfill */
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function linhasDaProposta(p, issues) {
  const itens = Array.isArray(p.itens) ? p.itens : [];
  const tabela =
    (p.totais && typeof p.totais === "object" ? p.totais.listaPreco : null) ??
    p.sfo_tabela_de_preco_nome__c ??
    null;
  if (!itens.length) {
    issues.push({ proposta: p.numero, motivo: "proposta sem itens no JSON" });
    return [];
  }
  return itens.map((it, idx) => {
    const codigo = String(it?.codigo ?? "").trim() || null;
    if (!codigo) issues.push({ proposta: p.numero, motivo: "item sem código SAP", item: it?.nome ?? null });
    return {
      proposta_id: p.id,
      organizacao: p.organizacao ?? "solar",
      numero: p.numero ?? null,
      numero_sap: p.numero_sap ?? null,
      sf_opp_id: p.sf_opp_id ?? null,
      ordem: idx,
      codigo_sap: codigo,
      nome: String(it?.nome ?? ""),
      quantidade: num(it?.qtd),
      valor_unitario: num(it?.valor),
      valor_total: num(it?.total),
      tabela_preco: tabela ? String(tabela) : null,
      valor_manual: Boolean(it?.valorManual),
      extra: Boolean(it?.extra),
    };
  });
}

const t0 = Date.now();
let ultimoId = "00000000-0000-0000-0000-000000000000";
let propostas = 0;
let itensInseridos = 0;
let issues = [];

// Confirma que a tabela existe antes de varrer 42k propostas.
try {
  await g2p("proposta_itens?select=id&limit=1");
} catch {
  console.error(
    'A tabela proposta_itens não existe no Grupo 2P. Rode supabase/external/proposta-itens.sql no SQL Editor primeiro.',
  );
  process.exit(1);
}

while (propostas < MAX) {
  const tam = Math.min(LOTE, MAX - propostas);
  const params = new URLSearchParams({
    select: "id,organizacao,numero,numero_sap,sf_opp_id,itens,totais,sfo_tabela_de_preco_nome__c",
    id: `gt.${ultimoId}`,
    order: "id.asc",
    limit: String(tam),
  });
  if (ORG) params.set("organizacao", `eq.${ORG}`);
  const batch = await g2p(`propostas?${params}`);
  if (!batch.length) break;
  ultimoId = batch[batch.length - 1].id;

  const linhas = [];
  const ids = [];
  for (const p of batch) {
    ids.push(p.id);
    linhas.push(...linhasDaProposta(p, issues));
  }

  // Idempotente: regrava os itens das propostas do lote.
  const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n));
  for (const parte of chunk(ids, 50)) {
    await g2p(`proposta_itens?proposta_id=in.(${parte.join(",")})`, { method: "DELETE" });
  }
  for (const parte of chunk(linhas, 500)) {
    await g2p("proposta_itens", { method: "POST", body: JSON.stringify(parte) });
  }

  propostas += batch.length;
  itensInseridos += linhas.length;
  console.log(`lote ok: ${propostas} propostas, ${itensInseridos} itens, ${issues.length} lacunas`);
}

// Avisos no painel do administrador (amostra de até 200 lacunas + resumo).
for (const lac of issues.slice(0, 200)) {
  await logPortal("warn", "backfill_lacuna", `Proposta ${lac.proposta ?? "s/nº"}: ${lac.motivo}.`, lac);
}
await logPortal(
  issues.length ? "warn" : "info",
  "backfill_resumo",
  `Backfill proposta_itens: ${propostas} propostas, ${itensInseridos} itens, ${issues.length} lacunas.`,
  {
    propostas,
    itens: itensInseridos,
    lacunas: issues.length,
    amostra_registrada: Math.min(issues.length, 200),
    org: ORG ?? "todas",
  },
);

console.log(
  JSON.stringify({ propostas, itens: itensInseridos, lacunas: issues.length, ms: Date.now() - t0 }),
);
