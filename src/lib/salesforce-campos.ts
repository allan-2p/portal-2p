/**
 * Catálogo dos campos que o portal envia ao Salesforce (Account e Opportunity)
 * e o mapeamento configurável para os campos da org.
 *
 * Este módulo é puro (sem acesso a rede/banco) para poder ser usado tanto na
 * tela de configuração quanto no envio real, garantindo que a prévia mostrada
 * ao usuário seja exatamente o payload enviado.
 */

import { stage, orgOportunidade, escolhaProjetoVendido, projetoVendidoLabel, faseDaProposta } from "./salesforce-stage";

export type SfObjeto = "Account" | "Opportunity";

export type SfTipoCampo = "texto" | "numero" | "data" | "id" | "picklist" | "textarea" | "email" | "telefone";

export type CampoOrigem = {
  /** Chave estável usada na tabela `salesforce_field_map`. */
  chave: string;
  rotulo: string;
  /** De onde o valor sai no portal (mostrado na tela para conferência). */
  origem: string;
  ajuda?: string;
  /** Campo padrão da org (API name). `null` = não enviado enquanto não for mapeado. */
  sfPadrao: string | null;
  tipo: SfTipoCampo;
  /** Campos que o Salesforce exige para criar o registro: não podem ser desativados. */
  obrigatorio?: boolean;
  /** Extrai o valor do registro do portal. */
  valor: (row: Record<string, any>) => unknown;
};

const so = (v: unknown) => String(v ?? "").trim();
const digitos = (v: unknown) => so(v).replace(/\D/g, "");
const ouNulo = (v: unknown) => (so(v) ? so(v) : null);

export function ruaCompleta(c: Record<string, any>) {
  return (
    [so(c["logradouro"]), so(c["numero"]), so(c["complemento"]), so(c["bairro"])].filter(Boolean).join(", ").slice(0, 255) ||
    null
  );
}

/** Descrição legível do pedido (itens, frete, SAP) para o campo Description. */
export function descricaoPedido(row: Record<string, any>): string {
  const linhas: string[] = [];
  const itens = Array.isArray(row["itens"]) ? (row["itens"] as any[]) : [];
  for (const i of itens) {
    const qtd = Number(i?.qtd ?? 0);
    if (!qtd) continue;
    linhas.push(`• ${qtd}x ${so(i?.nome) || so(i?.codigo) || "Item"} — ${so(i?.codigo)}`);
  }
  const frete = so(row["frete_mod"]).toUpperCase();
  if (frete) linhas.push(`Frete: ${frete}${row["frete_valor"] ? ` (R$ ${Number(row["frete_valor"]).toFixed(2)})` : ""}`);
  if (so(row["forma_pagamento"])) linhas.push(`Pagamento: ${so(row["forma_pagamento"])}`);
  if (so(row["sap_ov_numero"])) linhas.push(`Ordem de venda SAP: ${so(row["sap_ov_numero"])}`);
  if (so(row["numero_sap"])) linhas.push(`Nº SAP: ${so(row["numero_sap"])}`);
  if (so(row["observacoes"])) linhas.push(`Observações: ${so(row["observacoes"])}`);
  return linhas.join("\n").slice(0, 30000);
}

export function nomeOportunidade(row: Record<string, any>) {
  return [so(row["numero"]), so(row["nome"]) || so(row["cliente_nome"])].filter(Boolean).join(" - ").slice(0, 120);
}

export function valorTotalProposta(row: Record<string, any>) {
  const t = (row["totais"] ?? {}) as Record<string, any>;
  return Number(t["valorTotal"] ?? t["valor_total"] ?? row["valor_total"] ?? 0) || 0;
}

