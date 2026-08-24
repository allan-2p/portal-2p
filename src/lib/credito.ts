/**
 * Análise de Crédito — tipos e regras puras (client-safe).
 *
 * O objeto espelha o `Analise_de_Credito__c` do Salesforce para que o
 * histórico das duas bases possa ser lido lado a lado no portal.
 */

export const CREDITO_STATUS = [
  "Análise Solicitada",
  "Em Andamento",
  "Análise Concluída",
  "Cancelada",
] as const;
export type CreditoStatus = (typeof CREDITO_STATUS)[number];

export const CREDITO_PRIORIDADES = ["Normal", "Média", "Urgente"] as const;
export type CreditoPrioridade = (typeof CREDITO_PRIORIDADES)[number];

export const CREDITO_CONCLUSOES = ["Liberado", "Negado"] as const;
export type CreditoConclusao = (typeof CREDITO_CONCLUSOES)[number];

/** Documento anexado à solicitação (arquivo no bucket `credito-anexos`). */
export type CreditoAnexo = {
  path: string;
  nome: string;
  tamanho: number | null;
  tipo: string | null;
};

export const CREDITO_ANEXOS_BUCKET = "credito-anexos";

export type CreditoAnalise = {
  contatoNome: string | null;
  contatoEmail: string | null;
  contatoTelefone: string | null;
  empresaSecundaria: boolean;
  empresaSecundariaNome: string | null;
  empresaSecundariaDoc: string | null;
  anexos: CreditoAnexo[];
  responsavelAnalise: string | null;
  autorizacaoDiretoria: string | null;
  id: string;
  numero: string;
  instancia: "solar" | "carregadores";
  clienteDoc: string;
  clienteNome: string | null;
  clienteId: string | null;
  status: CreditoStatus;
  prioridade: CreditoPrioridade;
  conclusao: CreditoConclusao | null;
  restricao: boolean | null;
  condicaoSolicitada: string | null;
  condicaoAprovada: string | null;
  creditoSolicitado: number | null;
  creditoAprovado: number | null;
  serasa: number | null;
  validade: string | null;
  observacoesVendedor: string | null;
  observacoesFinanceiro: string | null;
  propostaId: string | null;
  propostaNumero: string | null;
  solicitadoPor: string | null;
  solicitadoPorNome: string | null;
  solicitadoEm: string;
  analistaId: string | null;
  analistaNome: string | null;
  concluidoEm: string | null;
};

/** Registro histórico vindo do Salesforce (somente leitura). */
export type CreditoHistoricoSf = {
  id: string;
  nome: string | null;
  status: string | null;
  conclusao: string | null;
  restricao: string | null;
  condicaoSolicitada: string | null;
  condicaoAprovada: string | null;
  creditoSolicitado: number | null;
  creditoAprovado: number | null;
  serasa: number | null;
  prioridade: string | null;
  solicitadoEm: string | null;
  concluidoEm: string | null;
  observacoesFinanceiro: string | null;
  observacoesVendedor: string | null;
};

/** Limite vigente do cliente, usado para liberar condição a prazo no checkout. */
export type CreditoVigente = {
  analiseId: string;
  numero: string;
  limite: number | null;
  condicaoAprovada: string | null;
  validade: string | null;
  concluidoEm: string | null;
};

export const CREDITO_STATUS_ABERTOS: CreditoStatus[] = ["Análise Solicitada", "Em Andamento"];

export function creditoStatusTom(status: CreditoStatus): "default" | "secondary" | "outline" | "destructive" {
  if (status === "Análise Concluída") return "default";
  if (status === "Cancelada") return "destructive";
  if (status === "Em Andamento") return "secondary";
  return "outline";
}

/** Uma condição é "a prazo" quando alguma parcela vence depois do faturamento. */
export function condicaoEhAPrazo(parcelas: { dias: number }[] | null | undefined): boolean {
  if (!parcelas?.length) return false;
  return parcelas.some((p) => Number(p.dias) > 0);
}

/** `true` quando o limite vigente cobre o valor da proposta. */
export function limiteCobre(vigente: CreditoVigente | null, valor: number): boolean {
  if (!vigente) return false;
  if (vigente.limite == null) return true; // liberado sem teto definido
  return Number(valor) <= Number(vigente.limite) + 0.01;
}

export function creditoVencido(validade: string | null | undefined, hoje = new Date()): boolean {
  if (!validade) return false;
  const d = new Date(`${validade}T23:59:59`);
  return d.getTime() < hoje.getTime();
}

export const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
