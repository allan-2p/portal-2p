/**
 * Força o número do portal no nome das oportunidades do Salesforce.
 *
 * O número do pedido do portal não tem campo próprio na org: ele vive no
 * `Opportunity.Name`, no padrão "número - nome do pedido". Oportunidades
 * importadas do sistema antigo (ou renomeadas à mão) ficaram com o nome fora
 * desse padrão, então o número exibido no Salesforce não bate com o do portal.
 *
 * Esta rotina compara o nome atual de cada oportunidade vinculada com o nome
 * esperado e regrava SÓ o campo `Name` (nada mais é tocado), em lotes.
 */

import * as db from "./propostas-db.server";
import { logIntegrationEvent } from "./integration-logs.server";
import { numeroExibicao } from "./proposta-variacoes";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";
const LOTE = 200;

/**
 * Oportunidades perdidas têm regra de validação na org que exige o campo
 * "Detalhamento (Motivo de Perda)" preenchido em qualquer alteração. Quando o
 * campo está vazio, até um update de `Name` é recusado. Nesses casos gravamos
 * este texto padrão junto com o nome (autorizado pelo usuário).
 */
const DETALHAMENTO_PERDA_PADRAO = "Oportunidade Mecanicamente Perdida";

const so = (v: unknown) => String(v ?? "").trim();

function secrets() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sfKey = process.env["SALESFORCE_API_KEY"];
  if (!lovableKey || !sfKey) return null;
  return { lovableKey, sfKey };
}

async function sf(path: string, init?: RequestInit): Promise<any> {
  const s = secrets();
  if (!s) throw new Error("Conector do Salesforce não está configurado.");
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
  if (!res.ok) throw new Error(`Salesforce ${res.status}: ${String(text).slice(0, 300)}`);
  return body;
}

/** Nome canônico da oportunidade: "número do portal - nome do pedido". */
export function nomeOportunidade(row: Record<string, any>): string {
  const numero = numeroExibicao(row as any) || so(row["numero"]);
  const nome = so(row["nome"]) || so(row["cliente_nome"]);
  return [numero, nome].filter(Boolean).join(" - ").slice(0, 120);
}

export type NumerosResultado = {
  total: number;
  corrigidos: number;
  jaCorretos: number;
  falhas: number;
  erros: { id: string; numero: string; mensagem: string }[];
  amostra: { numero: string; de: string; para: string }[];
};

/**
 * Percorre todas as propostas com oportunidade vinculada e garante que o nome
 * no Salesforce comece pelo número do portal.
 *
 * @param opts.dryRun apenas relata as divergências, sem gravar na org.
 * @param opts.limite teto de propostas analisadas (padrão: todas).
 */
