/**
 * Catálogo dos campos que o portal envia ao Salesforce (Account e Opportunity)
 * e o mapeamento configurável para os campos da org.
 *
 * Este módulo é puro (sem acesso a rede/banco) para poder ser usado tanto na
 * tela de configuração quanto no envio real, garantindo que a prévia mostrada
 * ao usuário seja exatamente o payload enviado.
 */

import { stage, orgOportunidade } from "./salesforce-stage";

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

export function dataFechamento(row: Record<string, any>) {
  return (
    so(row["previsao_fechamento"]).slice(0, 10) || String(row["created_at"] ?? new Date().toISOString()).slice(0, 10)
  );
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
    valor: (r) => stage(r["status"]),
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
    ajuda: "Sem campo correspondente detectado na org — indique qual campo deve receber a OV.",
    sfPadrao: null,
    tipo: "texto",
    valor: (r) => ouNulo(so(r["sap_ov_numero"]) || so(r["numero_sap"])),
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
    sfPadrao: null,
    tipo: "numero",
    valor: (r) => (r["frete_valor"] == null ? null : Number(r["frete_valor"]) || 0),
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
    sfPadrao: null,
    tipo: "texto",
    valor: (r) => ouNulo(r["nf_numero"] ?? r["nota_fiscal"]),
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
