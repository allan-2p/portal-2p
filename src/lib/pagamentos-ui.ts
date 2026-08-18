/**
 * Apresentação do status de pagamento (Pix/boleto) e as ações que o Atlas
 * recomenda ao vendedor em cada situação.
 */

export type PagamentoStatus = "pendente" | "pago" | "expirado" | "cancelado";

export function normalizarPagamentoStatus(v: unknown): PagamentoStatus | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "pago" || s === "expirado" || s === "cancelado" || s === "pendente") return s;
  return null;
}

export const PAGAMENTO_STATUS_META: Record<
  PagamentoStatus,
  { label: string; classe: string; descricao: string }
> = {
  pendente: {
    label: "Aguardando Pix",
    classe: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    descricao: "Cobrança emitida, ainda não liquidada.",
  },
  pago: {
    label: "Pix pago",
    classe: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    descricao: "Pagamento confirmado pelo banco.",
  },
  expirado: {
    label: "Pix expirado",
    classe: "bg-orange-500/15 text-orange-500 border-orange-500/30",
    descricao: "A cobrança venceu sem pagamento e pode ser reemitida.",
  },
  cancelado: {
    label: "Pix cancelado",
    classe: "bg-destructive/15 text-destructive border-destructive/30",
    descricao: "Cobrança removida ou valor devolvido.",
  },
};

export type AcaoAtlas = {
  titulo: string;
  motivo: string;
  acao: string;
  /** maior = mais urgente */
  prioridade: number;
};

/** Ação recomendada pelo Atlas conforme o status da cobrança Pix. */
export function acaoAtlasPix(status: PagamentoStatus): AcaoAtlas | null {
  switch (status) {
    case "expirado":
      return {
        titulo: "Pix expirou sem pagamento",
        motivo: "A cobrança venceu e o pedido segue em Aguardando pagamento.",
        acao: "Fale com o cliente hoje e reemita o Pix (ou troque para boleto à vista) para destravar o pedido.",
        prioridade: 90,
      };
    case "cancelado":
      return {
        titulo: "Cobrança Pix cancelada/devolvida",
        motivo: "O pagamento foi removido ou devolvido — o pedido foi cancelado.",
        acao: "Confirme com o cliente o motivo do cancelamento e, se houver interesse, refaça o pedido.",
        prioridade: 95,
      };
    case "pendente":
      return {
        titulo: "Pix emitido aguardando pagamento",
        motivo: "A cobrança foi gerada e ainda não foi liquidada.",
        acao: "Reforce o envio do QR Code/copia e cola e confirme o prazo de pagamento com o cliente.",
        prioridade: 60,
      };
    case "pago":
      return {
        titulo: "Pix confirmado — pedido em processamento",
        motivo: "O banco confirmou o pagamento e o pedido avançou para Processando.",
        acao: "Avise o cliente, confirme os dados de entrega e acompanhe o faturamento no SAP.",
        prioridade: 40,
      };
    default:
      return null;
  }
}