export async function forcarNumerosSalesforce(
  opts: { dryRun?: boolean; limite?: number; organizacao?: string } = {},
): Promise<NumerosResultado> {
  const inicio = Date.now();
  const linhas = await db.listarPropostas({
    ...(opts.organizacao ? { organizacao: opts.organizacao } : {}),
    select: "id,numero,nome,cliente_nome,variacao_sufixo,variacao_grupo,variacao_favorita,sf_opp_id",
    naoVazio: ["sf_opp_id"],
    limit: opts.limite ?? 60000,
  });

  // Uma oportunidade por projeto: variações não favoritas não espelham na org.
  const alvo = linhas.filter((r: any) => {
    if (!so(r["sf_opp_id"])) return false;
    if (so(r["variacao_grupo"]) && r["variacao_favorita"] !== true) return false;
    return Boolean(so(r["numero"]));
  });

  const esperado = new Map<string, { row: any; nome: string }>();
  for (const r of alvo) esperado.set(so((r as any)["sf_opp_id"]), { row: r, nome: nomeOportunidade(r as any) });

  const res: NumerosResultado = {
    total: esperado.size,
    corrigidos: 0,
    jaCorretos: 0,
    falhas: 0,
    erros: [],
    amostra: [],
  };

  const ids = [...esperado.keys()];
  for (let i = 0; i < ids.length; i += LOTE) {
    const bloco = ids.slice(i, i + LOTE);
    // Nome atual na org (SOQL em lote) — evita PATCH desnecessário.
    let atuais = new Map<string, { nome: string; perdida: boolean; detalhe: string }>();
    try {
      const q = `SELECT Id, Name, IsClosed, IsWon, Descri_o_do_Motivo_de_Perda__c FROM Opportunity WHERE Id IN (${bloco.map((x) => `'${x}'`).join(",")})`;
      const r = await sf(`/query?q=${encodeURIComponent(q)}`);
      atuais = new Map(
        (r?.records ?? []).map((x: any) => [
          String(x.Id),
          {
            nome: String(x.Name ?? ""),
            perdida: x.IsClosed === true && x.IsWon !== true,
            detalhe: String(x.Descri_o_do_Motivo_de_Perda__c ?? "").trim(),
          },
        ]),
      );
    } catch (err) {
      res.falhas += bloco.length;
      res.erros.push({ id: bloco[0] ?? "", numero: "", mensagem: (err as Error).message });
      continue;
    }

    const paraGravar: { Id: string; Name: string; Descri_o_do_Motivo_de_Perda__c?: string }[] = [];
    for (const id of bloco) {
      const alvoNome = esperado.get(id)!.nome;
      const atual = atuais.get(id);
      if (atual === undefined) continue; // oportunidade apagada na org
      if (atual.nome === alvoNome) {
        res.jaCorretos += 1;
        continue;
      }
      paraGravar.push({
        Id: id,
        Name: alvoNome,
        // Regra de validação da org: perdida sem detalhamento bloqueia update.
        ...(atual.perdidaSemDetalhe
          ? { Descri_o_do_Motivo_de_Perda__c: DETALHAMENTO_PERDA_PADRAO }
          : {}),
      });
      if (res.amostra.length < 20)
        res.amostra.push({ numero: so(esperado.get(id)!.row["numero"]), de: atual.nome, para: alvoNome });
    }

    if (!paraGravar.length || opts.dryRun) {
      if (opts.dryRun) res.corrigidos += paraGravar.length;
      continue;
    }

    try {
      const body = {
        allOrNone: false,
        records: paraGravar.map((r) => ({ attributes: { type: "Opportunity" }, ...r })),
      };
      const r = await sf(`/composite/sobjects`, { method: "PATCH", body: JSON.stringify(body) });
      const lista = Array.isArray(r) ? r : [];
      if (lista.length === paraGravar.length) {
        lista.forEach((x: any, idx: number) => {
          if (x?.success) res.corrigidos += 1;
          else {
            res.falhas += 1;
            if (res.erros.length < 30)
              res.erros.push({
                id: paraGravar[idx]!.Id,
                numero: so(esperado.get(paraGravar[idx]!.Id)?.row["numero"]),
                mensagem: JSON.stringify(x?.errors ?? x).slice(0, 300),
              });
          }
        });
        continue;
      }
      throw new Error("Resposta inesperada do composite.");
    } catch {
      // Gateway sem /composite: cai para PATCH individual.
      for (const r of paraGravar) {
        try {
          const { Id, ...campos } = r;
          await sf(`/sobjects/Opportunity/${Id}`, { method: "PATCH", body: JSON.stringify(campos) });
          res.corrigidos += 1;
        } catch (err) {
          res.falhas += 1;
          if (res.erros.length < 30)
            res.erros.push({
              id: r.Id,
              numero: so(esperado.get(r.Id)?.row["numero"]),
              mensagem: (err as Error).message.slice(0, 300),
            });
        }
      }
    }
  }

  await logIntegrationEvent({
    slug: "salesforce",
    level: res.falhas ? "warn" : "info",
    event: "pedido.numero.forcar",
    message: `${res.corrigidos} oportunidade(s) renumerada(s), ${res.jaCorretos} já corretas, ${res.falhas} com erro.`,
    durationMs: Date.now() - inicio,
    detail: { total: res.total, dryRun: Boolean(opts.dryRun), amostra: res.amostra, erros: res.erros },
  });

  return res;
}
