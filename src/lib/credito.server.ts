/**
 * Leitura do histórico de Análise de Crédito no Salesforce (`Analise_de_Credito__c`).
 * Somente leitura — o portal não escreve nesse objeto.
 */

import type { CreditoHistoricoSf } from "./credito";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";

function secrets() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sfKey = process.env["SALESFORCE_API_KEY"];
  if (!lovableKey || !sfKey) return null;
  return { lovableKey, sfKey };
}

const esc = (v: string) => v.replace(/['\\]/g, "\\$&");

async function sf(path: string): Promise<any> {
  const s = secrets();
  if (!s) throw new Error("Conector do Salesforce não está configurado.");
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${s.lovableKey}`,
      "X-Connection-Api-Key": s.sfKey,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Salesforce [${res.status}]: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** Histórico de análises do Salesforce para um CNPJ/CPF (só dígitos). */
export async function historicoCreditoSalesforce(doc: string): Promise<CreditoHistoricoSf[]> {
  const d = String(doc ?? "").replace(/\D/g, "");
  if (!d || !secrets()) return [];

  const acc = await sf(
    `/query?q=${encodeURIComponent(`SELECT Id FROM Account WHERE CNPJ__c = '${esc(d)}' LIMIT 1`)}`,
  ).catch(() => null);
  const accountId: string | undefined = acc?.records?.[0]?.Id;
  if (!accountId) return [];

  const soql =
    `SELECT Id, Name, Status_da_Analise__c, Conclusao__c, Restricao__c, Condicao_Solicitada__c, ` +
    `Condicao_Aprovada__c, Credito_Solicitado_R__c, Credito_Aprovado_R__c, Pontuacao_no_Serasa__c, ` +
    `Prioridade__c, Solicitacao__c, Concluido__c, Observacoes_do_Financeiro__c, ` +
    `Observacoes_do_Vendedor__c FROM Analise_de_Credito__c WHERE Conta__c = '${esc(accountId)}' ` +
    `ORDER BY CreatedDate DESC LIMIT 50`;

  const res = await sf(`/query?q=${encodeURIComponent(soql)}`).catch(() => ({ records: [] }));
  const num = (v: any) => (typeof v === "number" ? v : null);

  return ((res?.records ?? []) as any[]).map((r) => ({
    id: r.Id,
    nome: r.Name ?? null,
    status: r.Status_da_Analise__c ?? null,
    conclusao: r.Conclusao__c ?? null,
    restricao: r.Restricao__c ?? null,
    condicaoSolicitada: r.Condicao_Solicitada__c ?? null,
    condicaoAprovada: r.Condicao_Aprovada__c ?? null,
    creditoSolicitado: num(r.Credito_Solicitado_R__c),
    creditoAprovado: num(r.Credito_Aprovado_R__c),
    serasa: num(r.Pontuacao_no_Serasa__c),
    prioridade: r.Prioridade__c ?? null,
    solicitadoEm: r.Solicitacao__c ?? null,
    concluidoEm: r.Concluido__c ?? null,
    observacoesFinanceiro: r.Observacoes_do_Financeiro__c ?? null,
    observacoesVendedor: r.Observacoes_do_Vendedor__c ?? null,
  }));
}
