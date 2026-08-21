/**
 * Oferta de carga da Fretefy (B.2).
 *
 * Fluxo:
 *  - Após a OV ser criada no SAP e o frete ser da 2P (CIF/DEDICADO), cria a
 *    oferta direcionada à transportadora escolhida na cotação e grava o id em
 *    propostas.fretefy_oferta_id (idempotente).
 *  - Quando o pedido fatura (motor de NFs), atualiza o documento da carga com
 *    a NF real (chave/série/número).
 *
 * Tudo best effort: falha aqui nunca desfaz a OV nem trava o avanço de status.
 */

import * as db from "./propostas-db.server";
import { logIntegrationEvent } from "./integration-logs.server";
import { fretefyConfigurado, fretefyRequest } from "./fretefy-client.server";
import {
  deveCriarOferta,
  montarAtualizacaoDocumento,
  montarOfertaCarga,
  type Endereco,
} from "./fretefy-oferta";

export type OfertaResultado = {
  ok: boolean;
  ofertaId?: string | null;
  skipped?: boolean;
  motivo?: string;
  status?: number;
};

const SELECT =
  "id,numero,nome,cliente_nome,cliente_doc,entrega,frete_mod,frete_valor,transportadora_id,itens,totais,sap_ov_numero,fretefy_oferta_id,nf_numero,nf_serie,nf_chave";

/**
 * Endereço de entrega do pedido. Se o pedido não tiver entrega preenchida,
 * cai para o endereço cadastrado do cliente (nunca envia destino vazio).
 */
async function enderecoDaProposta(row: Record<string, any>): Promise<Endereco> {
  const e = (row["entrega"] ?? {}) as Record<string, any>;
  if (String(e["cidade"] ?? "").trim() && String(e["uf"] ?? "").trim()) {
    return {
      logradouro: e["logradouro"] ?? null,
      numero: e["numero"] ?? null,
      complemento: e["complemento"] ?? null,
      cidade: e["cidade"] ?? null,
      uf: e["uf"] ?? null,
    };
  }
  try {
    const { findClienteByDoc } = await import("./clientes-db.server");
    const achado = await findClienteByDoc(String(row["cliente_doc"] ?? ""));
    const c = (achado as any)?.cliente ?? achado ?? null;
    if (c)
      return {
        logradouro: c["logradouro"] ?? null,
        numero: c["numero"] ?? null,
        complemento: c["complemento"] ?? null,
        cidade: c["cidade"] ?? null,
        uf: c["uf"] ?? null,
      };
  } catch {
    /* sem cadastro: segue com o que o pedido tem */
  }
  return {
    logradouro: e["logradouro"] ?? null,
    numero: e["numero"] ?? null,
    complemento: e["complemento"] ?? null,
    cidade: e["cidade"] ?? null,
    uf: row["uf"] ?? null,
  };
}


/** Peso bruto total do pedido, pela mesma simulação do SAP usada na cotação. */
async function pesoDoPedido(itens: any[]): Promise<number> {
  try {
    const { simularPrecosSap } = await import("./sap-precos.server");
    const mapa = await simularPrecosSap(
      itens.map((i) => ({ codigo: String(i?.codigo ?? ""), quantidade: Number(i?.qtd ?? 0) })),
    );
    let bruto = 0;
    for (const i of itens) {
      const v = mapa.get(String(i?.codigo ?? "").replace(/^0+/, ""));
      if (v) bruto += v.pesoBruto || v.pesoLiquido || 0;
    }
    return Math.round(bruto * 1000) / 1000;
  } catch {
    return 0;
  }
}

