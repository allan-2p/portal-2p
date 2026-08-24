/**
 * Executores dos gatilhos monitorados.
 *
 * Cada job tem um executor único, usado tanto pelo disparo original
 * (cron/webhook) quanto pelo reprocessamento manual na tela de monitoramento.
 * Assim, reprocessar é sempre idêntico à execução original.
 */
import type { JobSlug } from "@/lib/job-runs.server";

export type JobResult = Record<string, unknown> & { skipped?: boolean };
export type JobExecutor = (payload: Record<string, unknown>) => Promise<JobResult>;

/** Motores ainda não ativados: registram a execução como "ignorada", com motivo. */
function pendente(motivo: string): JobExecutor {
  return async (payload) => ({ skipped: true, motivo, payload_recebido: payload });
}

export const JOB_EXECUTORS: Record<JobSlug, JobExecutor> = {
  // A finalização acontece dentro do fluxo do vendedor; não é reexecutável.
  "checkout.finalizar": async () => ({
    skipped: true,
    motivo: "A finalização do pedido só pode ser refeita pelo vendedor no portal.",
  }),

  // Auditoria de acesso a documentos fiscais: registro histórico, não reexecutável.
  "nf.documento": async () => ({
    skipped: true,
    motivo: "Registro de auditoria de download — o documento é aberto pelo usuário no pedido.",
  }),


  // Motor real: cria a ordem de venda no SAP (idempotente por proposta).
  "sap.ov-criar": async (payload) => {
    const id = String((payload as Record<string, unknown>)["propostaId"] ?? "");
    if (!id) return { skipped: true, motivo: "Sem propostaId no payload." };
    const { criarOrdemVendaSap } = await import("@/lib/sap-ov.server");
    const r = await criarOrdemVendaSap(id, { forcar: Boolean((payload as any)["forcar"]) });
    if (!r.ok && r.enviado) throw new Error(r.mensagem ?? "Falha ao criar a ordem de venda no SAP.");
    return { ...r };
  },

  // Motor real: cria/atualiza a oportunidade do pedido no Salesforce.
  "salesforce.pedido": async (payload) => {
    const id = String((payload as Record<string, unknown>)["propostaId"] ?? "");
    if (!id) return { skipped: true, motivo: "Sem propostaId no payload." };
    const { sincronizarPedidoSalesforce } = await import("@/lib/salesforce-pedidos.server");
    const r = await sincronizarPedidoSalesforce(id, { forcar: Boolean((payload as any)["forcar"]) });
    if (!r.ok) throw new Error(r.mensagem ?? "Falha ao enviar o pedido ao Salesforce.");
    return { ...r };
  },

  // Motor real: consulta ZNFE_OV_CONSULTAR e avança Processando → Separação →
  // Faturado → Coletado (com NF e DANFE).
  "cron.sap-nfs": async (payload) => {
    const { sincronizarNotasFiscais } = await import("@/lib/sap-nfs.server");
    const limite = Number((payload as Record<string, unknown>)["limite"] ?? 50) || 50;
    return { ...(await sincronizarNotasFiscais(limite)) };
  },


  // Boleto não tem baixa automática: a confirmação vem do SAP/financeiro e o
  // cron de NFs é quem avança o pedido. Aqui só auditamos a verificação.
  "cron.pagamento-link": pendente(
    "Boleto não possui baixa automática pela plataforma — confirmação vem do SAP/financeiro.",
  ),

  // Motor real: mesma sincronização do botão manual de estoque/produtos.
  "cron.estoque": async () => {
    const { executarSyncEstoque } = await import("@/lib/estoque-sync.server");
    return { ...(await executarSyncEstoque(null)) };
  },

  // Motor real: varre o preço no SAP e ativa/desativa o catálogo.
  "sap.sync-produtos": async (payload) => {
    const p = payload as Record<string, unknown>;
    const { varrerCatalogoVendaveis } = await import("@/lib/sap-catalogo-vendaveis.server");
    const codigos = Array.isArray(p["codigos"]) ? (p["codigos"] as unknown[]).map(String) : undefined;
    return {
      ...(await varrerCatalogoVendaveis({
        limite: Number(p["limite"] ?? 250) || 250,
        ...(codigos?.length ? { codigos } : {}),
      })),
    };
  },

  // Motor real: reconsulta no Itaú as cobranças Pix pendentes.
  "cron.pix-reconsulta": async (payload) => {
    const { reconsultarPixPendentes } = await import("@/lib/pagamentos-pix-reconsulta.server");
    const minutos = Number((payload as Record<string, unknown>)["minutos"] ?? 15) || 15;
    return { ...(await reconsultarPixPendentes(minutos)) };
  },

  // Motor real: avisa consultor (notificação) e cliente (e-mail) sobre boletos.
  "cron.boleto-avisos": async () => {
    const { avisarBoletos } = await import("@/lib/boleto-avisos.server");
    return { ...(await avisarBoletos()) };
  },

  // Motor real: busca no SharePoint os PDFs dos boletos a prazo pela NF.
  "cron.boletos-sharepoint": async (payload) => {
    const { sincronizarBoletosSharepoint } = await import("@/lib/boletos-sharepoint.server");
    const limite = Number((payload as Record<string, unknown>)["limite"] ?? 100) || 100;
    return { ...(await sincronizarBoletosSharepoint(limite)) };
  },

  // Motor real: aplica o evento Pix no pedido (pago / expirado / cancelado).
  "webhook.pix-itau": async (payload) => {
    const { processarWebhookPix } = await import("@/lib/pagamentos-pix.server");
    return await processarWebhookPix(payload);
  },

  // Motor real: aplica o rastreio da Fretefy (entrega concluída → Entregue).
  "webhook.fretefy": async (payload) => {
    const { processarWebhookFretefy } = await import("@/lib/fretefy-tracking.server");
    return await processarWebhookFretefy(payload);
  },

  // Motor real: cria a oferta de carga na Fretefy (ou atualiza a NF da carga).
  "fretefy.oferta-carga": async (payload) => {
    const p = payload as Record<string, unknown>;
    const id = String(p["propostaId"] ?? "");
    if (!id) return { skipped: true, motivo: "Sem propostaId no payload." };
    if (String(p["acao"] ?? "criar") === "documento") {
      const { atualizarDocumentoOferta } = await import("@/lib/fretefy-oferta.server");
      return { ...(await atualizarDocumentoOferta(id)) };
    }
    const { criarOfertaCarga } = await import("@/lib/fretefy-oferta.server");
    return { ...(await criarOfertaCarga(id, { forcar: Boolean(p["forcar"]) })) };
  },



};

export function executorFor(job: JobSlug): JobExecutor {
  return JOB_EXECUTORS[job];
}
