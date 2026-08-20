/**
 * Orquestração: depois de gravar o cadastro na tabela `clientes` (grupo-2p),
 * o cliente é enviado automaticamente para o SAP e para o Salesforce.
 * Falhas não desfazem o cadastro — ficam registradas em `sap_status`/`sap_erro`
 * e podem ser reenviadas pela tela de cadastros.
 */

import type { ClientesInstance } from "./clientes-db.server";

/** Destinos que podem ser reenviados/testados isoladamente. */
export type AlvoIntegracao = "sap" | "salesforce" | "contatos";

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
  extras: {
    vendedorSap?: string | null;
    ownerSfId?: string | null;
    /** Quais integrações executar. Vazio/omitido = todas. */
    alvos?: AlvoIntegracao[];
  },
): Promise<SincronizacaoResultado> {
  const { enviarClienteParaSap } = await import("./sap-clientes.server");
  const { sincronizarClienteSalesforce } = await import("./salesforce-clientes.server");
  const { logIntegrationEvent } = await import("./integration-logs.server");
  const db = await import("./clientes-db.server");

  // Atualização de cadastro: recupera os vínculos já gravados para que o SAP
  // atualize o KUNNR existente e o Salesforce atualize a mesma Account/Contact
  // em vez de criar registros duplicados.
  let atual: Record<string, any> | null = null;
  try {
    atual = (await db.getClienteById(instancia, clienteId)) as Record<string, any> | null;
  } catch (err) {
    console.error("[clientes] não foi possível ler o cadastro atual", err);
    await logIntegrationEvent({
      slug: "clientes-cadastro",
      level: "error",
      event: "cadastro.leitura.erro",
      message: `Falha ao ler o cadastro no banco: ${(err as Error)?.message ?? String(err)}`,
      detail: { cliente_id: clienteId, instancia, erro: (err as Error)?.message ?? String(err) },
    });
  }
  const numeroSapAtual = cliente["numero_sap"] ?? atual?.["numero_sap"] ?? null;
  const sfAccountAtual = cliente["sf_account_id"] ?? atual?.["sf_account_id"] ?? null;
  const sfContactAtual = cliente["sf_contact_id"] ?? atual?.["sf_contact_id"] ?? null;

  const alvos: AlvoIntegracao[] =
    extras.alvos && extras.alvos.length ? extras.alvos : ["sap", "salesforce", "contatos"];
  const fazSap = alvos.includes("sap");
  const fazSf = alvos.includes("salesforce");
  const fazContatos = alvos.includes("contatos");

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

  // Escritório/equipe de vendas: definidos pela organização do cliente
  // (2P Solar 001/0002, 2P Carregadores 002/0003, Grupo 2P 003/0004).
  const { escopoOrg, vendasDoEscopo } = await import("./sap-clientes-map");
  const escopo = escopoOrg(
    cliente["escopo_org"] ?? cliente["organizacao"] ?? atual?.["organizacao"] ?? instancia,
  );
  const { EQUIPE_VENDAS, ESCRITORIO } = vendasDoEscopo({ escopo_org: escopo });
  const vendas = {
    escopo_org: escopo,
    equipe_vendas: EQUIPE_VENDAS,
    escritorio_vendas: ESCRITORIO,
  };

  const sapPayload = {
    doc: base.doc,
    razao_social: base.razao_social,
    nome_fantasia: cliente["nome_fantasia"] ?? null,
    ie: cliente["ie"] ?? null,
    contribuinte: cliente["contribuinte"] !== false,
    finalidade: cliente["finalidade"] ?? null,
    tabela_preco: cliente["tabela_preco"] ?? null,
    regime_tributario: cliente["regime_tributario"] ?? null,
    condicao_pgto_sap: cliente["condicao_pgto_sap"] ?? null,
    logradouro: cliente["logradouro"] ?? null,
    numero: cliente["numero"] ?? null,
    complemento: cliente["complemento"] ?? null,
    bairro: cliente["bairro"] ?? null,
    cidade: cliente["cidade"] ?? null,
    uf: base.uf,
    cep: cliente["cep"] ?? null,
    vendedor_sap: extras.vendedorSap ?? null,
    numero_sap: numeroSapAtual,
    ...vendas,
  };

  if (fazSap) await logIntegrationEvent({
    slug: "sap-clientes",
    level: "info",
    event: "cliente.envio.tentativa",
    message: `Enviando ${base.razao_social} (${base.doc}) para o SAP`,
    detail: { ...base, payload: sapPayload },
  });

  const sapIniciadoEm = Date.now();
  const sap = !fazSap
    ? { ok: true, numero_sap: numeroSapAtual, erro: null as string | null, mensagem: "ignorado" }
    : await enviarClienteParaSap({

    doc: String(cliente["doc"] ?? ""),
    razao_social: String(cliente["razao_social"] ?? ""),
    nome_fantasia: cliente["nome_fantasia"],
    ie: cliente["ie"],
    suframa: cliente["suframa"],
    contribuinte: cliente["contribuinte"] !== false,
    finalidade: cliente["finalidade"],
    tabela_preco: cliente["tabela_preco"],
    regime_tributario: cliente["regime_tributario"],
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
    numero_sap: numeroSapAtual,
    escopo_org: escopo,
    equipe_vendas: EQUIPE_VENDAS,
    escritorio_vendas: ESCRITORIO,
  });

  if (fazSap) await logIntegrationEvent({
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
      resposta: sap.ok
        ? { ok: true, numero_sap: sap.numero_sap ?? null, mensagem: sap.mensagem ?? null }
        : { ok: false, erro: sap.erro ?? null },

    },
  });

  // Grava o retorno do SAP antes de seguir para o Salesforce, mantendo a ordem:
  // cadastro na tabela `clientes` > SAP (número) > Salesforce (id).
  if (fazSap) try {
    await db.updateCliente(instancia, clienteId, {
      sap_status: sap.ok ? "enviado" : "erro",
      sap_erro: sap.ok ? null : sap.erro,
      ...(sap.ok && sap.numero_sap ? { numero_sap: sap.numero_sap } : {}),
    });
  } catch (err) {
    console.error("[clientes] falha ao gravar retorno do SAP", err);
    await logIntegrationEvent({
      slug: "clientes-cadastro",
      level: "error",
      event: "cadastro.gravar_retorno_sap.erro",
      message: `Falha ao gravar no banco o retorno do SAP: ${(err as Error)?.message ?? String(err)}`,
      detail: { ...base, erro: (err as Error)?.message ?? String(err) },
    });
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
    sf_account_id: sfAccountAtual,
    sf_contact_id: sfContactAtual,
  };

  if (fazSf) await logIntegrationEvent({
    slug: "salesforce-clientes",
    level: "info",
    event: "cliente.envio.tentativa",
    message: `Enviando ${base.razao_social} (${base.doc}) para o Salesforce`,
    detail: { ...base, payload: sfPayload },
  });

  const sfIniciadoEm = Date.now();
  const salesforce = !fazSf
    ? { ok: true, accountId: sfAccountAtual, contactId: sfContactAtual, erro: null as string | null }
    : await sincronizarClienteSalesforce({

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
    sf_account_id: sfAccountAtual,
    sf_contact_id: sfContactAtual,
  });


  if (fazSf) await logIntegrationEvent({
    slug: "salesforce-clientes",
    level: salesforce.ok ? "info" : "error",
    event: salesforce.ok ? "cliente.envio.sucesso" : "cliente.envio.erro",
    message: salesforce.ok
      ? `Salesforce retornou a conta ${salesforce.accountId ?? "(sem id)"} para ${base.razao_social}`
      : `Falha no envio ao Salesforce: ${salesforce.erro ?? "erro desconhecido"}`,
    durationMs: Date.now() - sfIniciadoEm,
    detail: {
      ...base,
      payload: sfPayload,
      resposta: salesforce.ok
        ? { ok: true, accountId: salesforce.accountId ?? null, contactId: salesforce.contactId ?? null }
        : { ok: false, erro: salesforce.erro ?? null },
    },
  });



  const patch: Record<string, unknown> = { sincronizado_em: new Date().toISOString() };
  if (fazSap) {
    patch["sap_status"] = sap.ok ? "enviado" : "erro";
    patch["sap_erro"] = sap.ok ? null : sap.erro;
  }
  if (fazSf) {
    patch["sf_status"] = salesforce.ok ? "enviado" : "erro";
    patch["sf_erro"] = salesforce.ok ? null : salesforce.erro;
  }
  if (fazSap && sap.ok && sap.numero_sap) patch["numero_sap"] = sap.numero_sap;
  if (fazSf && salesforce.ok) {
    patch["sf_account_id"] = salesforce.accountId;
    if (salesforce.contactId) patch["sf_contact_id"] = salesforce.contactId;
  }

  try {
    await db.updateCliente(instancia, clienteId, patch);
  } catch (err) {
    console.error("[clientes] falha ao gravar retorno das integrações", err);
    await logIntegrationEvent({
      slug: "clientes-cadastro",
      level: "error",
      event: "cadastro.gravar_retorno.erro",
      message: `Falha ao gravar no banco o retorno das integrações: ${(err as Error)?.message ?? String(err)}`,
      detail: { ...base, patch, erro: (err as Error)?.message ?? String(err) },
    });
  }

  // Contatos: cada um vira um registro na tabela `contatos` (vinculado pelo
  // CÓDIGO SAP e pelo ID Salesforce da conta) e um objeto Contact no Salesforce.
  if (fazContatos) try {
    const contatosDb = await import("./contatos-db.server");
    const { sincronizarContatosSalesforce } = await import("./salesforce-clientes.server");

    const numeroSap = (patch["numero_sap"] as string | undefined) ?? numeroSapAtual;
    const sfAccountId = (patch["sf_account_id"] as string | undefined) ?? sfAccountAtual;

    const salvos = await contatosDb.salvarContatos(
      instancia,
      { ...cliente, id: clienteId, numero_sap: numeroSap, sf_account_id: sfAccountId },
      Array.isArray(cliente["contatos"]) ? cliente["contatos"] : [],
    );
    await contatosDb.atualizarVinculosContatos(clienteId, {
      numero_sap: numeroSap,
      sf_account_id: sfAccountId,
    });

    if (sfAccountId && salvos.length > 0) {
      const inicio = Date.now();
      const resultados = await sincronizarContatosSalesforce(
        sfAccountId,
        salvos.map((c) => ({
          id: c.id,
          tipo: c.tipo,
          nome: c.nome,
          cargo: c.cargo,
          email: c.emails?.[0] ?? cliente["email"] ?? null,
          telefone: c.telefones?.[0] ?? cliente["telefone"] ?? null,
          sf_contact_id: c.sf_contact_id,
        })),
        extras.ownerSfId ?? null,
      );

      for (const r of resultados) {
        await contatosDb.atualizarContatoSalesforce(r.id, {
          sf_contact_id: r.contactId,
          sf_status: r.ok ? "enviado" : "erro",
          sf_erro: r.erro,
        });
      }

      await logIntegrationEvent({
        slug: "salesforce-clientes",
        level: resultados.every((r) => r.ok) ? "info" : "warn",
        event: "contatos.sincronizacao",
        message: `${resultados.filter((r) => r.ok).length}/${resultados.length} contatos sincronizados no Salesforce`,
        durationMs: Date.now() - inicio,
        detail: { ...base, numero_sap: numeroSap, sf_account_id: sfAccountId, contatos: resultados },
      });
    }
  } catch (err) {
    console.error("[clientes] falha ao sincronizar contatos", err);
    await logIntegrationEvent({
      slug: "salesforce-clientes",
      level: "error",
      event: "contatos.erro",
      message: `Falha ao sincronizar contatos: ${(err as Error).message}`,
      detail: { ...base, erro: (err as Error)?.message ?? String(err) },
    });
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
