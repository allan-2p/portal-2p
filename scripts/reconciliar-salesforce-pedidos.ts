/**
 * Audita e corrige os campos operacionais de pedidos já vinculados ao CRM.
 *
 * Compara somente oportunidades de pedidos (status diferente de Salvo) e os
 * campos que mudam durante o ciclo: fase, status, CloseDate, OV do SAP e dados
 * de cancelamento. Não recria oportunidades nem reenvia produtos.
 *
 * Uso:
 *   bun run scripts/reconciliar-salesforce-pedidos.ts
 *   bun run scripts/reconciliar-salesforce-pedidos.ts --aplicar
 */

import { grupo2pRest } from "../src/lib/grupo2p-db.server";
import { dataFechamento } from "../src/lib/salesforce-campos";
import { faseDaProposta } from "../src/lib/salesforce-stage";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";
const APLICAR = process.argv.includes("--aplicar");
const lovableKey = process.env["LOVABLE_API_KEY"];
const sfKey = process.env["SALESFORCE_API_KEY"];
if (!lovableKey || !sfKey) throw new Error("Conector do Salesforce não está configurado.");

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sf(path: string, init?: RequestInit): Promise<any> {
  let ultimoErro = "";
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const res = await fetch(`${GATEWAY_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": sfKey,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : null;
    ultimoErro = `Salesforce ${res.status}: ${text.slice(0, 500)}`;
    if (!(res.status === 429 || res.status >= 500) || tentativa === 3) throw new Error(ultimoErro);
    const retryAfter = Number(res.headers.get("retry-after") ?? 0);
    await espera(retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** (tentativa - 1));
  }
  throw new Error(ultimoErro);
}

type PortalRow = Record<string, any> & { id: string; numero: string; sf_opp_id: string };
type SfRow = {
  Id: string;
  StageName: string | null;
  Status_do_Pedido__c: string | null;
  CloseDate: string | null;
  N_SAP__c: number | null;
  Motivo_de_cancelamento__c: string | null;
  Descri_o_do_Motivo_de_Perda__c: string | null;
};
type SfPatch = Partial<Omit<SfRow, "Id">>;

async function listarPortal(): Promise<PortalRow[]> {
  const select = [
    "id", "numero", "status", "finalizado_em", "created_at", "previsao_fechamento",
    "sap_ov_numero", "numero_sap", "sf_opp_id", "motivo_cancelamento", "motivo_cancelamento_obs",
    "motivo_perda", "perdida_em", "totais",
  ].join(",");
  const out: PortalRow[] = [];
  for (let pagina = 0; pagina < 60; pagina++) {
    const from = pagina * 1000;
    const r = await grupo2pRest(
      `propostas?select=${select}&sf_opp_id=not.is.null&status=neq.Salvo&order=created_at.asc`,
      { range: { from, to: from + 999 } },
    );
    if (!r.ok) throw new Error(`Banco ${r.status}: ${r.text.slice(0, 300)}`);
    const bloco = JSON.parse(r.text || "[]") as PortalRow[];
    out.push(...bloco);
    if (bloco.length < 1000) break;
  }
  return out;
}

const pedacos = <T,>(itens: T[], tamanho: number) =>
  Array.from({ length: Math.ceil(itens.length / tamanho) }, (_, i) => itens.slice(i * tamanho, i * tamanho + tamanho));

const texto = (valor: unknown) => String(valor ?? "").trim();
const numeroSap = (row: PortalRow) => {
  const valor = texto(row["sap_ov_numero"] ?? row["numero_sap"]).replace(/\D/g, "");
  return valor ? Number(valor) : null;
};

function esperado(row: PortalRow): SfPatch {
  const cancelado = texto(row["status"]) === "Cancelado";
  const motivo = texto(row["motivo_cancelamento"]);
  const observacao = texto(row["motivo_cancelamento_obs"]);
  return {
    StageName: faseDaProposta(row),
    Status_do_Pedido__c: texto(row["status"]) || null,
    CloseDate: dataFechamento(row) || null,
    N_SAP__c: numeroSap(row),
    // Não apaga justificativas históricas que existam só no CRM. O portal é
    // autoritativo para esses campos apenas quando tem um valor preenchido.
    ...(cancelado && motivo ? { Motivo_de_cancelamento__c: motivo } : {}),
    ...(cancelado && observacao ? { Descri_o_do_Motivo_de_Perda__c: observacao } : {}),
  };
}

function patchDivergente(atual: SfRow, alvo: SfPatch) {
  const patch: Record<string, string | number | null> = {};
  for (const [campo, valor] of Object.entries(alvo)) {
    const existente = atual[campo as keyof SfRow];
    if ((existente ?? null) !== (valor ?? null)) patch[campo] = valor;
  }
  return patch;
}

const portal = await listarPortal();
const porOpp = new Map(portal.map((row) => [row.sf_opp_id, row]));
const divergentes: Array<{ row: PortalRow; patch: Record<string, string | number | null> }> = [];
const ausentes: PortalRow[] = [];

for (const lote of pedacos([...porOpp.keys()], 200)) {
  const ids = lote.map((id) => `'${id.replace(/'/g, "\\'")}'`).join(",");
  const query =
    "SELECT Id, StageName, Status_do_Pedido__c, CloseDate, N_SAP__c, " +
    `Motivo_de_cancelamento__c, Descri_o_do_Motivo_de_Perda__c FROM Opportunity WHERE Id IN (${ids})`;
  const resposta = await sf(`/query?q=${encodeURIComponent(query)}`);
  const encontrados = new Set<string>();
  for (const atual of (resposta?.records ?? []) as SfRow[]) {
    encontrados.add(atual.Id);
    const row = porOpp.get(atual.Id);
    if (!row) continue;
    const patch = patchDivergente(atual, esperado(row));
    if (Object.keys(patch).length) divergentes.push({ row, patch });
  }
  for (const id of lote) {
    const row = porOpp.get(id);
    if (row && !encontrados.has(id)) ausentes.push(row);
  }
}

const porCampo: Record<string, number> = {};
for (const item of divergentes) {
  for (const campo of Object.keys(item.patch)) porCampo[campo] = (porCampo[campo] ?? 0) + 1;
}
console.log(`${portal.length} pedido(s) vinculados auditados.`);
console.log(`${divergentes.length} oportunidade(s) divergente(s); ${ausentes.length} vínculo(s) ausente(s) no CRM.`);
console.log(`Campos divergentes: ${JSON.stringify(porCampo)}`);
for (const item of divergentes.slice(0, 30)) {
  console.log(`  ${item.row.numero}: ${JSON.stringify(item.patch)}`);
}

if (!APLICAR) {
  console.log("Simulação: nada foi gravado. Rode com --aplicar para corrigir.");
  process.exit(0);
}

let corrigidas = 0;
const falhas: string[] = [];
for (const { row, patch } of divergentes) {
  try {
    await sf(`/sobjects/Opportunity/${row.sf_opp_id}`, { method: "PATCH", body: JSON.stringify(patch) });
    corrigidas++;
  } catch (e) {
    falhas.push(`${row.numero}: ${(e as Error).message}`);
  }
  if ((corrigidas + falhas.length) % 50 === 0) await espera(250);
}
console.log(`Corrigidas: ${corrigidas}; falhas: ${falhas.length}.`);
for (const falha of falhas.slice(0, 50)) console.log(`  ${falha}`);
if (falhas.length) process.exitCode = 1;