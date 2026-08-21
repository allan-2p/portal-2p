/**
 * Status universais das propostas/pedidos — valem para todas as instâncias
 * (2P Solar, 2P Carregadores, Grupo 2P). Fonte única de verdade.
 *
 * A ordem abaixo é a ordem real do processo e define o `id` de cada status.
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

/** id_status oficial (1..8) — segue a ordem do processo. */
export const PROPOSTA_STATUS_ID: Record<PropostaStatus, number> = {
  "Salvo": 1,
  "Aguardando Pagamento": 2,
  "Processando": 3,
  "Separação": 4,
  "Faturado": 5,
  "Coletado": 6,
  "Entregue": 7,
  "Cancelado": 8,
};

export const PROPOSTA_STATUS_BY_ID = Object.fromEntries(
  (PROPOSTA_STATUS as readonly PropostaStatus[]).map((s) => [PROPOSTA_STATUS_ID[s], s]),
) as Record<number, PropostaStatus>;

export function propostaStatusId(status: string): number {
  return PROPOSTA_STATUS_ID[status as PropostaStatus] ?? 1;
}

/** Motor responsável por cada transição — nenhum é acionado manualmente. */
export type PropostaMotor =
  | "checkout"
  | "pagamento"
  | "cron-sap"
  | "webhook-fretefy"
  | "humano";

/** Transições permitidas: destino → motor que dispara. */
export const PROPOSTA_TRANSICOES: Record<PropostaStatus, Partial<Record<PropostaStatus, PropostaMotor>>> = {
  "Salvo": { "Aguardando Pagamento": "checkout", "Processando": "checkout", "Cancelado": "humano" },
  "Aguardando Pagamento": { "Processando": "pagamento", "Cancelado": "humano" },
  "Processando": { "Separação": "cron-sap", "Cancelado": "humano" },
  "Separação": { "Faturado": "cron-sap", "Cancelado": "humano" },
  "Faturado": { "Coletado": "cron-sap", "Cancelado": "humano" },
  "Coletado": { "Entregue": "webhook-fretefy", "Cancelado": "humano" },
  "Entregue": {},
  "Cancelado": {},
};

/** A proposta só é editável enquanto rascunho (id 1). */
export function propostaEditavel(status: string): boolean {
  return propostaStatusId(status) === PROPOSTA_STATUS_ID["Salvo"];
}

/** Cancelar é a única transição humana; não cancela pedido entregue/cancelado. */
export function podeCancelarProposta(status: string): boolean {
  return PROPOSTA_TRANSICOES[status as PropostaStatus]?.["Cancelado"] === "humano";
}

export function transicaoPermitida(de: string, para: string, motor?: PropostaMotor): PropostaMotor | null {
  const m = PROPOSTA_TRANSICOES[de as PropostaStatus]?.[para as PropostaStatus] ?? null;
  if (!m) return null;
  if (motor && m !== motor) return null;
  return m;
}

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
    dot: "bg-[#B91C1C]", text: "text-[#B91C1C]", chip: "bg-[#B91C1C] text-[#FEF2F2]",
    bg: "#B91C1C", fg: "#FEF2F2",
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
