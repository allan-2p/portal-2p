/**
 * Itens da proposta linha a linha (`public.proposta_itens` no banco do Grupo 2P).
 *
 * O JSON `itens` da proposta continua sendo a fonte de verdade do checkout;
 * esta tabela é o espelho analítico usado por relatórios e pela integração de
 * produtos com o Salesforce (OpportunityLineItem). A gravação acontece em todo
 * salvamento da proposta (ver `propostas-db.server.ts`), não só no backfill.
 */

import { formatSapNumero } from "@/lib/sap-numero";
import { grupo2pRest } from "./grupo2p-db.server";
import { logIntegrationEvent } from "./integration-logs.server";

const so = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type PropostaItemRow = {
  proposta_id: string;
  organizacao: string;
  numero: string | null;
  numero_sap: string | null;
  sf_opp_id: string | null;
  ordem: number;
  codigo_sap: string | null;
  nome: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  tabela_preco: string | null;
  valor_manual: boolean;
  extra: boolean;
};

/** Converte o JSON `itens` da proposta nas linhas da tabela. */
export function linhasDaProposta(row: Record<string, any>): PropostaItemRow[] {
  const itens = Array.isArray(row["itens"]) ? (row["itens"] as any[]) : [];
  const totais = (row["totais"] ?? {}) as Record<string, any>;
  const tabela =
    so(row["tabela_preco"]) ||
    so(totais["listaPreco"]) ||
    so(totais["tabelaPreco"]) ||
    so(row["sfo_tabela_de_preco_nome__c"]) ||
    "";
  return itens
    .map((it, idx) => {
      const qtd = num(it?.qtd ?? it?.quantidade);
      const unit = num(it?.valor ?? it?.valorUnitario);
      return {
        proposta_id: so(row["id"]),
        organizacao: so(row["organizacao"]) || "solar",
        numero: so(row["numero"]) || null,
        numero_sap: formatSapNumero(row["sap_ov_numero"]) || formatSapNumero(row["numero_sap"]) || null,
        sf_opp_id: so(row["sf_opp_id"]) || null,
        ordem: idx,
        codigo_sap: so(it?.codigo) || null,
        nome: so(it?.nome),
        quantidade: qtd,
        // O JSON nem sempre traz `total` (itens travados/extras): calcula.
        valor_total: num(it?.total) || qtd * unit,
        valor_unitario: unit,
        tabela_preco: tabela || null,
        valor_manual: Boolean(it?.valorManual),
        extra: Boolean(it?.extra),
      };
    })
    .filter((l) => l.quantidade > 0 || l.valor_total > 0);
}

async function rest(path: string, init: RequestInit & { prefer?: string } = {}) {
  const { ok, status, text } = await grupo2pRest(path, init);
  if (!ok) throw new Error(`proposta_itens (${status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/**
 * Regrava os itens da proposta (idempotente: apaga e insere). Nunca lança —
 * problema de espelho não pode derrubar o salvamento do pedido; as lacunas
 * (item sem código SAP) ficam no painel do administrador.
 */
export async function espelharItensProposta(row: Record<string, any>): Promise<{ itens: number; lacunas: number }> {
  const id = so(row["id"]);
  if (!id) return { itens: 0, lacunas: 0 };
  const linhas = linhasDaProposta(row);
  let lacunas = 0;
  try {
    await rest(`proposta_itens?proposta_id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
    if (linhas.length) {
      await rest(`proposta_itens`, {
        method: "POST",
        body: JSON.stringify(linhas),
        prefer: "return=minimal",
      });
    }
    const semCodigo = linhas.filter((l) => !l.codigo_sap);
    lacunas = semCodigo.length;
    if (semCodigo.length) {
      await logIntegrationEvent({
        slug: "proposta-itens",
        event: "item.sem_codigo",
        level: "warn",
        message: `Proposta ${so(row["numero"]) || "s/nº"}: ${semCodigo.length} item(ns) sem código SAP — não serão vinculados aos produtos do Salesforce.`,
        detail: { proposta_id: id, numero: so(row["numero"]) || null, itens: semCodigo.map((l) => l.nome) },
      });
    }
  } catch (e) {
    await logIntegrationEvent({
      slug: "proposta-itens",
      event: "espelho.erro",
      level: "error",
      message: `Não foi possível gravar os itens da proposta ${so(row["numero"]) || id}: ${(e as Error).message.slice(0, 300)}`,
      detail: { proposta_id: id },
    });
  }
  return { itens: linhas.length, lacunas };
}

/** Itens já espelhados da proposta (usado pela integração do Salesforce). */
export async function listarItensProposta(propostaId: string): Promise<PropostaItemRow[]> {
  try {
    const params = new URLSearchParams({
      select: "*",
      proposta_id: `eq.${propostaId}`,
      order: "ordem.asc",
    });
    return (await rest(`proposta_itens?${params}`)) ?? [];
  } catch {
    return [];
  }
}
