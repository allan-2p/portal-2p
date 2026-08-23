/**
 * Tradução do status do portal para a picklist StageName da org do Grupo 2P
 * e da instância para a picklist Org_Oportunidade__c. Módulo puro para poder
 * ser usado também na tela de mapeamento de campos.
 */

const so = (v: unknown) => String(v ?? "").trim();

/**
 * Valores EXATOS da picklist StageName: Projeto Não Fechado, Projeto Fechado,
 * Estoque, Em Negociação, Pedido Concluído, Pedido Cancelado, Oportunidade Perdida.
 */
export const SF_STAGE_POR_STATUS: Record<string, string> = {
  "Salvo": "Em Negociação",
  "Aguardando Pagamento": "Em Negociação",
  "Processando": "Projeto Fechado",
  "Separação": "Estoque",
  "Faturado": "Pedido Concluído",
  "Coletado": "Pedido Concluído",
  "Entregue": "Pedido Concluído",
  "Cancelado": "Pedido Cancelado",
};

export function stage(status: unknown): string {
  const exato = SF_STAGE_POR_STATUS[so(status)];
  if (exato) return exato;
  const s = so(status).toLowerCase();
  if (s.includes("cancel")) return "Pedido Cancelado";
  if (s.includes("perdid")) return "Oportunidade Perdida";
  if (s.includes("entregue") || s.includes("coletad") || s.includes("faturad")) return "Pedido Concluído";
  if (s.includes("separa") || s.includes("estoque")) return "Estoque";
  if (s.includes("process")) return "Projeto Fechado";
  return "Em Negociação";
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