/** Grava o id da oferta sem derrubar o fluxo caso a coluna não exista. */
async function gravarOfertaId(id: string, ofertaId: string) {
  try {
    await db.atualizarProposta(id, { fretefy_oferta_id: ofertaId });
  } catch (e) {
    if (!/42703|PGRST204/i.test((e as Error).message)) throw e;
    await logIntegrationEvent({
      slug: "fretefy.oferta-carga",
      level: "warn",
      event: "coluna-ausente",
      message: `Coluna propostas.fretefy_oferta_id ausente: ${(e as Error).message}`.slice(0, 500),
      detail: { proposta_id: id, oferta_id: ofertaId },
    });
  }
}

function extrairId(json: unknown): string | null {
  if (!json) return null;
  if (typeof json === "string") return json.trim() || null;
  const o = json as Record<string, any>;
  const v = o["id"] ?? o["Id"] ?? o["ofertaId"] ?? o["ofertaCargaId"] ?? o["data"]?.["id"];
  return v ? String(v) : null;
}

export async function criarOfertaCarga(
  propostaId: string,
  opts: { forcar?: boolean } = {},
): Promise<OfertaResultado> {
  const base = { slug: "fretefy", event: "oferta-carga" } as const;
  if (!fretefyConfigurado())
    return { ok: false, skipped: true, motivo: "FRETEFY_TOKEN não configurado." };

  const row = await db.getProposta(propostaId, SELECT);
  if (!row) return { ok: false, skipped: true, motivo: "Proposta não encontrada." };

  if (!deveCriarOferta(row["frete_mod"]))
    return { ok: true, skipped: true, motivo: `Frete ${row["frete_mod"] ?? "—"}: sem oferta de carga.` };

  const sapOv = String(row["sap_ov_numero"] ?? "").trim();
  if (!sapOv) return { ok: false, skipped: true, motivo: "Pedido ainda sem ordem de venda no SAP." };

  const jaCriada = String(row["fretefy_oferta_id"] ?? "").trim();
  if (jaCriada && !opts.forcar)
    return { ok: true, skipped: true, motivo: "Oferta de carga já criada.", ofertaId: jaCriada };

  const transportadoraId = String(row["transportadora_id"] ?? "").trim();
  if (!transportadoraId || transportadoraId === "dedicado")
    return {
      ok: false,
      skipped: true,
      motivo: "Pedido sem transportadora da cotação Fretefy (frete dedicado/manual).",
    };

  const itens = Array.isArray(row["itens"]) ? (row["itens"] as any[]) : [];
  const totais = (row["totais"] ?? {}) as Record<string, any>;
  const peso = await pesoDoPedido(itens);
  const payload = montarOfertaCarga({
    numero: String(row["numero"] ?? ""),
    nomeProjeto: String(row["nome"] ?? ""),
    sapOvNumero: sapOv,
    clienteNome: String(row["cliente_nome"] ?? ""),
    clienteDoc: String(row["cliente_doc"] ?? ""),
    entrega: enderecoDaProposta(row),
    pesoTotal: peso,
    valorCarga: Number(totais["valor"] ?? totais["valorTotal"] ?? 0),
    freteValor: Number(row["frete_valor"] ?? 0),
    transportadoraId,
  });

  const res = await fretefyRequest("POST", "ofertacarga", payload);
  const ofertaId = extrairId(res.json);
  if (!res.ok || !ofertaId) {
    const mensagem = `Fretefy recusou a oferta de carga (HTTP ${res.status}): ${res.response
      .replace(/\s+/g, " ")
      .slice(0, 300)}`;
    await logIntegrationEvent({
      ...base,
      level: "error",
      message: mensagem.slice(0, 500),
      detail: { proposta_id: propostaId, numero: row["numero"] ?? null, sap_ov: sapOv },
      durationMs: res.durationMs,
    });
    throw new Error(mensagem);
  }

  await gravarOfertaId(propostaId, ofertaId);
  await logIntegrationEvent({
    ...base,
    level: "info",
    message: `Oferta de carga ${ofertaId} criada para o pedido ${row["numero"] ?? ""}`.trim(),
    detail: { proposta_id: propostaId, oferta_id: ofertaId, sap_ov: sapOv, peso },
    durationMs: res.durationMs,
  });
  return { ok: true, ofertaId, status: res.status };
}

