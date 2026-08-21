/**
 * Interpretação do payload de rastreio da Fretefy (parte pura, testável).
 *
 * A Fretefy não publica um contrato único de webhook: cada integração envia o
 * evento com nomes de campo diferentes (`evento`, `status`, `ocorrencia`,
 * `situacao`, `tipo`) e às vezes aninhado em `dados`/`data`/`tracking`. Aqui
 * normalizamos qualquer uma dessas formas para o que o portal precisa:
 * o número do pedido, o tipo do evento e a data/hora.
 */

export type FretefyEventoTipo = "entregue" | "coletado" | "em_transito" | "ocorrencia" | "desconhecido";

export type FretefyEvento = {
  pedido: string | null;
  tipo: FretefyEventoTipo;
  descricao: string | null;
  ocorridoEm: string | null;
  /** Identificador do evento no Fretefy — usado para idempotência. */
  eventoId: string | null;
};

const str = (v: unknown) => (v == null ? "" : String(v)).trim();

/** Procura a primeira chave existente (case-insensitive) em objetos aninhados. */
function pick(payload: Record<string, unknown>, chaves: string[]): unknown {
  const alvos = chaves.map((c) => c.toLowerCase());
  const visitar = (obj: unknown, profundidade: number): unknown => {
    if (!obj || typeof obj !== "object" || profundidade > 4) return undefined;
    const entradas = Array.isArray(obj) ? obj.map((v, i) => [String(i), v] as const) : Object.entries(obj);
    for (const [k, v] of entradas) {
      if (alvos.includes(k.toLowerCase()) && (typeof v === "string" || typeof v === "number")) return v;
    }
    for (const [, v] of entradas) {
      const achado = visitar(v, profundidade + 1);
      if (achado !== undefined) return achado;
    }
    return undefined;
  };
  return visitar(payload, 0);
}

const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function classificarEventoFretefy(texto: string): FretefyEventoTipo {
  const s = norm(texto);
  if (!s) return "desconhecido";
  if (/(nao|sem|falha|insucesso|tentativa)\s+(de\s+)?entreg/.test(s)) return "ocorrencia";
  // "saiu para entrega" / "em rota de entrega" ainda NÃO é entrega concluída.
  if (/saiu para|em rota|a caminho|previsao de entreg|rota de entreg/.test(s)) return "em_transito";
  if (/entreg|delivered|comprovante|canhoto|pod\b/.test(s)) return "entregue";

  if (/coleta|coletad|collected|retirad|embarcad|expedid/.test(s)) return "coletado";
  if (/transito|transit|saiu para|em rota|a caminho|transferencia/.test(s)) return "em_transito";
  if (/ocorrenc|avaria|extravio|devolu|recusa|atraso|problema/.test(s)) return "ocorrencia";
  return "desconhecido";
}

export function interpretarEventoFretefy(payload: Record<string, unknown>): FretefyEvento {
  const pedido =
    str(pick(payload, ["pedido", "numero", "numeroPedido", "numero_pedido", "nroped", "documento", "pedidoCliente"])) ||
    null;

  const bruto = [
    pick(payload, ["evento", "event", "tipoEvento", "tipo_evento"]),
    pick(payload, ["status", "situacao", "statusEntrega", "status_entrega"]),
    pick(payload, ["ocorrencia", "descricao", "descricaoOcorrencia", "mensagem", "message"]),
  ]
    .map((v) => str(v))
    .filter(Boolean);

  let tipo: FretefyEventoTipo = "desconhecido";
  for (const t of bruto) {
    tipo = classificarEventoFretefy(t);
    if (tipo !== "desconhecido") break;
  }

  const data = str(
    pick(payload, ["dataEntrega", "data_entrega", "dataEvento", "data_evento", "data", "dataHora", "occurredAt", "timestamp"]),
  );
  const ocorridoEm = data && !Number.isNaN(Date.parse(data)) ? new Date(data).toISOString() : null;

  const eventoId = str(pick(payload, ["idEvento", "id_evento", "eventId", "protocolo", "id"])) || null;

  return { pedido, tipo, descricao: bruto[0] ?? null, ocorridoEm, eventoId };
}
