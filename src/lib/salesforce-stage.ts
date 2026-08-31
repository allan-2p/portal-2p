/**
 * Tradução do status do portal para a picklist StageName da org do Grupo 2P
 * e da instância para a picklist Org_Oportunidade__c. Módulo puro para poder
 * ser usado também na tela de mapeamento de campos.
 */

const so = (v: unknown) => String(v ?? "").trim();

/**
 * Valores EXATOS da picklist StageName: Projeto Não Fechado, Projeto Fechado,
 * Estoque, Em Negociação (não é mais gerada pelo portal), Pedido Concluído,
 * Pedido Cancelado, Oportunidade Perdida (só manual, nunca enviada).
 *
 * Mapa usado apenas para exibição na tela de mapeamento de campos.
 */
export const SF_STAGE_POR_STATUS: Record<string, string> = {
  "Salvo": "Projeto Fechado / Projeto Não Fechado / Estoque (conforme a escolha na proposta)",
  "Aguardando Pagamento": "Pedido Concluído",
  "Processando": "Pedido Concluído",
  "Separação": "Pedido Concluído",
  "Faturado": "Pedido Concluído",
  "Coletado": "Pedido Concluído",
  "Entregue": "Pedido Concluído",
  "Cancelado": "Pedido Cancelado",
};

/** Escolha "O projeto já foi vendido para o cliente final?" (tri-state). */
export function escolhaProjetoVendido(row: Record<string, any>): "sim" | "nao" | "estoque" {
  const t = (row?.["totais"] ?? {}) as Record<string, any>;
  const v = so(t["projetoVendido"]).toLowerCase();
  if (v === "sim" || v === "nao" || v === "estoque") return v;
  return t["vendidoClienteFinal"] === true ? "sim" : "nao";
}

/** Rótulo enviado em `Projeto_Vendido__c`. */
export function projetoVendidoLabel(row: Record<string, any>): string {
  const v = escolhaProjetoVendido(row);
  return v === "sim" ? "Sim" : v === "estoque" ? "Estoque" : "Não";
}

/**
 * StageName do pedido. "Salvo" segue a escolha da proposta; de Aguardando
 * Pagamento em diante é sempre "Pedido Concluído".
 */
export function stage(status: unknown, projetoVendido?: unknown): string {
  const s = so(status);
  if (s === "Cancelado") return "Pedido Cancelado";
  if (s && s !== "Salvo") return "Pedido Concluído";
  const v = so(projetoVendido).toLowerCase();
  if (v === "sim") return "Projeto Fechado";
  if (v === "estoque") return "Estoque";
  return "Projeto Não Fechado";
}


/**
 * Organização da oportunidade (picklist `Org_Oportunidade__c`).
 * 2P Solar → "Acessórios 2P" · 2P Carregadores → "2P Carregadores".
 */
export function orgOportunidade(row: Record<string, any>): string | null {
  const org = so(row["organizacao"] ?? row["instancia"]).toLowerCase();
  if (org.includes("solar") || org.includes("acess")) return "Acessórios 2P";
  if (org.includes("carregad")) return "2P Carregadores";
  return null;
}
