/**
 * Reprocessamento em lote do CloseDate no Salesforce.
 *
 * O CloseDate passou a ser a data em que o pedido foi FECHADO de fato
 * (`finalizado_em` no portal). As oportunidades já criadas antes dessa
 * correção ficaram com a data de criação, o que jogava o pedido para o mês
 * errado no "Vendido" da home.
 *
 * Uso:
 *   bun run scripts/reprocessar-closedate.ts            # simulação (não grava)
 *   bun run scripts/reprocessar-closedate.ts --aplicar  # grava no Salesforce
 */

import { grupo2pRest } from "../src/lib/grupo2p-db.server";
import { diaBR } from "../src/lib/salesforce-campos";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";
const APLICAR = process.argv.includes("--aplicar");

const lovableKey = process.env["LOVABLE_API_KEY"];
const sfKey = process.env["SALESFORCE_API_KEY"];
if (!lovableKey || !sfKey) throw new Error("Conector do Salesforce não está configurado.");

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sf(path: string, init?: RequestInit): Promise<any> {
  let ultimo = "";
  for (let t = 1; t <= 3; t++) {
    const res = await fetch(`${GATEWAY_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": sfKey!,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : null;
    ultimo = `Salesforce ${res.status}: ${text.slice(0, 300)}`;
    if (!(res.status === 429 || res.status >= 500) || t === 3) throw new Error(ultimo);
    await espera(500 * 2 ** (t - 1));
  }
  throw new Error(ultimo);
}

type Linha = { id: string; numero: string | null; finalizado_em: string; sf_opp_id: string };

async function listar(): Promise<Linha[]> {
  const out: Linha[] = [];
  for (let pagina = 0; pagina < 60; pagina++) {
    const from = pagina * 1000;
    const r: any = await grupo2pRest(
      "propostas?select=id,numero,finalizado_em,sf_opp_id&finalizado_em=not.is.null&sf_opp_id=not.is.null&order=finalizado_em.desc",
      { range: { from, to: from + 999 } } as any,
    );
    if (!r.ok) throw new Error(`Banco ${r.status}: ${r.text.slice(0, 200)}`);
    const bloco: Linha[] = JSON.parse(r.text || "[]");
    out.push(...bloco);
    if (bloco.length < 1000) break;
  }
  return out;
}

const pedacos = <T,>(a: T[], n: number) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

const linhas = await listar();
console.log(`${linhas.length} pedido(s) fechado(s) com oportunidade no CRM.`);

const esperado = new Map<string, { dia: string; numero: string | null }>();
for (const l of linhas) {
  const dia = diaBR(l.finalizado_em);
  if (dia) esperado.set(l.sf_opp_id, { dia, numero: l.numero });
}

const divergentes: { id: string; numero: string | null; de: string; para: string }[] = [];
for (const grupo of pedacos([...esperado.keys()], 200)) {
  const q = `SELECT Id, CloseDate FROM Opportunity WHERE Id IN (${grupo.map((i) => `'${i}'`).join(",")})`;
  const r = await sf(`/query?q=${encodeURIComponent(q)}`);
  for (const rec of r?.records ?? []) {
    const alvo = esperado.get(rec.Id);
    if (!alvo) continue;
    const atual = String(rec.CloseDate ?? "").slice(0, 10);
    if (atual !== alvo.dia) divergentes.push({ id: rec.Id, numero: alvo.numero, de: atual, para: alvo.dia });
  }
}

console.log(`${divergentes.length} oportunidade(s) com CloseDate divergente.`);
for (const d of divergentes.slice(0, 20)) console.log(`  ${d.numero ?? d.id}: ${d.de} -> ${d.para}`);

if (!APLICAR) {
  console.log("Simulação: nada foi gravado. Rode com --aplicar para atualizar.");
  process.exit(0);
}

let ok = 0;
const erros: string[] = [];
for (const d of divergentes) {
  try {
    await sf(`/sobjects/Opportunity/${d.id}`, { method: "PATCH", body: JSON.stringify({ CloseDate: d.para }) });
    ok += 1;
  } catch (e) {
    erros.push(`${d.numero ?? d.id}: ${(e as Error).message}`);
  }
  if (ok % 50 === 0) await espera(200);
}
console.log(`Atualizadas: ${ok} • falhas: ${erros.length}`);
for (const e of erros.slice(0, 20)) console.log(`  ${e}`);
