/**
 * ROTINA TEMPORÁRIA — executa a carga única das 66 vendas do Limpador 2P
 * (Intersolar 2026) chamando o hook /api/public/hooks/importacao-intersolar.
 *
 * Uso:
 *   node scripts/importacao-intersolar.mjs --csv docs/vendas-limpador-intersolar-normalizado.csv \
 *        --base http://localhost:8080 --token <access_token> [--dry] [--linhas 1,2,3] [--lote 3]
 *
 * REMOVER APÓS A EXECUÇÃO.
 */
import { readFileSync, writeFileSync } from "node:fs";

const arg = (k, d = null) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const flag = (k) => process.argv.includes(`--${k}`);

const csvPath = arg("csv", "docs/vendas-limpador-intersolar-normalizado.csv");
const base = arg("base", "http://localhost:8080");
const token = arg("token") || process.env.PORTAL_ACCESS_TOKEN;
const secret = process.env.CRON_HOOK_SECRET;
const lote = Number(arg("lote", "3"));
const filtro = arg("linhas") ? new Set(arg("linhas").split(",").map((s) => s.trim())) : null;

if (!token) throw new Error("Informe --token (access token do executor).");
if (!secret) throw new Error("CRON_HOOK_SECRET não está no ambiente.");

/** Parser de CSV com delimitador ';' e aspas duplas. */
function parseCsv(texto) {
  const linhas = [];
  let campo = "";
  let atual = [];
  let aspas = false;
  const src = texto.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (aspas) {
      if (c === '"' && src[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ";") { atual.push(campo); campo = ""; }
    else if (c === "\n") { atual.push(campo); linhas.push(atual); atual = []; campo = ""; }
    else campo += c;
  }
  if (campo || atual.length) { atual.push(campo); linhas.push(atual); }
  const [cab, ...resto] = linhas.filter((l) => l.some((v) => v.trim() !== ""));
  return resto.map((l) => Object.fromEntries(cab.map((k, i) => [k.trim(), (l[i] ?? "").trim()])));
}

const todas = parseCsv(readFileSync(csvPath, "utf8"));
const alvo = filtro ? todas.filter((l) => filtro.has(l.linha)) : todas;
console.log(`Linhas a processar: ${alvo.length}`);

const relatorio = [];
for (let i = 0; i < alvo.length; i += lote) {
  const bloco = alvo.slice(i, i + lote);
  const res = await fetch(`${base}/api/public/hooks/importacao-intersolar`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cron-secret": secret,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ linhas: bloco, dryRun: flag("dry"), continuarEmErro: flag("seguir") }),
  });
  const txt = await res.text();
  let json;
  try { json = JSON.parse(txt); } catch { json = { ok: false, erro: txt.slice(0, 800) }; }
  relatorio.push(...(json.relatorio ?? []));
  for (const r of json.relatorio ?? []) console.log(JSON.stringify(r));
  if (!json.ok) {
    console.error("\nCARGA INTERROMPIDA:", json.erro ?? "erro na linha acima");
    writeFileSync("/tmp/importacao-intersolar-relatorio.json", JSON.stringify(relatorio, null, 2));
    process.exit(1);
  }
}

writeFileSync("/tmp/importacao-intersolar-relatorio.json", JSON.stringify(relatorio, null, 2));
console.log(`\nOK — ${relatorio.length} linha(s). Relatório em /tmp/importacao-intersolar-relatorio.json`);