/**
 * Troca o documento placeholder da carga pela NF real (chamado no faturamento).
 */
export async function atualizarDocumentoOferta(
  propostaId: string,
  dados?: { nfNumero?: string | null; nfSerie?: string | null; nfChave?: string | null; dhEmissao?: string | null },
): Promise<OfertaResultado> {
  const base = { slug: "fretefy", event: "oferta-documento" } as const;
  if (!fretefyConfigurado())
    return { ok: false, skipped: true, motivo: "FRETEFY_TOKEN não configurado." };

  const row = await db.getProposta(propostaId, SELECT);
  if (!row) return { ok: false, skipped: true, motivo: "Proposta não encontrada." };

  const ofertaId = String(row["fretefy_oferta_id"] ?? "").trim();
  if (!ofertaId) return { ok: true, skipped: true, motivo: "Pedido sem oferta de carga na Fretefy." };

  const nfChave = String(dados?.nfChave ?? row["nf_chave"] ?? "").trim();
  const nfNumero = String(dados?.nfNumero ?? row["nf_numero"] ?? "").trim();
  const nfSerie = String(dados?.nfSerie ?? row["nf_serie"] ?? "").trim();
  if (!nfChave || !nfNumero)
    return { ok: true, skipped: true, motivo: "Pedido ainda sem NF (chave/número)." };

  const atual = await fretefyRequest("GET", `ofertacarga/${ofertaId}`);
  if (!atual.ok)
    throw new Error(
      `Não foi possível consultar a oferta ${ofertaId} na Fretefy (HTTP ${atual.status}).`,
    );
  const destino = (atual.json as Record<string, any> | null)?.["destino"] ?? {};
  const destinoId = String(destino?.["id"] ?? "");
  const documentoId = String(destino?.["documentos"]?.[0]?.["id"] ?? "");
  if (!destinoId || !documentoId)
    throw new Error(`Oferta ${ofertaId} sem destino/documento para atualizar.`);

  const itens = Array.isArray(row["itens"]) ? (row["itens"] as any[]) : [];
  const totais = (row["totais"] ?? {}) as Record<string, any>;
  const payload = montarAtualizacaoDocumento({
    destinoId,
    documentoId,
    entrega: enderecoDaProposta(row),
    clienteNome: String(row["cliente_nome"] ?? ""),
    clienteDoc: String(row["cliente_doc"] ?? ""),
    sapOvNumero: String(row["sap_ov_numero"] ?? ""),
    nfChave,
    nfSerie: nfSerie || "001",
    nfNumero,
    dhEmissao: dados?.dhEmissao ?? new Date().toISOString(),
    pesoTotal: await pesoDoPedido(itens),
    quantidade: itens.reduce((s, i) => s + Number(i?.qtd ?? 0), 0) || 1,
    valorTotal: Number(totais["valorTotal"] ?? totais["valor"] ?? 0),
  });

  const res = await fretefyRequest("PUT", `ofertacarga/${ofertaId}/documentos`, payload);
  if (!res.ok) {
    const mensagem = `Fretefy recusou a atualização do documento (HTTP ${res.status}): ${res.response
      .replace(/\s+/g, " ")
      .slice(0, 300)}`;
    await logIntegrationEvent({
      ...base,
      level: "error",
      message: mensagem.slice(0, 500),
      detail: { proposta_id: propostaId, oferta_id: ofertaId },
      durationMs: res.durationMs,
    });
    throw new Error(mensagem);
  }

  await logIntegrationEvent({
    ...base,
    level: "info",
    message: `NF ${nfNumero}/${nfSerie} enviada à carga ${ofertaId}`,
    detail: { proposta_id: propostaId, oferta_id: ofertaId, nf_chave: nfChave },
    durationMs: res.durationMs,
  });
  return { ok: true, ofertaId, status: res.status };
}
