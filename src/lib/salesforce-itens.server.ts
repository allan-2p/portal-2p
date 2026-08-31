/**
 * Produtos da oportunidade no Salesforce (OpportunityLineItem).
 *
 * A aba "Products" da oportunidade só é preenchida com linhas de
 * `OpportunityLineItem`, que exigem um `PricebookEntry` do catálogo ativo. O
 * vínculo é feito pelo `ProductCode` do Salesforce = código SAP do item.
 *
 * Item sem produto cadastrado (ou sem entrada no catálogo de preços) NÃO
 * derruba o envio: fica registrado em `integration_logs` e aparece no painel
 * do administrador como "produto sem cadastro no Salesforce".
 */

import { logIntegrationEvent } from "./integration-logs.server";
import { listarItensProposta, linhasDaProposta, type PropostaItemRow } from "./proposta-itens.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";
const so = (v: unknown) => String(v ?? "").trim();
const esc = (v: string) => String(v).replace(/'/g, "\\'");

async function sf(path: string, init?: RequestInit): Promise<any> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sfKey = process.env["SALESFORCE_API_KEY"];
  if (!lovableKey || !sfKey) throw new Error("Conector do Salesforce não está configurado.");
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
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = typeof body === "object" ? JSON.stringify(body) : String(body);
    throw new Error(`Salesforce ${res.status}: ${String(msg).slice(0, 400)}`);
  }
  return body;
}

export type SyncItensResultado = {
  ok: boolean;
  enviados: number;
  semCadastro: string[];
  mensagem: string | null;
};

/** PricebookEntry ativa por código SAP, preferindo o catálogo já usado na oportunidade. */
async function entradasDeCatalogo(codigos: string[], pricebookId: string | null) {
  const lista = codigos.map((c) => `'${esc(c)}'`).join(",");
  const q =
    `SELECT Id, UnitPrice, Pricebook2Id, Pricebook2.IsStandard, Product2.ProductCode ` +
    `FROM PricebookEntry WHERE IsActive = true AND Product2.ProductCode IN (${lista})`;
  const r = await sf(`/query?q=${encodeURIComponent(q)}`);
  const registros: any[] = r?.records ?? [];
  const porCodigo = new Map<string, any>();
  for (const reg of registros) {
    const cod = so(reg?.Product2?.ProductCode);
    if (!cod) continue;
    const atual = porCodigo.get(cod);
    const prioridade = (x: any) =>
      pricebookId && so(x?.Pricebook2Id) === pricebookId ? 2 : x?.Pricebook2?.IsStandard ? 1 : 0;
    if (!atual || prioridade(reg) > prioridade(atual)) porCodigo.set(cod, reg);
  }
  return porCodigo;
}

/**
 * Regrava as linhas de produto da oportunidade a partir dos itens da proposta.
 * Nunca lança: devolve o resultado para o chamador registrar.
 */
