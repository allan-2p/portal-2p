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

export const PROPOSTA_STATUS_STYLE: Record<PropostaStatus, PropostaStatusStyle> = {
  "Salvo": {
    dot: "bg-orange-500", text: "text-orange-500", chip: "bg-orange-500 text-background",
    bg: "#F97316", fg: "#1A1206",
  },
  "Aguardando Pagamento": {
    dot: "bg-indigo-500", text: "text-indigo-400", chip: "bg-indigo-500 text-background",
    bg: "#6366F1", fg: "#F8FAFC",
  },
  "Processando": {
    dot: "bg-yellow-400", text: "text-yellow-500", chip: "bg-yellow-400 text-background",
    bg: "#FACC15", fg: "#1F1A10",
  },
  "Separação": {
    dot: "bg-sky-400", text: "text-sky-400", chip: "bg-sky-400 text-background",
    bg: "#38BDF8", fg: "#0B1B24",
  },
  "Faturado": {
    dot: "bg-foreground", text: "text-foreground", chip: "bg-foreground text-background",
    bg: "#111111", fg: "#F8FAFC",
  },
  "Coletado": {
    dot: "bg-emerald-500", text: "text-emerald-500", chip: "bg-emerald-500 text-background",
    bg: "#10B981", fg: "#04211A",
  },
  "Entregue": {
    dot: "bg-gray-500", text: "text-gray-400", chip: "bg-gray-500 text-background",
    bg: "#6B7280", fg: "#F8FAFC",
  },
  "Cancelado": {
    dot: "bg-red-500", text: "text-red-500", chip: "bg-red-500 text-background",
    bg: "#EF4444", fg: "#FFF5F5",
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
