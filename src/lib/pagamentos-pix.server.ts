/**
 * Recebimento e validação dos webhooks de Pix (Itaú).
 *
 * O Itaú/Bacen envia notificações quando uma cobrança Pix é liquidada,
 * expira, é removida ou devolvida. Aqui o payload é normalizado, validado
 * e aplicado na proposta/pedido correspondente:
 *
 *   pago      → Aguardando Pagamento → Processando
 *   expirado  → pedido segue em Aguardando Pagamento (cobrança pode ser reemitida)
 *   cancelado → pedido é cancelado (cobrança removida/devolvida)
 *
 * Nunca grave credenciais ou certificados nos logs.
 */

import * as db from "./propostas-db.server";

export type PixEventoTipo = "pago" | "expirado" | "cancelado" | "desconhecido";

export type PixEvento = {
  tipo: PixEventoTipo;
  txid: string;
  endToEndId: string | null;
  valor: number | null;
  horario: string | null;
  statusOriginal: string | null;
};

/** Status de cobrança (cob) do Bacen → evento interno. */
function statusParaTipo(status: string): PixEventoTipo {
  const s = status.trim().toUpperCase();
  if (["CONCLUIDA", "LIQUIDADA", "PAGA", "COBRANCA_LIQUIDADA"].includes(s)) return "pago";
  if (["EXPIRADA", "EXPIRADO", "ATIVA_EXPIRADA", "COBRANCA_EXPIRADA"].includes(s)) return "expirado";
  if (
    [
      "REMOVIDA_PELO_USUARIO_RECEBEDOR",
      "REMOVIDA_PELO_PSP",
      "CANCELADA",
      "CANCELADO",
      "DEVOLVIDA",
      "COBRANCA_CANCELADA",
    ].includes(s)
  ) {
    return "cancelado";
  }
  return "desconhecido";
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Normaliza os formatos aceitos:
 *  - { pix: [{ txid, endToEndId, valor, horario, devolucoes? }] }
 *  - { cob: { txid, status, valor: { original } } } | { cobranca: {...} }
 *  - { txid, status, valor }
 */
export function normalizarEventosPix(payload: Record<string, unknown>): PixEvento[] {
  const eventos: PixEvento[] = [];

  const lista = Array.isArray(payload["pix"]) ? (payload["pix"] as Record<string, unknown>[]) : [];
  for (const p of lista) {
    const devolvido =
      Array.isArray(p["devolucoes"]) &&
      (p["devolucoes"] as Record<string, unknown>[]).some(
        (d) => String((d as Record<string, unknown>)["status"] ?? "").toUpperCase() === "DEVOLVIDO",
      );
    const txid = str(p["txid"]);
    if (!txid) continue;
    eventos.push({
      tipo: devolvido ? "cancelado" : "pago",
      txid,
      endToEndId: str(p["endToEndId"]) ?? str(p["e2eid"]),
      valor: num(p["valor"]),
      horario: str(p["horario"]),
      statusOriginal: devolvido ? "DEVOLVIDO" : "PIX_RECEBIDO",
    });
  }

  const cobs: Record<string, unknown>[] = [];
  for (const chave of ["cob", "cobranca", "cobv", "cobrancas", "cobs"]) {
    const v = payload[chave];
    if (Array.isArray(v)) cobs.push(...(v as Record<string, unknown>[]));
    else if (v && typeof v === "object") cobs.push(v as Record<string, unknown>);
  }
  if (!cobs.length && str(payload["txid"]) && str(payload["status"])) {
    cobs.push(payload);
  }
  for (const c of cobs) {
    const txid = str(c["txid"]);
    const status = str(c["status"]);
    if (!txid || !status) continue;
    const valorObj = c["valor"];
    const valor =
      valorObj && typeof valorObj === "object"
        ? num((valorObj as Record<string, unknown>)["original"])
        : num(valorObj);
    eventos.push({
      tipo: statusParaTipo(status),
      txid,
      endToEndId: str(c["endToEndId"]),
      valor,
      horario: str(c["horario"]) ?? str(c["calendario"]),
      statusOriginal: status,
    });
  }

  return eventos;
}

export type PropostaLike = Record<string, any>;

/** Camada de IO do motor Pix — permite simulação sem escrever no banco. */
export type PixIO = {
  buscarPorTxid(txid: string): Promise<PropostaLike | null>;
  buscarPorNumero(numero: string): Promise<PropostaLike | null>;
  atualizar(id: string, patch: Record<string, unknown>): Promise<void>;
  log(entry: {
    proposta_id: string;
    numero: string | null;
    status: string;
    resultado: string;
    origem: string;
    detalhe: string;
  }): Promise<void>;
  /** Notifica o dono do pedido sobre a mudança de status do pagamento. */
  notificar?(entry: {
    tipo: "pago" | "expirado" | "cancelado";
    user_id: string;
    proposta_id: string;
    numero: string | null;
    cliente: string | null;
    txid: string;
    de: string;
    para: string;
  }): Promise<void>;
  /** Disparado quando o Pix é confirmado — cria a ordem de venda no SAP. */
  aoConfirmarPagamento?(propostaId: string): Promise<void>;
};

export const pixIOBanco: PixIO = {
  buscarPorTxid: (txid) => db.listarPropostasPorPagamentoTxid(txid) as Promise<PropostaLike | null>,
  buscarPorNumero: (numero) => db.getPropostaPorNumero(numero) as Promise<PropostaLike | null>,
  atualizar: (id, patch) => db.atualizarProposta(id, patch as any).then(() => undefined),
  log: (entry) => db.registrarConclusaoLog(entry as any),
  async notificar(entry) {
    const { criarNotificacao, montarNotificacaoPix } = await import("./notificacoes.server");
    await criarNotificacao(montarNotificacaoPix(entry));
  },
  async aoConfirmarPagamento(propostaId) {
    const { runJob } = await import("./job-runs.server");
    const { executorFor } = await import("./jobs-registry.server");
    await runJob(
      { job: "sap.ov-criar", trigger: "webhook", payload: { propostaId, origem: "pix-pago" } },
      () => executorFor("sap.ov-criar")({ propostaId }),
    );
  },
};

/**
 * IO em memória para simulação/testes: parte de uma cópia das propostas e
 * aplica os patches localmente, registrando cada escrita.
 */
export function criarPixIOSimulado(propostas: PropostaLike[]) {
  const rows = propostas.map((p) => ({ ...p }));
  const escritas: { proposta_id: string; patch: Record<string, unknown> }[] = [];
  const logs: Record<string, unknown>[] = [];
  const notificacoes: Record<string, unknown>[] = [];
  const io: PixIO = {
    async buscarPorTxid(txid) {
      return rows.find((r) => String(r["pagamento_txid"] ?? "") === txid) ?? null;
    },
    async buscarPorNumero(numero) {
      return rows.find((r) => String(r["numero"] ?? "") === numero) ?? null;
    },
    async atualizar(id, patch) {
      const row = rows.find((r) => r["id"] === id);
      if (row) Object.assign(row, patch);
      escritas.push({ proposta_id: id, patch });
    },
    async log(entry) {
      logs.push(entry);
    },
    async notificar(entry) {
      notificacoes.push(entry);
    },
  };
  return { io, rows, escritas, logs, notificacoes };
}


/** Localiza a proposta pelo txid gravado nela ou pelo nº embutido no txid. */
async function localizarProposta(txid: string, io: PixIO): Promise<PropostaLike | null> {
  const porTxid = await io.buscarPorTxid(txid);
  if (porTxid) return porTxid;
  const numero = (txid.match(/\d{6}/) ?? [])[0];
  if (numero) return await io.buscarPorNumero(numero);
  return null;
}

export type PixAplicacao = {
  txid: string;
  tipo: PixEventoTipo;
  proposta_id?: string;
  numero?: string | null;
  de?: string;
  para?: string;
  skipped?: boolean;
  motivo?: string;
};

/** Aplica um evento na proposta, de forma idempotente. */
export async function aplicarEventoPix(ev: PixEvento, io: PixIO = pixIOBanco): Promise<PixAplicacao> {
  const base = { txid: ev.txid, tipo: ev.tipo };

  if (ev.tipo === "desconhecido") {
    return { ...base, skipped: true, motivo: `Status Pix não tratado: ${ev.statusOriginal ?? "-"}` };
  }

  const proposta = await localizarProposta(ev.txid, io);
  if (!proposta) {
    return { ...base, skipped: true, motivo: "Nenhum pedido encontrado para este txid." };
  }

  const de = String(proposta["status"] ?? "Salvo");
  const pagamentoAtual = String(proposta["pagamento_status"] ?? "");

  // Idempotência: mesmo evento reenviado pelo PSP não reprocessa.
  if (pagamentoAtual === ev.tipo && (ev.tipo !== "pago" || proposta["pagamento_e2eid"] === ev.endToEndId)) {
    return { ...base, proposta_id: proposta["id"], numero: proposta["numero"], de, skipped: true, motivo: "Evento já aplicado." };
  }
  if (pagamentoAtual === "pago" && ev.tipo !== "cancelado") {
    return { ...base, proposta_id: proposta["id"], numero: proposta["numero"], de, skipped: true, motivo: "Pedido já está pago." };
  }

  // Conferência de valor: o Pix pago precisa bater com o valor da cobrança
  // (tolerância de R$ 0,02 para arredondamento do PSP). Divergência não é
  // aplicada automaticamente — fica registrada para o financeiro conferir.
  const esperado = Number(proposta["pagamento_valor"] ?? 0);
  if (ev.tipo === "pago" && esperado > 0 && ev.valor != null && Math.abs(ev.valor - esperado) > 0.02) {
    await io.log({
      proposta_id: proposta["id"],
      numero: proposta["numero"] ?? null,
      status: de,
      resultado: "pix:valor_divergente",
      origem: "webhook-pix",
      detalhe: `txid ${ev.txid} • recebido R$ ${ev.valor.toFixed(2)} ≠ esperado R$ ${esperado.toFixed(2)}`,
    });
    return {
      ...base,
      proposta_id: proposta["id"],
      numero: proposta["numero"] ?? null,
      de,
      skipped: true,
      motivo: `Valor pago (R$ ${ev.valor.toFixed(2)}) diferente do valor da cobrança (R$ ${esperado.toFixed(2)}).`,
    };
  }

  const patch: Record<string, unknown> = {
    pagamento_meio: "pix",
    pagamento_status: ev.tipo,
    pagamento_txid: ev.txid,
    pagamento_e2eid: ev.endToEndId,
    pagamento_valor: ev.valor,
    pagamento_atualizado_em: new Date().toISOString(),
  };

  let para = de;
  if (ev.tipo === "pago") {
    patch["pago_em"] = ev.horario ?? new Date().toISOString();
    if (de === "Aguardando Pagamento") para = "Processando";
  } else if (ev.tipo === "cancelado") {
    if (de !== "Entregue" && de !== "Cancelado") para = "Cancelado";
  }
  // expirado: pedido permanece em Aguardando Pagamento para reemissão da cobrança.

  if (para !== de) patch["status"] = para;

  await io.atualizar(proposta["id"], patch);

  // Pix confirmado → só agora a ordem de venda é criada no SAP (regra legada).
  if (ev.tipo === "pago" && io.aoConfirmarPagamento) {
    try {
      await io.aoConfirmarPagamento(String(proposta["id"]));
    } catch {
      // a OV falha é registrada no job_runs; nunca quebra o webhook
    }
  }
  await io.log({
    proposta_id: proposta["id"],
    numero: proposta["numero"] ?? null,
    status: para,
    resultado: `pix:${ev.tipo}`,
    origem: "webhook-pix",
    detalhe: `txid ${ev.txid}${ev.endToEndId ? ` • e2e ${ev.endToEndId}` : ""} • ${de} → ${para}`,
  });

  // Notificação para o dono do pedido (pago / expirado / cancelado).
  const dono = proposta["created_by"] ? String(proposta["created_by"]) : null;
  if (dono && io.notificar) {
    try {
      await io.notificar({
        tipo: ev.tipo,
        user_id: dono,
        proposta_id: String(proposta["id"]),
        numero: (proposta["numero"] ?? null) as string | null,
        cliente: (proposta["cliente_nome"] ?? null) as string | null,
        txid: ev.txid,
        de,
        para,
      });
    } catch {
      // notificação nunca deve quebrar o processamento do webhook
    }
  }

  return { ...base, proposta_id: proposta["id"], numero: proposta["numero"] ?? null, de, para };

}

export type PixResultado = {
  recebidos: number;
  atualizados?: number;
  detalhes?: PixAplicacao[];
  skipped?: boolean;
  motivo?: string;
};

/** Processa o payload completo do webhook. */
export async function processarWebhookPix(
  payload: Record<string, unknown>,
  io: PixIO = pixIOBanco,
): Promise<PixResultado> {
  const eventos = normalizarEventosPix(payload);
  if (!eventos.length) {
    return { skipped: true, motivo: "Payload sem eventos Pix reconhecíveis.", recebidos: 0 };
  }
  const aplicados: PixAplicacao[] = [];
  for (const ev of eventos) aplicados.push(await aplicarEventoPix(ev, io));
  const atualizados = aplicados.filter((a) => !a.skipped);
  return {
    recebidos: eventos.length,
    atualizados: atualizados.length,
    detalhes: aplicados,
    skipped: atualizados.length === 0,
    ...(atualizados.length === 0 ? { motivo: aplicados[0]?.motivo ?? "Nenhum pedido atualizado." } : {}),
  };
}

export type PixSimulacao = {
  repeticoes: number;
  escritas: number;
  idempotente: boolean;
  rodadas: { rodada: number; resultado: PixResultado; escritasNaRodada: number }[];
  estadoFinal: { id: string; numero: string | null; status: string; pagamento_status: string | null }[];
  logs: number;
};

/**
 * Modo simulação: reprocessa o MESMO payload N vezes em memória (nada é
 * gravado) e verifica que só a primeira rodada altera o pedido.
 */
export async function simularWebhookPix(
  payload: Record<string, unknown>,
  propostas: PropostaLike[],
  repeticoes = 3,
): Promise<PixSimulacao> {
  const n = Math.min(Math.max(repeticoes, 1), 20);
  const { io, rows, escritas, logs } = criarPixIOSimulado(propostas);
  const rodadas: PixSimulacao["rodadas"] = [];
  for (let i = 1; i <= n; i++) {
    const antes = escritas.length;
    const resultado = await processarWebhookPix(payload, io);
    rodadas.push({ rodada: i, resultado, escritasNaRodada: escritas.length - antes });
  }
  const depoisDaPrimeira = rodadas.slice(1).reduce((acc, r) => acc + r.escritasNaRodada, 0);
  return {
    repeticoes: n,
    escritas: escritas.length,
    idempotente: depoisDaPrimeira === 0,
    rodadas,
    logs: logs.length,
    estadoFinal: rows.map((r) => ({
      id: String(r["id"]),
      numero: (r["numero"] ?? null) as string | null,
      status: String(r["status"] ?? ""),
      pagamento_status: (r["pagamento_status"] ?? null) as string | null,
    })),
  };
}