/** `YYYY-MM-DD` de um timestamp no fuso de São Paulo (evita o "um dia a menos"). */
export function diaBR(v: unknown): string {
  const s = so(v);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  // en-CA devolve YYYY-MM-DD; timeZone garante o dia civil brasileiro.
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * CloseDate = data em que o pedido foi FECHADO de fato (`finalizado_em`).
 * Enquanto o pedido não é fechado usamos a previsão de fechamento (ou a data
 * de criação) apenas como estimativa — o Salesforce exige o campo preenchido.
 */
export function dataFechamento(row: Record<string, any>) {
  return (
    diaBR(row["finalizado_em"]) ||
    so(row["previsao_fechamento"]).slice(0, 10) ||
    diaBR(row["created_at"]) ||
    diaBR(new Date().toISOString())
  );
}

/** Data (YYYY-MM-DD) ou nulo. */
const data = (v: unknown) => (so(v) ? so(v).slice(0, 10) : null);
/** Data/hora ISO ou nulo (campos datetime da org). */
const hora = (v: unknown) => (so(v) ? new Date(so(v)).toISOString() : null);
const numeroOuNulo = (v: unknown) => {
  const n = Number(digitos(v));
  return Number.isFinite(n) && so(v) ? n : null;
};

/** Tipo de NF do portal → picklist da org (Venda / Bonificação / Triangulação). */
export function tipoNf(row: Record<string, any>): string | null {
  const t = so(row["tipo_nf"]).toLowerCase();
  if (!t) return null;
  if (t.startsWith("bonific")) return "Bonificação";
  if (t.startsWith("triangul")) return "Triangulação";
  return "Venda";
}

/** Desconto em reais concedido na proposta (0 quando não houve). */
export function descontoProposta(row: Record<string, any>): number {
  const t = (row["totais"] ?? {}) as Record<string, any>;
  const d = Number(t["desconto"] ?? t["descontoValor"] ?? row["desconto_valor"] ?? 0);
  return Number.isFinite(d) ? Math.abs(d) : 0;
}

/** Margem bruta percentual (0–100) para o campo percent da org. */
export function margemTotal(row: Record<string, any>): number | null {
  const t = (row["totais"] ?? {}) as Record<string, any>;
  const p = Number(t["mbPct"] ?? t["margemPct"]);
  if (!Number.isFinite(p)) return null;
  // O portal guarda fração (0,34); a org espera percentual.
  return Math.round((p <= 1 ? p * 100 : p) * 100) / 100;
}

/** Tabela de preço: a picklist da org usa os códigos 01..05. */
export function tabelaPreco(row: Record<string, any>): string | null {
  const t = (row["totais"] ?? {}) as Record<string, any>;
  const bruto = so(row["tabela_preco"] ?? t["listaPreco"] ?? t["tabelaPreco"]);
  const m = bruto.match(/(\d{1,2})/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 5 ? String(n).padStart(2, "0") : null;
}

/** Projeto vendido? — escolha feita na proposta (Sim/Não/Estoque). */
export function projetoVendido(row: Record<string, any>): string | null {
  return projetoVendidoLabel(row ?? {});
}


/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

export const CAMPOS_ACCOUNT: CampoOrigem[] = [
  {
    chave: "razao_social",
    rotulo: "Razão social",
    origem: "Cadastro de cliente › Razão social",
    sfPadrao: "Name",
    tipo: "texto",
    obrigatorio: true,
    valor: (c) => so(c["razao_social"]).slice(0, 255),
  },
  {
    chave: "doc",
    rotulo: "CNPJ / CPF (só dígitos)",
    origem: "Cadastro de cliente › Documento",
    ajuda: "Também é a chave usada para localizar a conta já existente na org.",
    sfPadrao: "CNPJ__c",
    tipo: "texto",
    valor: (c) => ouNulo(digitos(c["doc"])),
  },
  {
    chave: "nome_fantasia",
    rotulo: "Nome fantasia",
    origem: "Cadastro de cliente › Nome fantasia",
    sfPadrao: null,
    tipo: "texto",
    valor: (c) => ouNulo(c["nome_fantasia"]),
  },
  {
    chave: "telefone",
    rotulo: "Telefone",
    origem: "Cadastro de cliente › Telefone",
    sfPadrao: "Phone",
    tipo: "telefone",
    valor: (c) => ouNulo(c["telefone"]),
  },
  {
    chave: "email",
    rotulo: "E-mail principal",
    origem: "Cadastro de cliente › E-mail",
    ajuda: "Account não tem campo padrão de e-mail; mapeie para um campo customizado da org.",
    sfPadrao: null,
    tipo: "email",
    valor: (c) => ouNulo(c["email"]),
  },
  {
    chave: "site",
    rotulo: "Site",
    origem: "Cadastro de cliente › Site",
    sfPadrao: "Website",
    tipo: "texto",
    valor: (c) => ouNulo(c["site"]),
  },
  {
    chave: "endereco",
    rotulo: "Endereço (logradouro, nº, compl., bairro)",
    origem: "Cadastro de cliente › Endereço",
    sfPadrao: "BillingStreet",
    tipo: "textarea",
    valor: (c) => ruaCompleta(c),
  },
  {
    chave: "cidade",
    rotulo: "Cidade",
    origem: "Cadastro de cliente › Cidade",
    sfPadrao: "BillingCity",
    tipo: "texto",
    valor: (c) => ouNulo(c["cidade"]),
  },
  {
    chave: "uf",
    rotulo: "UF",
    origem: "Cadastro de cliente › UF",
    sfPadrao: "BillingState",
    tipo: "texto",
    valor: (c) => ouNulo(so(c["uf"]).toUpperCase()),
  },
  {
    chave: "cep",
    rotulo: "CEP",
    origem: "Cadastro de cliente › CEP",
    sfPadrao: "BillingPostalCode",
    tipo: "texto",
    valor: (c) => ouNulo(digitos(c["cep"])),
  },
  {
    chave: "pais",
    rotulo: "País (fixo: Brasil)",
    origem: "Valor fixo do portal",
    sfPadrao: "BillingCountry",
    tipo: "texto",
    valor: () => "Brasil",
  },
  {
    chave: "owner",
    rotulo: "Proprietário (consultor)",
    origem: "Consultor do cadastro › usuário do Salesforce",
    ajuda: "Só é enviado quando o consultor tem o ID de usuário do Salesforce cadastrado no perfil.",
    sfPadrao: "OwnerId",
    tipo: "id",
    valor: (c) => ouNulo(c["owner_sf_id"]),
  },
  {
    chave: "organizacao",
    rotulo: "Organização (Solar / Carregadores)",
    origem: "Cadastro de cliente › Instância",
    sfPadrao: null,
    tipo: "picklist",
    valor: (c) => ouNulo(c["organizacao"]),
  },
  {
    chave: "inscricao_estadual",
    rotulo: "Inscrição estadual",
    origem: "Cadastro de cliente › IE",
    sfPadrao: null,
    tipo: "texto",
    valor: (c) => ouNulo(c["inscricao_estadual"] ?? c["ie"]),
  },
  {
    chave: "numero_sap",
    rotulo: "Código do cliente no SAP",
    origem: "Cadastro de cliente › Nº SAP",
    sfPadrao: null,
    tipo: "texto",
    valor: (c) => ouNulo(c["numero_sap"]),
  },
];

/* ------------------------------------------------------------------ */
/* Opportunity                                                         */
/* ------------------------------------------------------------------ */

export const CAMPOS_OPPORTUNITY: CampoOrigem[] = [
  {
    chave: "nome",
    rotulo: "Nome da oportunidade",
    origem: "Nº da proposta + nome da proposta",
    sfPadrao: "Name",
    tipo: "texto",
    obrigatorio: true,
    valor: (r) => nomeOportunidade(r),
  },
  {
    chave: "account",
    rotulo: "Conta do cliente",
    origem: "Account localizada pelo documento do cliente",
    sfPadrao: "AccountId",
    tipo: "id",
    obrigatorio: true,
    valor: (r) => ouNulo(r["_account_id"] ?? r["sf_account_id"]),
  },
  {
    chave: "estagio",
    rotulo: "Estágio",
    origem: "Status do pedido no portal (traduzido para a picklist da org)",
    sfPadrao: "StageName",
    tipo: "picklist",
    obrigatorio: true,
    valor: (r) => faseDaProposta(r),
  },
  {
    chave: "data_fechamento",
    rotulo: "Data de fechamento",
    origem: "Previsão de fechamento (ou data de criação da proposta)",
    sfPadrao: "CloseDate",
    tipo: "data",
    obrigatorio: true,
    valor: (r) => dataFechamento(r),
  },
  {
    chave: "valor",
    rotulo: "Valor total",
    origem: "Total da proposta (produtos + impostos + frete)",
    sfPadrao: "Amount",
    tipo: "numero",
    valor: (r) => valorTotalProposta(r),
  },
  {
    chave: "descricao",
    rotulo: "Descrição (itens, frete, pagamento, SAP)",
    origem: "Resumo gerado pelo portal",
    sfPadrao: "Description",
    tipo: "textarea",
    valor: (r) => descricaoPedido(r),
  },
  {
    chave: "owner",
    rotulo: "Proprietário (vendedor)",
    origem: "Usuário que criou a proposta › ID do Salesforce",
    sfPadrao: "OwnerId",
    tipo: "id",
    valor: (r) => ouNulo(r["_owner_id"]),
  },
  {
    chave: "numero_pedido",
    rotulo: "Nº do pedido no portal",
    origem: "Proposta › Número",
    ajuda:
      "Chave usada para reencontrar a oportunidade e não duplicar. A org do Grupo 2P ainda não tem um campo próprio — escolha um campo de texto para receber o número.",
    sfPadrao: null,
    tipo: "texto",
    valor: (r) => ouNulo(r["numero"]),
  },
  {
    chave: "numero_sap",
    rotulo: "Nº SAP / ordem de venda",
    origem: "Proposta › OV do SAP (ou nº SAP)",
    ajuda: "Campo numérico `N_SAP__c` da org (a OV vai sem os zeros à esquerda).",
    sfPadrao: "N_SAP__c",
    tipo: "numero",
    valor: (r) => numeroOuNulo(so(r["sap_ov_numero"]) || so(r["numero_sap"])),
  },

  {
    chave: "status_pedido",
    rotulo: "Status do pedido (texto do portal)",
    origem: "Proposta › Status",
    sfPadrao: "Status_do_Pedido__c",
    tipo: "texto",
    valor: (r) => ouNulo(r["status"]),
  },
  {
    chave: "org_oportunidade",
    rotulo: "Organização da oportunidade",
    origem: "Instância da proposta (Acessórios 2P / 2P Carregadores)",
    sfPadrao: "Org_Oportunidade__c",
    tipo: "picklist",
    valor: (r) => orgOportunidade(r),
  },
  {
    chave: "forma_pagamento",
    rotulo: "Forma de pagamento",
    origem: "Proposta › Forma de pagamento",
    sfPadrao: null,
    tipo: "texto",
    valor: (r) => ouNulo(r["forma_pagamento_label"] ?? r["forma_pagamento"]),
  },
  {
    chave: "frete_valor",
    rotulo: "Valor do frete",
    origem: "Proposta › Frete",
    sfPadrao: "Frete__c",
    tipo: "numero",
    valor: (r) => (r["frete_valor"] == null ? 0 : Number(r["frete_valor"]) || 0),
  },

  {
    chave: "frete_mod",
    rotulo: "Modalidade do frete (CIF/FOB)",
    origem: "Proposta › Modalidade de frete",
    sfPadrao: null,
    tipo: "texto",
    valor: (r) => ouNulo(so(r["frete_mod"]).toUpperCase()),
  },
  {
    chave: "cliente_doc",
    rotulo: "Documento do cliente",
    origem: "Proposta › CNPJ/CPF do cliente",
    sfPadrao: null,
    tipo: "texto",
    valor: (r) => ouNulo(digitos(r["cliente_doc"])),
  },
  {
    chave: "nota_fiscal",
    rotulo: "Nota fiscal",
    origem: "Proposta › Nº da NF (após faturamento)",
    sfPadrao: "Nota_Fiscal__c",
    tipo: "numero",
    valor: (r) => numeroOuNulo(r["nf_numero"] ?? r["nota_fiscal"]),
  },
  {
    chave: "tipo_nf",
    rotulo: "Tipo de NF",
    origem: "Proposta › Tipo de nota (Venda / Bonificação / Triangulação)",
    sfPadrao: "Tipo_de_NF__c",
    tipo: "picklist",
    valor: (r) => tipoNf(r),
  },
  {
    chave: "desconto",
    rotulo: "Desconto",
    origem: "Proposta › Total de desconto aplicado",
    sfPadrao: "Desconto__c",
    tipo: "numero",
    valor: (r) => descontoProposta(r),
  },
  {
    chave: "total",
    rotulo: "Total do pedido",
    origem: "Proposta › Total (produtos + impostos + frete)",
    sfPadrao: "Total__c",
    tipo: "numero",
    valor: (r) => valorTotalProposta(r),
  },
  {
    chave: "margem_total",
    rotulo: "Margem total (%)",
    origem: "Proposta › Margem bruta percentual",
    sfPadrao: "Margem_Total__c",
    tipo: "numero",
    valor: (r) => margemTotal(r),
  },
  {
    chave: "tabela_preco",
    rotulo: "Tabela de preço",
    origem: "Proposta › Tabela de preço usada na simulação",
    sfPadrao: "Tabela_de_Preco__c",
    tipo: "picklist",
    valor: (r) => tabelaPreco(r),
  },
  {
    chave: "previsao_fechamento",
    rotulo: "Previsão de fechamento",
    origem: "Proposta › Previsão de fechamento",
    sfPadrao: "Previsao_de_Fechamento__c",
    tipo: "data",
    valor: (r) => data(r["previsao_fechamento"]),
  },
  {
    chave: "estimativa_entrega",
    rotulo: "Estimativa de entrega",
    origem: "Proposta › Estimativa de entrega (coleta + prazo do frete)",
    sfPadrao: "Estimativa_de_entrega__c",
    tipo: "data",
    valor: (r) => data(r["estimativa_entrega"] ?? r["previsao_despacho"] ?? r["frete_previsao_entrega"]),
  },

  {
    chave: "transportadora",
    rotulo: "Transportadora",
    origem: "Proposta › Transportadora do frete",
    sfPadrao: "Transportadora__c",
    tipo: "texto",
    valor: (r) => ouNulo(r["transportadora"]),
  },
  {
    chave: "vendedor",
    rotulo: "Vendedor",
    origem: "Proposta › Consultor responsável",
    ajuda: "Picklist da org: só entra se o nome do consultor existir lá.",
    sfPadrao: "Vendedor__c",
    tipo: "picklist",
    valor: (r) => ouNulo(r["consultor_nome"] ?? r["criado_por_nome"]),
  },
  {
    chave: "usuario_criacao",
    rotulo: "Usuário de criação",
    origem: "Proposta › Criado por",
    sfPadrao: "Usuario_Criacao__c",
    tipo: "texto",
    valor: (r) => ouNulo(r["criado_por_nome"]),
  },
  {
    chave: "usuario_finalizacao",
    rotulo: "Usuário de finalização",
    origem: "Proposta › Finalizado por",
    sfPadrao: "Usuario_Finalizacao__c",
    tipo: "texto",
    valor: (r) => ouNulo(r["finalizado_por_nome"]),
  },
  {
    chave: "feito_atraves_de",
    rotulo: "Feito através de",
    origem: "Calculadora 2P (kit fotovoltaico) ou Lista de Produtos",
    sfPadrao: "Feito_atrav_s_de__c",
    tipo: "picklist",
    valor: (r) => (r["kit_fotovoltaico"] ? "Calculadora 2P" : "Lista de Produtos"),
  },
  {
    chave: "projeto_vendido",
    rotulo: "Projeto vendido?",
    origem: "Escolha \"O projeto já foi vendido para o cliente final?\" na proposta",
    sfPadrao: "Projeto_Vendido__c",
    tipo: "picklist",
    valor: (r) => projetoVendido(r),
  },
  {
    chave: "criada_por",
    rotulo: "Quem criou?",
    origem: "Origem da proposta (portal do vendedor)",
    sfPadrao: "Oportunidade_criada_por__c",
    tipo: "picklist",
    valor: () => "Vendedor",
  },
  {
    chave: "finalizada_por",
    rotulo: "Quem finalizou?",
    origem: "Proposta › Finalizado por (vendedor ou cliente via link)",
    sfPadrao: "Oportunidade_finalizada_por__c",
    tipo: "picklist",
    valor: (r) => (so(r["finalizado_por"]) ? "Vendedor" : so(r["finalizado_em"]) ? "Cliente" : null),
  },
  {
    chave: "email_cliente",
    rotulo: "E-mail do cliente",
    origem: "Proposta › E-mail do cliente",
    sfPadrao: "Email__c",
    tipo: "email",
    valor: (r) => ouNulo(r["cliente_email"]),
  },
  {
    chave: "data_faturamento",
    rotulo: "Data de faturamento",
    origem: "Proposta › Faturado em",
    sfPadrao: "Data_de_Faturamento__c",
    tipo: "data",
    valor: (r) => data(r["faturado_em"]),
  },
  {
    chave: "data_coleta",
    rotulo: "Data de coleta",
    origem: "Proposta › Coletado em",
    sfPadrao: "Data_de_Coleta__c",
    tipo: "data",
    valor: (r) => data(r["coletado_em"] ?? r["enviado_em"]),
  },
  {
    chave: "data_entrega",
    rotulo: "Data de entrega",
    origem: "Proposta › Entregue em",
    sfPadrao: "Data_de_Entrega__c",
    tipo: "data",
    valor: (r) => data(r["entregue_em"]),
  },
  {
    chave: "carimbo_salvo",
    rotulo: "Carimbo · Salvo",
    origem: "Proposta › Data de criação",
    sfPadrao: "Salvo__c",
    tipo: "data",
    valor: (r) => hora(r["salvo_em"] ?? r["created_at"]),
  },
  {
    chave: "carimbo_processando",
    rotulo: "Carimbo · Processando",
    origem: "Proposta › Processando em",
    sfPadrao: "Processando__c",
    tipo: "data",
    valor: (r) => hora(r["processando_em"]),
  },
  {
    chave: "carimbo_separacao",
    rotulo: "Carimbo · Separação",
    origem: "Proposta › Separado em",
    sfPadrao: "Separacao__c",
    tipo: "data",
    valor: (r) => hora(r["separado_em"]),
  },
  {
    chave: "carimbo_faturado",
    rotulo: "Carimbo · Faturado",
    origem: "Proposta › Faturado em",
    sfPadrao: "Faturado__c",
    tipo: "data",
    valor: (r) => hora(r["faturado_em"]),
  },
  {
    chave: "carimbo_coletado",
    rotulo: "Carimbo · Coletado",
    origem: "Proposta › Coletado em",
    sfPadrao: "Coletado__c",
    tipo: "data",
    valor: (r) => hora(r["coletado_em"] ?? r["enviado_em"]),
  },
  {
    chave: "carimbo_entregue",
    rotulo: "Carimbo · Entregue",
    origem: "Proposta › Entregue em",
    sfPadrao: "Entregue__c",
    tipo: "data",
    valor: (r) => hora(r["entregue_em"]),
  },
  {
    chave: "data_cancelamento",
    rotulo: "Data de cancelamento",
    origem: "Proposta › Cancelado em",
    sfPadrao: "Data_de_Cancelamento__c",
    tipo: "data",
    valor: (r) => hora(r["cancelado_em"]),
  },
];


export function camposDoObjeto(objeto: SfObjeto): CampoOrigem[] {
  return objeto === "Account" ? CAMPOS_ACCOUNT : CAMPOS_OPPORTUNITY;
}

export type MapeamentoItem = { campo_portal: string; sf_field: string | null; ativo: boolean };

/** Aplica os overrides salvos sobre o catálogo padrão. */
export function resolverMapeamento(objeto: SfObjeto, overrides: MapeamentoItem[]) {
  const byKey = new Map(overrides.map((o) => [o.campo_portal, o]));
  return camposDoObjeto(objeto).map((c) => {
    const o = byKey.get(c.chave);
    const sfField = o ? so(o.sf_field) || null : c.sfPadrao;
    const ativo = c.obrigatorio ? true : o ? o.ativo && Boolean(sfField) : Boolean(c.sfPadrao);
    return { campo: c, sfField, ativo, customizado: Boolean(o) };
  });
}

/** Monta o corpo enviado ao Salesforce a partir do mapeamento resolvido. */
export function montarPayload(
  objeto: SfObjeto,
  row: Record<string, any>,
  overrides: MapeamentoItem[],
): { payload: Record<string, unknown>; linhas: { chave: string; rotulo: string; sfField: string | null; valor: unknown; enviado: boolean }[] } {
  const payload: Record<string, unknown> = {};
  const linhas: { chave: string; rotulo: string; sfField: string | null; valor: unknown; enviado: boolean }[] = [];
  for (const item of resolverMapeamento(objeto, overrides)) {
    let valor: unknown = null;
    try {
      valor = item.campo.valor(row);
    } catch {
      valor = null;
    }
    const enviado = Boolean(item.ativo && item.sfField && !(valor === null && !item.campo.obrigatorio));
    if (enviado && item.sfField) payload[item.sfField] = valor;
    linhas.push({ chave: item.campo.chave, rotulo: item.campo.rotulo, sfField: item.sfField, valor, enviado });
  }
  return { payload, linhas };
}
