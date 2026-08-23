/**
 * Envio do pedido (proposta concluída) ao Salesforce.
 *
 * O pedido vira uma **Opportunity** vinculada à Account do cliente (busca por
 * CNPJ__c, com fallback por nome). É idempotente: se a proposta já tem
 * `sf_opp_id`, o registro é atualizado (PATCH) em vez de duplicado.
 *
 * Tudo é registrado em `integration_logs` (slug `salesforce`, evento
 * `pedido.sync`) com `detail.proposta_id`, o que alimenta o painel de
 * integrações na linha do pedido.
 */

import * as db from "./propostas-db.server";
import { logIntegrationEvent } from "./integration-logs.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";

export type SalesforcePedidoResultado = {
  enviado: boolean;
  ok: boolean;
  opportunityId: string | null;
  accountId: string | null;
  mensagem: string | null;
  motivo?: string;
};

function secrets() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sfKey = process.env["SALESFORCE_API_KEY"];
  if (!lovableKey || !sfKey) return null;
  return { lovableKey, sfKey };
}

export function salesforcePedidosConfigurado() {
  return Boolean(secrets());
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Chamada ao gateway com retry 3x e backoff para 429/5xx — o caminho de
 * escrita (Opportunity) não pode falhar por indisponibilidade momentânea.
 */
async function sf(path: string, init?: RequestInit): Promise<any> {
  const s = secrets();
  if (!s) throw new Error("Conector do Salesforce não está configurado.");

  let ultimoErro = "";
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const res = await fetch(`${GATEWAY_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${s.lovableKey}`,
        "X-Connection-Api-Key": s.sfKey,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (res.ok) return body;

    const msg = typeof body === "object" ? JSON.stringify(body) : String(body);
    ultimoErro = `Salesforce ${res.status}: ${String(msg).slice(0, 400)}`;
    const recuperavel = res.status === 429 || res.status >= 500;
    if (!recuperavel || tentativa === 3) throw new Error(ultimoErro);
    await espera(500 * 2 ** (tentativa - 1));
  }
  throw new Error(ultimoErro);
}

const esc = (v: string) => String(v).replace(/'/g, "\\'");
const so = (v: unknown) => String(v ?? "").trim();
const digitos = (v: unknown) => so(v).replace(/\D/g, "");

/**
 * Estágio da Opportunity e organização: definidos em `salesforce-stage.ts`
 * (módulo puro, compartilhado com a tela de mapeamento de campos).
 */
export { SF_STAGE_POR_STATUS, stage, orgOportunidade } from "./salesforce-stage";


async function acharAccount(doc: string, nome: string): Promise<string | null> {
  const d = digitos(doc);
  if (d) {
    try {
      const q = `SELECT Id FROM Account WHERE CNPJ__c = '${esc(d)}' LIMIT 1`;
      const r = await sf(`/query?q=${encodeURIComponent(q)}`);
      if (r?.records?.[0]?.Id) return r.records[0].Id;
    } catch {
      // Org sem CNPJ__c — cai no fallback por nome.
    }
  }
  if (!nome) return null;
  const q2 = `SELECT Id FROM Account WHERE Name = '${esc(nome)}' LIMIT 1`;
  const r2 = await sf(`/query?q=${encodeURIComponent(q2)}`);
  return r2?.records?.[0]?.Id ?? null;
}

/** Descrição legível do pedido (itens, frete, SAP) para o campo Description. */
function descricao(row: Record<string, any>): string {
  const linhas: string[] = [];
  const itens = Array.isArray(row["itens"]) ? (row["itens"] as any[]) : [];
  for (const i of itens) {
    const qtd = Number(i?.qtd ?? 0);
    if (!qtd) continue;
    linhas.push(`• ${qtd}x ${so(i?.nome) || so(i?.codigo) || "Item"} — ${so(i?.codigo)}`);
  }
  const frete = so(row["frete_mod"]).toUpperCase();
  if (frete) linhas.push(`Frete: ${frete}${row["frete_valor"] ? ` (R$ ${Number(row["frete_valor"]).toFixed(2)})` : ""}`);
  if (so(row["forma_pagamento"])) linhas.push(`Pagamento: ${so(row["forma_pagamento"])}`);
  if (so(row["sap_ov_numero"])) linhas.push(`Ordem de venda SAP: ${so(row["sap_ov_numero"])}`);
  if (so(row["numero_sap"])) linhas.push(`Nº SAP: ${so(row["numero_sap"])}`);
  if (so(row["observacoes"])) linhas.push(`Observações: ${so(row["observacoes"])}`);
  return linhas.join("\n").slice(0, 30000);
}

/** OwnerId do vendedor (profiles.sf_user_id), quando cadastrado. */
async function ownerSfId(userId: unknown): Promise<string | null> {
  const id = so(userId);
  if (!id) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("profiles").select("sf_user_id").eq("id", id).maybeSingle();
    return so((data as any)?.sf_user_id) || null;
  } catch {
    return null;
  }
}

/** Nomes de campos recusados pela org, extraídos da mensagem de erro. */
function camposInvalidos(msg: string): string[] {
  const achados = new Set<string>();
  for (const m of msg.matchAll(/([A-Za-z0-9_]+__c)/g)) achados.add(m[1]!);
  return [...achados];
}

/**
 * Procura a oportunidade já existente do pedido (propostas anteriores ao
 * vínculo persistido), evitando duplicar no Salesforce.
 */
async function acharOpp(numero: string, nomeOpp: string): Promise<string | null> {
  if (numero) {
    try {
      const q = `SELECT Id FROM Opportunity WHERE Numero_Pedido_Portal__c = '${esc(numero)}' ORDER BY CreatedDate DESC LIMIT 1`;
      const r = await sf(`/query?q=${encodeURIComponent(q)}`);
      if (r?.records?.[0]?.Id) return r.records[0].Id;
    } catch {
      // Org sem o campo customizado — cai no fallback por nome.
    }
  }
  if (!nomeOpp) return null;
  try {
    const q = `SELECT Id FROM Opportunity WHERE Name = '${esc(nomeOpp)}' ORDER BY CreatedDate DESC LIMIT 1`;
    const r = await sf(`/query?q=${encodeURIComponent(q)}`);
    return r?.records?.[0]?.Id ?? null;
  } catch {
    return null;
  }
}

/**

 * Organização da oportunidade (picklist `Org_Oportunidade__c`).
 * 2P Solar → "Acessórios 2P" · 2P Carregadores → "2P Carregadores".
 */
export function orgOportunidade(row: Record<string, any>): string | null {
  const org = so(row["organizacao"] ?? row["instancia"]).toLowerCase();
  if (org.includes("solar") || org.includes("acess")) return "Acessórios 2P";
  if (org.includes("carregad")) return "2P Carregadores";
  return null;
}

/**
 * Gravação do vínculo com o Salesforce. Se falhar, o próximo envio criaria uma
 * oportunidade duplicada — por isso o erro é registrado explicitamente.
 */
async function gravar(id: string, patch: Record<string, unknown>) {
  try {
    await db.atualizarProposta(id, patch);
  } catch (e) {
    await logIntegrationEvent({
      slug: "salesforce",
      event: "pedido.sync",
      level: "error",
      message: `Não foi possível gravar o vínculo do Salesforce na proposta: ${(e as Error).message.slice(0, 300)}`,
      detail: { proposta_id: id, patch },
    });
  }
}


/**
 * Cria/atualiza a Opportunity do pedido no Salesforce. Nunca lança:
 * devolve o resultado para o chamador registrar/exibir.
 */
export async function sincronizarPedidoSalesforce(
  propostaId: string,
  opts: { forcar?: boolean } = {},
): Promise<SalesforcePedidoResultado> {
  const inicio = Date.now();
  const base = { slug: "salesforce", event: "pedido.sync" } as const;

  const row = await db.getProposta(propostaId);
  if (!row)
    return { enviado: false, ok: false, opportunityId: null, accountId: null, mensagem: "Proposta não encontrada." };

  if (!secrets()) {
    return {
      enviado: false,
      ok: false,
      opportunityId: null,
      accountId: null,
      mensagem: "Conector do Salesforce não está configurado.",
      motivo: "nao_configurado",
    };
  }

  const existente = so(row["sf_opp_id"]);
  const numero = so(row["numero"]);
  const clienteNome = so(row["cliente_nome"]);

  try {
    const accountId = so(row["sf_account_id"]) || (await acharAccount(row["cliente_doc"], clienteNome));
    if (!accountId) {
      const mensagem = "Conta do cliente não encontrada no Salesforce — sincronize o cadastro do cliente primeiro.";
      await gravar(propostaId, { sf_status: "erro", sf_mensagem: mensagem });
      await logIntegrationEvent({
        ...base,
        level: "error",
        message: mensagem,
        detail: { proposta_id: propostaId, numero, cliente: clienteNome },
        durationMs: Date.now() - inicio,
      });
      return { enviado: false, ok: false, opportunityId: null, accountId: null, mensagem, motivo: "sem_conta" };
    }

    // Padrão do Opportunity Name: "número da proposta - nome da proposta".
    const nomeOpp = [numero, so(row["nome"]) || clienteNome].filter(Boolean).join(" - ").slice(0, 120);

    // O corpo sai do mapeamento configurável (Admin › Integrações ›
    // Salesforce › Campos): a tela de conferência mostra exatamente o que é
    // gravado na org.
    const { carregarMapeamento } = await import("./salesforce-campos.server");
    const { montarPayload } = await import("./salesforce-campos");
    const overrides = await carregarMapeamento("Opportunity");
    const owner = await ownerSfId(row["created_by"]);
    const { payload } = montarPayload(
      "Opportunity",
      { ...(row as Record<string, any>), _account_id: accountId, _owner_id: owner },
      overrides,
    );
    // Campos obrigatórios do Salesforce: usados como fallback se a org recusar
    // algum campo customizado do mapeamento.
    const corpoBase: Record<string, unknown> = {
      Name: payload["Name"] ?? nomeOpp,
      AccountId: accountId,
      StageName: payload["StageName"] ?? stage(row["status"]),
      CloseDate: payload["CloseDate"],
      Amount: payload["Amount"],
      Description: payload["Description"],
    };
    const custom: Record<string, unknown> = { ...payload };
    for (const k of Object.keys(corpoBase)) delete custom[k];


    // Vínculo: usa o sf_opp_id da proposta; se não houver, procura a
    // oportunidade já existente do mesmo pedido antes de criar uma nova.
    let oppId: string | null = existente || (await acharOpp(numero, nomeOpp));

    const enviar = (corpo: Record<string, unknown>) =>
      oppId
        ? sf(`/sobjects/Opportunity/${oppId}`, { method: "PATCH", body: JSON.stringify(corpo) })
        : sf(`/sobjects/Opportunity`, { method: "POST", body: JSON.stringify(corpo) });

    let corpo: Record<string, unknown> = { ...corpoBase, ...custom };
    let res: any;
    for (let tentativa = 1; ; tentativa++) {
      try {
        res = await enviar(corpo);
        break;
      } catch (err) {
        const msg = (err as Error).message;
        const campoInvalido = camposInvalidos(msg).filter((c) => c in corpo);
        if (campoInvalido.length && tentativa <= 6) {
          corpo = { ...corpo };
          for (const c of campoInvalido) delete corpo[c];
          continue;
        }
        if (/No such column|INVALID_FIELD|Unable to create\/update fields/i.test(msg) && tentativa <= 6) {
          corpo = { ...corpoBase };
          continue;
        }
        if (oppId && /NOT_FOUND|INVALID_CROSS_REFERENCE_KEY|entity is deleted/i.test(msg) && tentativa <= 6) {
          // A oportunidade vinculada não existe mais na org: cria outra.
          oppId = null;
          continue;
        }
        throw err;
      }
    }
    const atualizou = Boolean(oppId);
    oppId = oppId ?? res?.id ?? null;
    if (!oppId) throw new Error("Salesforce não retornou o ID da oportunidade.");

    const mensagem = atualizou ? `Oportunidade ${oppId} atualizada.` : `Oportunidade ${oppId} criada.`;

    await gravar(propostaId, {
      sf_opp_id: oppId,
      sf_account_id: accountId,
      sf_status: "sincronizado",
      sf_mensagem: mensagem,
      sf_enviado_em: new Date().toISOString(),
    });
    await logIntegrationEvent({
      ...base,
      level: "info",
      message: mensagem,
      detail: { proposta_id: propostaId, numero, cliente: clienteNome, opportunity_id: oppId, account_id: accountId },
      durationMs: Date.now() - inicio,
    });

    return { enviado: true, ok: true, opportunityId: oppId, accountId, mensagem };
  } catch (err) {
    const mensagem = (err as Error).message.slice(0, 500);
    await gravar(propostaId, { sf_status: "erro", sf_mensagem: mensagem });
    await logIntegrationEvent({
      ...base,
      level: "error",
      message: mensagem,
      detail: { proposta_id: propostaId, numero, cliente: clienteNome },
      durationMs: Date.now() - inicio,
    });
    return { enviado: true, ok: false, opportunityId: null, accountId: null, mensagem };
  }
}

/**
 * Sincronização "best effort" usada no salvamento da proposta: nunca lança e
 * nunca trava a gravação — o erro fica no `integration_logs` e nos campos
 * `sf_status`/`sf_mensagem` da proposta para reenvio manual.
 */
export async function sincronizarPedidoSalesforceSeguro(
  propostaId: string,
): Promise<SalesforcePedidoResultado> {
  try {
    return await sincronizarPedidoSalesforce(propostaId);
  } catch (e) {
    return {
      enviado: false,
      ok: false,
      opportunityId: null,
      accountId: null,
      mensagem: (e as Error).message.slice(0, 500),
    };
  }
}

export type SalesforceLoteResultado = {
  total: number;
  sincronizados: number;
  falhas: number;
  detalhes: { id: string; numero: string | null; ok: boolean; mensagem: string | null }[];
};

/**
 * Backfill: envia/atualiza no Salesforce todas as propostas já existentes.
 * Sequencial para não estourar os limites da API do Salesforce.
 */
export async function sincronizarPropostasSalesforceLote(
  opts: { organizacao?: string; somentePendentes?: boolean; limite?: number } = {},
): Promise<SalesforceLoteResultado> {
  const linhas = await db.listarPropostas({
    ...(opts.organizacao ? { organizacao: opts.organizacao } : {}),
    select: "*",
    limit: opts.limite ?? 2000,
  });
  const alvo = opts.somentePendentes
    ? linhas.filter((r) => !so((r as any)["sf_opp_id"]) || so((r as any)["sf_status"]) === "erro")
    : linhas;

  const detalhes: SalesforceLoteResultado["detalhes"] = [];
  let sincronizados = 0;
  for (const row of alvo) {
    const id = so((row as any)["id"]);
    if (!id) continue;
    const r = await sincronizarPedidoSalesforceSeguro(id);
    if (r.ok) sincronizados += 1;
    detalhes.push({ id, numero: so((row as any)["numero"]) || null, ok: r.ok, mensagem: r.mensagem });
  }
  return { total: alvo.length, sincronizados, falhas: alvo.length - sincronizados, detalhes };
}
