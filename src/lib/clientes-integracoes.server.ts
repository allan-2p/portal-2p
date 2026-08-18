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
  const { logIntegrationEvent } = await import("./integration-logs.server");
  const db = await import("./clientes-db.server");

  const principal = Array.isArray(cliente["contatos"])
    ? cliente["contatos"].find((c: any) => c?.tipo === "principal")
    : null;

  /** Dados de identificação do cliente presentes em todo registro de auditoria. */
  const base = {
    cliente_id: clienteId,
    instancia,
    doc: String(cliente["doc"] ?? ""),
    razao_social: String(cliente["razao_social"] ?? ""),
    organizacao: cliente["organizacao"] ?? null,
    uf: cliente["uf"] ?? null,
  };

  const sapPayload = {
    doc: base.doc,
    razao_social: base.razao_social,
    nome_fantasia: cliente["nome_fantasia"] ?? null,
    ie: cliente["ie"] ?? null,
    contribuinte: cliente["contribuinte"] !== false,
    finalidade: cliente["finalidade"] ?? null,
    tabela_preco: cliente["tabela_preco"] ?? null,
    condicao_pgto_sap: cliente["condicao_pgto_sap"] ?? null,
    cidade: cliente["cidade"] ?? null,
    uf: base.uf,
    cep: cliente["cep"] ?? null,
    vendedor_sap: extras.vendedorSap ?? null,
  };

  await logIntegrationEvent({
    slug: "sap-clientes",
    level: "info",
    event: "cliente.envio.tentativa",
    message: `Enviando ${base.razao_social} (${base.doc}) para o SAP`,
    detail: { ...base, payload: sapPayload },
  });

  const sapIniciadoEm = Date.now();
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

  await logIntegrationEvent({
    slug: "sap-clientes",
    level: sap.ok ? "info" : "error",
    event: sap.ok ? "cliente.envio.sucesso" : "cliente.envio.erro",
    message: sap.ok
      ? `SAP retornou o código ${sap.numero_sap ?? "(sem número)"} para ${base.razao_social}`
      : `Falha no envio ao SAP: ${sap.erro ?? "erro desconhecido"}`,
    durationMs: Date.now() - sapIniciadoEm,
    detail: {
      ...base,
      payload: sapPayload,
      resposta: { ok: sap.ok, numero_sap: sap.numero_sap ?? null, erro: sap.erro ?? null },
    },
  });

  // Grava o retorno do SAP antes de seguir para o Salesforce, mantendo a ordem:
  // cadastro na tabela `clientes` > SAP (número) > Salesforce (id).
  try {
    await db.updateCliente(instancia, clienteId, {
      sap_status: sap.ok ? "enviado" : "erro",
      sap_erro: sap.ok ? null : sap.erro,
      ...(sap.ok && sap.numero_sap ? { numero_sap: sap.numero_sap } : {}),
    });
  } catch (err) {
    console.error("[clientes] falha ao gravar retorno do SAP", err);
  }

  const sfPayload = {
    doc: base.doc,
    razao_social: base.razao_social,
    nome_fantasia: cliente["nome_fantasia"] ?? null,
    email: cliente["email"] ?? null,
    telefone: cliente["telefone"] ?? null,
    cidade: cliente["cidade"] ?? null,
    uf: base.uf,
    contato_nome: cliente["contato_nome"] ?? principal?.nome ?? null,
    contato_email: cliente["contato_email"] ?? principal?.emails?.[0] ?? null,
    owner_sf_id: extras.ownerSfId ?? null,
    organizacao: cliente["organizacao"] ?? null,
  };

  await logIntegrationEvent({
    slug: "salesforce-clientes",
    level: "info",
    event: "cliente.envio.tentativa",
    message: `Enviando ${base.razao_social} (${base.doc}) para o Salesforce`,
    detail: { ...base, payload: sfPayload },
  });

  const sfIniciadoEm = Date.now();
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
