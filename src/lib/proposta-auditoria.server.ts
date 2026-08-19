/**
 * Auditoria da proposta.
 *
 * Registra, em public.integration_logs (slug "proposta"), cada tentativa de
 * precificação/cotação e todo bloqueio aplicado pelo portal, com o motivo e os
 * dados devolvidos pelo SAP na tentativa. Serve para responder "por que essa
 * proposta não avançou/não salvou" sem precisar reproduzir o cenário.
 *
 * Nunca registre credenciais nem tokens no detalhe.
 */

export type AuditoriaContexto = {
  /** Proposta já gravada (permite filtrar o histórico pelo pedido). */
  propostaId?: string | null;
  /** CNPJ/CPF do cliente da proposta (usado na busca livre do painel). */
  doc?: string | null;
  clienteNome?: string | null;
  unidade?: "solar" | "carregadores";
  actorId?: string | null;
  actorEmail?: string | null;
};

const SLUG = "proposta";

function base(ctx: AuditoriaContexto): Record<string, unknown> {
  return {
    ...(ctx.propostaId ? { proposta_id: ctx.propostaId } : {}),
    ...(ctx.doc ? { doc: ctx.doc } : {}),
    ...(ctx.clienteNome ? { razao_social: ctx.clienteNome } : {}),
    ...(ctx.unidade ? { unidade: ctx.unidade } : {}),
  };
}

/** Uma tentativa de precificação no SAP (payload enviado + resposta recebida). */
export async function auditarTentativaSap(
  ctx: AuditoriaContexto,
  entrada: {
    etapa: string;
    filial?: string;
    listaPreco?: string;
    itens: { codigo: string; quantidade: number }[];
    resposta: Record<string, unknown>;
    erros?: string[];
    durationMs?: number;
  },
): Promise<void> {
  const { logIntegrationEvent } = await import("./integration-logs.server");
  const erros = entrada.erros ?? [];
  await logIntegrationEvent({
    slug: SLUG,
    level: erros.length ? "warn" : "info",
    event: `${entrada.etapa}.tentativa`,
    message: erros.length
      ? `SAP respondeu com ressalva${entrada.filial ? ` (filial ${entrada.filial})` : ""}: ${erros.join(" • ")}`
      : `Tentativa de precificação no SAP${entrada.filial ? ` (filial ${entrada.filial})` : ""}: ${entrada.itens.length} item(ns).`,
    detail: {
      ...base(ctx),
      payload: {
        filial: entrada.filial ?? null,
        lista_preco: entrada.listaPreco ?? null,
        documento: ctx.doc ?? null,
        itens: entrada.itens,
      },
      resposta: entrada.resposta,
    },
    ...(entrada.durationMs !== undefined ? { durationMs: entrada.durationMs } : {}),
    actorId: ctx.actorId ?? null,
    actorEmail: ctx.actorEmail ?? null,
  });
}

/** Bloqueio aplicado pelo portal, com motivo e dados que sustentam a decisão. */
export async function auditarBloqueio(
  ctx: AuditoriaContexto,
  entrada: { etapa: string; motivo: string; dados?: Record<string, unknown> },
): Promise<void> {
  const { logIntegrationEvent } = await import("./integration-logs.server");
  await logIntegrationEvent({
    slug: SLUG,
    level: "error",
    event: `${entrada.etapa}.bloqueio`,
    message: entrada.motivo,
    detail: { ...base(ctx), motivo: entrada.motivo, resposta: entrada.dados ?? {} },
    actorId: ctx.actorId ?? null,
    actorEmail: ctx.actorEmail ?? null,
  });
}