export async function sincronizarItensOportunidade(
  propostaId: string,
  oppId: string,
  row: Record<string, any>,
): Promise<SyncItensResultado> {
  const numero = so(row["numero"]);
  const base = { slug: "salesforce", event: "pedido.produtos" } as const;
  try {
    let itens: PropostaItemRow[] = await listarItensProposta(propostaId);
    // Espelho ainda não gravado (proposta antiga): usa o JSON da proposta.
    if (!itens.length) itens = linhasDaProposta(row);
    const validos = itens.filter((i) => so(i.codigo_sap) && Number(i.quantidade) > 0);
    const semCadastro: string[] = itens.filter((i) => !so(i.codigo_sap)).map((i) => i.nome || "item sem nome");

    if (!validos.length) {
      if (semCadastro.length) {
        await logIntegrationEvent({
          ...base,
          level: "warn",
          message: `Pedido ${numero}: nenhum item com código SAP para vincular aos produtos do Salesforce.`,
          detail: { proposta_id: propostaId, opportunity_id: oppId, itens: semCadastro },
        });
      }
      return { ok: true, enviados: 0, semCadastro, mensagem: null };
    }

    // Catálogo atual da oportunidade (a linha precisa ser do mesmo catálogo).
    const opp = await sf(`/sobjects/Opportunity/${oppId}?fields=Id,Pricebook2Id`);
    let pricebookId: string | null = so(opp?.Pricebook2Id) || null;

    const codigos = [...new Set(validos.map((i) => so(i.codigo_sap)))];
    const entradas = await entradasDeCatalogo(codigos, pricebookId);

    const usaveis = validos.filter((i) => entradas.has(so(i.codigo_sap)));
    for (const i of validos) {
      if (!entradas.has(so(i.codigo_sap))) semCadastro.push(`${so(i.codigo_sap)} — ${i.nome}`);
    }
    if (!usaveis.length) {
      await logIntegrationEvent({
        ...base,
        level: "warn",
        message: `Pedido ${numero}: nenhum produto do pedido tem cadastro no catálogo de preços do Salesforce.`,
        detail: { proposta_id: propostaId, opportunity_id: oppId, codigos, itens: semCadastro },
      });
      return { ok: true, enviados: 0, semCadastro, mensagem: "Produtos sem cadastro no Salesforce." };
    }

    // Todas as linhas precisam sair do mesmo catálogo: usa o da primeira entrada.
    const catalogoAlvo = so(entradas.get(so(usaveis[0]!.codigo_sap))?.Pricebook2Id);
    if (!pricebookId) {
      await sf(`/sobjects/Opportunity/${oppId}`, {
        method: "PATCH",
        body: JSON.stringify({ Pricebook2Id: catalogoAlvo }),
      });
      pricebookId = catalogoAlvo;
    }
    const doCatalogo = usaveis.filter((i) => so(entradas.get(so(i.codigo_sap))?.Pricebook2Id) === pricebookId);
    for (const i of usaveis) {
      if (!doCatalogo.includes(i)) semCadastro.push(`${so(i.codigo_sap)} — fora do catálogo da oportunidade`);
    }
    if (!doCatalogo.length) {
      return { ok: true, enviados: 0, semCadastro, mensagem: "Produtos fora do catálogo da oportunidade." };
    }

    // Idempotente: remove as linhas atuais antes de regravar.
    const atuais = await sf(
      `/query?q=${encodeURIComponent(`SELECT Id FROM OpportunityLineItem WHERE OpportunityId = '${esc(oppId)}'`)}`,
    );
    for (const reg of atuais?.records ?? []) {
      await sf(`/sobjects/OpportunityLineItem/${reg.Id}`, { method: "DELETE" });
    }

    let enviados = 0;
    for (const i of doCatalogo) {
      const entrada = entradas.get(so(i.codigo_sap));
      const unit = Number(i.valor_unitario) || 0;
      const corpo: Record<string, unknown> = {
        OpportunityId: oppId,
        PricebookEntryId: entrada.Id,
        Quantity: Number(i.quantidade) || 1,
        UnitPrice: unit,
        Description: [so(i.codigo_sap), i.nome].filter(Boolean).join(" — ").slice(0, 255),
      };
      try {
        await sf(`/sobjects/OpportunityLineItem`, { method: "POST", body: JSON.stringify(corpo) });
        enviados += 1;
      } catch (e) {
        semCadastro.push(`${so(i.codigo_sap)} — ${(e as Error).message.slice(0, 160)}`);
      }
    }

    await logIntegrationEvent({
      ...base,
      level: semCadastro.length ? "warn" : "info",
      message: semCadastro.length
        ? `Pedido ${numero}: ${enviados} produto(s) enviados ao Salesforce, ${semCadastro.length} pendente(s) de cadastro.`
        : `Pedido ${numero}: ${enviados} produto(s) enviados ao Salesforce.`,
      detail: { proposta_id: propostaId, opportunity_id: oppId, enviados, pendentes: semCadastro },
    });
    return { ok: true, enviados, semCadastro, mensagem: null };
  } catch (e) {
    const mensagem = (e as Error).message.slice(0, 400);
    await logIntegrationEvent({
      ...base,
      level: "error",
      message: `Pedido ${numero}: falha ao enviar os produtos ao Salesforce — ${mensagem}`,
      detail: { proposta_id: propostaId, opportunity_id: oppId },
    });
    return { ok: false, enviados: 0, semCadastro: [], mensagem };
  }
}
