/**
 * Status universais das propostas/pedidos — valem para todas as instâncias
 * (2P Solar, 2P Carregadores, Grupo 2P). Fonte única de verdade.
 */
export const PROPOSTA_STATUS = [
  "Salvo",
  "Aguardando Pagamento",
  "Processando",
  "Separação",
  "Faturado",
  "Coletado",
  "Entregue",
  "Cancelado",
] as const;

export type PropostaStatus = (typeof PROPOSTA_STATUS)[number];

export type PropostaStatusStyle = {
  /** classe de fundo para o "dot" */
  dot: string;
  /** classe de texto */
  text: string;
  /** classe de chip (badge preenchido) */
  chip: string;
  /** cor sólida para elementos que precisam de estilo inline (kanban) */
  bg: string;
  /** cor do texto sobre o fundo sólido */
  fg: string;
};

/**
 * Paleta oficial dos status (fonte única). As cores são dados de domínio —
 * consumidas via style inline ou pelas classes utilitárias abaixo.
 */
export const PROPOSTA_STATUS_STYLE: Record<PropostaStatus, PropostaStatusStyle> = {
  "Salvo": {
    dot: "bg-[#A8A29E]", text: "text-[#A8A29E]", chip: "bg-[#A8A29E] text-[#1C1917]",
    bg: "#A8A29E", fg: "#1C1917",
  },
  "Aguardando Pagamento": {
    dot: "bg-[#A78BFA]", text: "text-[#A78BFA]", chip: "bg-[#A78BFA] text-[#1E1B4B]",
    bg: "#A78BFA", fg: "#1E1B4B",
  },
  "Processando": {
    dot: "bg-[#D97706]", text: "text-[#D97706]", chip: "bg-[#D97706] text-[#FFFBEB]",
    bg: "#D97706", fg: "#FFFBEB",
  },
  "Separação": {
    dot: "bg-[#0284C7]", text: "text-[#0284C7]", chip: "bg-[#0284C7] text-[#F0F9FF]",
    bg: "#0284C7", fg: "#F0F9FF",
  },
  "Faturado": {
    dot: "bg-[#1E3A8A]", text: "text-[#1E3A8A]", chip: "bg-[#1E3A8A] text-[#EFF6FF]",
    bg: "#1E3A8A", fg: "#EFF6FF",
  },
  "Coletado": {
    dot: "bg-[#14B8A6]", text: "text-[#14B8A6]", chip: "bg-[#14B8A6] text-[#042F2E]",
    bg: "#14B8A6", fg: "#042F2E",
  },
  "Entregue": {
    dot: "bg-[#16A34A]", text: "text-[#16A34A]", chip: "bg-[#16A34A] text-[#F0FDF4]",
    bg: "#16A34A", fg: "#F0FDF4",
  },
  "Cancelado": {
    dot: "bg-[#991B1B]", text: "text-[#991B1B]", chip: "bg-[#991B1B] text-[#FEF2F2]",
    bg: "#991B1B", fg: "#FEF2F2",
  },
};


/** Status ainda "em curso" (não finalizados nem cancelados). */
export const PROPOSTA_STATUS_EM_CURSO: PropostaStatus[] = [
  "Salvo",
  "Aguardando Pagamento",
  "Processando",
  "Separação",
  "Faturado",
  "Coletado",
];

export function propostaStatusStyle(status: string): PropostaStatusStyle {
  return PROPOSTA_STATUS_STYLE[status as PropostaStatus] ?? PROPOSTA_STATUS_STYLE["Salvo"];
}
