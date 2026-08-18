/**
 * Orquestração: depois de gravar o cadastro na tabela `clientes` (grupo-2p),
 * o cliente é enviado automaticamente para o SAP e para o Salesforce.
 * Falhas não desfazem o cadastro — ficam registradas em `sap_status`/`sap_erro`
 * e podem ser reenviadas pela tela de cadastros.
 */

import type { ClientesInstance } from "./clientes-db.server";

export type SincronizacaoResultado = {
  sap: { ok: boolean; numero_sap: string | null; erro: string | null };
  salesforce: { ok: boolean; accountId: string | null; contactId: string | null; erro: string | null };
};

/**
 * Envia o cadastro para SAP + Salesforce e grava o retorno na própria linha
 * do cliente. `vendedorSap` e `ownerSfId` vêm do perfil do consultor.
 */
export async function sincronizarCliente(
  instancia: ClientesInstance,
  clienteId: string,
  cliente: Record<string, any>,
  extras: { vendedorSap?: string | null; ownerSfId?: string | null },
): Promise<SincronizacaoResultado> {
  const { enviarClienteParaSap } = await import("./sap-clientes.server");
  const { sincronizarClienteSalesforce } = await import("./salesforce-clientes.server");
  const db = await import("./clientes-db.server");

  const principal = Array.isArray(cliente["contatos"])
    ? cliente["contatos"].find((c: any) => c?.tipo === "principal")
    : null;

  const sap = await enviarClienteParaSap({
    doc: String(cliente["doc"] ?? ""),
    razao_social: String(cliente["razao_social"] ?? ""),
    nome_fantasia: cliente["nome_fantasia"],
    ie: cliente["ie"],
    suframa: cliente["suframa"],
    contribuinte: cliente["contribuinte"] !== false,
    finalidade: cliente["finalidade"],
    tabela_preco: cliente["tabela_preco"],
    condicao_pgto_sap: cliente["condicao_pgto_sap"],
    email: cliente["email"],
    telefone: cliente["telefone"],
    cep: cliente["cep"],
    logradouro: cliente["logradouro"],
    numero: cliente["numero"],
    complemento: cliente["complemento"],
    bairro: cliente["bairro"],
    cidade: cliente["cidade"],
    uf: String(cliente["uf"] ?? ""),
    municipio_ibge: cliente["municipio_ibge"],
    vendedor_sap: extras.vendedorSap ?? null,
  });

  const salesforce = await sincronizarClienteSalesforce({
    doc: String(cliente["doc"] ?? ""),
    razao_social: String(cliente["razao_social"] ?? ""),
    nome_fantasia: cliente["nome_fantasia"],
    email: cliente["email"],
    telefone: cliente["telefone"],
    site: cliente["site"],
    logradouro: cliente["logradouro"],
    numero: cliente["numero"],
    complemento: cliente["complemento"],
    bairro: cliente["bairro"],
    cidade: cliente["cidade"],
    uf: String(cliente["uf"] ?? ""),
    cep: cliente["cep"],
    contato_nome: cliente["contato_nome"] ?? principal?.nome ?? null,
    contato_email: cliente["contato_email"] ?? principal?.emails?.[0] ?? null,
    contato_telefone: cliente["contato_telefone"] ?? principal?.telefones?.[0] ?? null,
    contato_cargo: cliente["contato_cargo"] ?? principal?.cargo ?? null,
    owner_sf_id: extras.ownerSfId ?? null,
    organizacao: cliente["organizacao"],
  });

  const patch: Record<string, unknown> = {
    sap_status: sap.ok ? "enviado" : "erro",
    sap_erro: sap.ok ? null : sap.erro,
    sf_status: salesforce.ok ? "enviado" : "erro",
    sf_erro: salesforce.ok ? null : salesforce.erro,
    sincronizado_em: new Date().toISOString(),
  };
  if (sap.ok && sap.numero_sap) patch["numero_sap"] = sap.numero_sap;
  if (salesforce.ok) {
    patch["sf_account_id"] = salesforce.accountId;
    if (salesforce.contactId) patch["sf_contact_id"] = salesforce.contactId;
  }

  try {
    await db.updateCliente(instancia, clienteId, patch);
  } catch (err) {
    console.error("[clientes] falha ao gravar retorno das integrações", err);
  }

  return {
    sap: {
      ok: sap.ok,
      numero_sap: sap.ok ? sap.numero_sap : null,
      erro: sap.ok ? null : sap.erro,
    },
    salesforce: {
      ok: salesforce.ok,
      accountId: salesforce.ok ? salesforce.accountId : null,
      contactId: salesforce.ok ? salesforce.contactId : null,
      erro: salesforce.ok ? null : salesforce.erro,
    },
  };
}
