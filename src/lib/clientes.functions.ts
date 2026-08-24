import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertPodeCriar,
  assertPodeEditar,
  assertPodeLer,
  filtrarPorDono,
  getPerm,
} from "./object-perms.server";

const instanciaSchema = z.enum(["solar", "carregadores"]);
const docSchema = z.string().min(11).max(20);

/**
 * Garante que o usuário pode alterar o cadastro: precisa de "Editar" em Contas
 * e, quando o cadastro é de outro consultor, de "Modify All Records".
 * A base de clientes é externa e acessada com chave de serviço, então a
 * checagem de propriedade precisa acontecer aqui no servidor.
 */
async function assertPodeAlterarCliente(
  context: { supabase: any; userId: string },
  instancia: "solar" | "carregadores",
  id: string,
) {
  const db = await import("./clientes-db.server");
  const atual = await db.getClienteById(instancia, id);
  if (!atual) throw new Error("Cadastro não encontrado.");
  const dono = (atual["created_by"] as string | null) ?? null;
  const perm = await getPerm(context as any, instancia, "contas");
  assertPodeEditar(perm, "contas", dono, context.userId);
  return atual;
}

/**
 * Só quem tem "Modify All Records" em Contas pode escolher o consultor
 * responsável por um cadastro. Um consultor comum sempre fica com o próprio.
 */
async function podeEscolherConsultor(
  context: { supabase: any; userId: string },
  instancia: "solar" | "carregadores",
) {
  const perm = await getPerm(context as any, instancia, "contas");
  return perm.modify_all;
}

/**
 * Consultores elegíveis para receber cadastros da instância.
 * Regra universal do portal: usuário ativo + marcado como consultor +
 * com código SAP cadastrado. Quem não atende não aparece em lugar nenhum.
 */
export const listConsultoresFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ instancia: instanciaSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const podeEscolher = await podeEscolherConsultor(context as any, data.instancia);
    const { data: eu } = await context.supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", context.userId)
      .maybeSingle();

    const meuNome = eu?.full_name || eu?.email || "—";
    if (!podeEscolher) {
      return {
        podeEscolher: false as const,
        eu: { id: context.userId, nome: meuNome },
        consultores: [{ id: context.userId, nome: meuNome }],
      };
    }

    const { data: perfis } = await context.supabase
      .from("profiles")
      .select("id, full_name, email, organizacao, ativo, is_consultor, numero_sap")
      .eq("ativo", true)
      .eq("is_consultor", true)
      .in("organizacao", [data.instancia, "grupo"])
      .order("full_name", { ascending: true });

    const consultores = (perfis ?? [])
      .filter((p: any) => String(p.numero_sap ?? "").trim() !== "")
      .map((p: any) => ({
        id: p.id as string,
        nome: (p.full_name || p.email || "—") as string,
      }));
    return { podeEscolher: true as const, eu: { id: context.userId, nome: meuNome }, consultores };
  });

/** Consulta a tabela `clientes` da instância, respeitando View All Records. */
export const listClientesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ instancia: instanciaSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await import("./clientes-db.server");
    const perm = await getPerm(context as any, data.instancia, "contas");
    assertPodeLer(perm, "contas");
    try {
      const todos = await db.listClientes(data.instancia);
      return { ok: true as const, clientes: filtrarPorDono(todos, perm, context.userId) };
    } catch (e) {
      if (e instanceof db.ClientesTableMissing) {
        return { ok: false as const, motivo: "tabela-ausente" as const, clientes: [] };
      }
      throw e;
    }
  });


/**
 * Lista paginada com busca no banco: permite pesquisar em toda a base, não só
 * nos registros já carregados na tela. Ordena do mais recente para o mais
 * antigo por padrão (regra universal do portal).
 */
export const listClientesPaginaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        instancia: instanciaSchema,
        q: z.string().optional(),
        uf: z.string().optional(),
        status: z.string().optional(),
        fiscal: z.string().optional(),
        ordem: z.string().optional(),
        dir: z.string().optional(),
        pagina: z.number().optional(),
        porPagina: z.number().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await import("./clientes-db.server");
    const perm = await getPerm(context as any, data.instancia, "contas");
    assertPodeLer(perm, "contas");
    try {
      const { rows, total } = await db.listClientesPagina(data.instancia, {
        q: data.q,
        uf: data.uf,
        status: data.status,
        fiscal: data.fiscal,
        ordem: data.ordem,
        dir: data.dir === "asc" ? "asc" : "desc",
        pagina: data.pagina,
        porPagina: data.porPagina,
        donoId: perm.view_all ? null : context.userId,
      });
      return { ok: true as const, clientes: rows, total };
    } catch (e) {
      if (e instanceof db.ClientesTableMissing) {
        return { ok: false as const, motivo: "tabela-ausente" as const, clientes: [], total: 0 };
      }
      throw e;
    }
  });

/** Perfil resumido usado pela lista de "Perfil do Cliente". */
export type ClientePerfilResumo = {
  id: string;
  sfAccountId: string | null;
  razaoSocial: string;
  nomeFantasia: string | null;
  doc: string | null;
  numeroSap: string | null;
  cidade: string | null;
  uf: string | null;
  consultor: string | null;
  criadoEm: string | null;
};

function resumirClientePerfil(c: Record<string, any>): ClientePerfilResumo {
  return {
    id: String(c["id"]),
    sfAccountId: (c["sf_account_id"] as string | null) ?? null,
    razaoSocial: String(c["razao_social"] ?? c["nome_fantasia"] ?? "—"),
    nomeFantasia: (c["nome_fantasia"] as string | null) ?? null,
    doc: (c["doc"] as string | null) ?? null,
    numeroSap: (c["numero_sap"] as string | null) ?? null,
    cidade: (c["cidade"] as string | null) ?? null,
    uf: (c["uf"] as string | null) ?? null,
    consultor:
      ((c["consultor_nome"] as string | null) || (c["created_by_nome"] as string | null)) ?? null,
    criadoEm: (c["created_at"] as string | null) ?? null,
  };
}

/** Nº SAP do usuário logado — usado para casar cadastros importados por consultor. */
async function meuConsultorSap(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase
    .from("profiles")
    .select("numero_sap")
    .eq("id", context.userId)
    .maybeSingle();
  const sap = String(data?.numero_sap ?? "").trim();
  return sap || null;
}

/**
 * Lista da tela "Perfil do Cliente": 100% da tabela `clientes` do Grupo 2P.
 * Separada por instância (campo `organizacao`/`instancia`) e, sem "View All
 * Records", pelo consultor responsável.
 */
export const listClientesPerfilFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        instancia: instanciaSchema,
        q: z.string().optional(),
        pagina: z.number().optional(),
        porPagina: z.number().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await import("./clientes-db.server");
    const perm = await getPerm(context as any, data.instancia, "contas");
    assertPodeLer(perm, "contas");
    const consultorSap = perm.view_all ? null : await meuConsultorSap(context as any);
    try {
      const { rows, total } = await db.listClientesPerfil(data.instancia, {
        q: data.q,
        pagina: data.pagina,
        porPagina: data.porPagina,
        donoId: perm.view_all ? null : context.userId,
        consultorSap,
      });
      return { ok: true as const, clientes: rows.map(resumirClientePerfil), total };
    } catch (e) {
      if (e instanceof db.ClientesTableMissing) {
        return { ok: false as const, motivo: "tabela-ausente" as const, clientes: [], total: 0 };
      }
      throw e;
    }
  });

/** Cadastro completo de um cliente (dossiê aberto pela lista de perfis). */
export const getClientePerfilFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ instancia: instanciaSchema, id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await import("./clientes-db.server");
    const perm = await getPerm(context as any, data.instancia, "contas");
    assertPodeLer(perm, "contas");
    const cliente = await db.getClienteById(data.instancia, data.id);
    if (!cliente) return { ok: false as const, cliente: null };
    if (!perm.view_all) {
      const sap = await meuConsultorSap(context as any);
      const meu =
        cliente["created_by"] === context.userId ||
        cliente["consultor_id"] === context.userId ||
        (sap !== null && String(cliente["consultor_sap"] ?? "") === sap);
      if (!meu) throw new Error("Você não tem acesso a este cadastro.");
    }
    return { ok: true as const, cliente: cliente as Record<string, any> };
  });

/** Verifica se o CNPJ/CPF já existe em qualquer instância (Solar ou Carregadores). */
export const verificarDocFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ doc: docSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await import("./clientes-db.server");
    const achados = await db.findClienteByDoc(data.doc);
    if (achados.length === 0) return { existe: false as const, registros: [] };

    const ids = Array.from(
      new Set(achados.map((a) => a.cliente["created_by"]).filter(Boolean) as string[]),
    );
    const nomes = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      for (const p of profs ?? []) nomes.set(p.id, p.full_name || p.email || "—");
    }

    return {
      existe: true as const,
      registros: achados.map(({ instancia, cliente }) => ({
        instancia,
        id: String(cliente["id"]),
        razao_social: (cliente["razao_social"] as string) ?? "—",
        organizacao: (cliente["organizacao"] as string) ?? db.ORGANIZACAO[instancia],
        consultor:
          nomes.get(cliente["created_by"] as string) ??
          (cliente["created_by_nome"] as string) ??
          "Não identificado",
        ativo: cliente["ativo"] !== false,
        criado_em: (cliente["created_at"] as string) ?? null,
      })),
    };
  });

/** Enriquecimento por CNPJ (Serpro + CNPJá). Não grava nada. */
export const enriquecerCnpjFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ cnpj: docSchema }).parse(input))
  .handler(async ({ data }) => {
    const { enrichCnpj } = await import("./cnpj-enrich.server");
    return enrichCnpj(data.cnpj);
  });

const clienteSchema = z.object({
  razao_social: z.string().trim().min(1).max(200),
  nome_fantasia: z.string().trim().max(200).nullable().optional(),
  doc: z.string().trim().max(20),
  ie: z.string().trim().max(40).nullable().optional(),
  ie_situacao: z.string().trim().max(60).nullable().optional(),
  suframa: z.string().trim().max(40).nullable().optional(),
  suframa_situacao: z.string().trim().max(60).nullable().optional(),
  contribuinte: z.boolean(),
  regime_tributario: z.string().trim().max(60).nullable().optional(),
  natureza_juridica: z.string().trim().max(160).nullable().optional(),
  porte: z.string().trim().max(60).nullable().optional(),
  situacao_cadastral: z.string().trim().max(60).nullable().optional(),
  data_abertura: z.string().trim().max(20).nullable().optional(),
  cnae_principal_codigo: z.string().trim().max(20).nullable().optional(),
  cnae_principal_descricao: z.string().trim().max(300).nullable().optional(),
  cnaes_secundarios: z.array(z.object({ codigo: z.string(), descricao: z.string() })).default([]),
  email: z.string().trim().max(160).nullable().optional(),
  telefone: z.string().trim().max(40).nullable().optional(),
  site: z.string().trim().max(200).nullable().optional(),
  contatos: z.array(z.any()).default([]),
  contato_nome: z.string().trim().max(120).nullable().optional(),
  contato_cargo: z.string().trim().max(120).nullable().optional(),
  contato_email: z.string().trim().max(160).nullable().optional(),
  contato_telefone: z.string().trim().max(40).nullable().optional(),
  cep: z.string().trim().max(12).nullable().optional(),
  logradouro: z.string().trim().max(200).nullable().optional(),
  numero: z.string().trim().max(20).nullable().optional(),
  complemento: z.string().trim().max(120).nullable().optional(),
  bairro: z.string().trim().max(120).nullable().optional(),
  cidade: z.string().trim().max(120).nullable().optional(),
  uf: z.string().trim().length(2),
  municipio_ibge: z.string().trim().max(12).nullable().optional(),
  condicao_pagamento: z.string().trim().max(120).nullable().optional(),
  /** Campos exigidos pelo cadastro no SAP. */
  finalidade: z.string().trim().max(40).nullable().optional(),
  tabela_preco: z.string().trim().max(20).nullable().optional(),
  condicao_pgto_sap: z.string().trim().max(20).nullable().optional(),
  observacoes: z.string().trim().max(2000).nullable().optional(),
  ativo: z.boolean().default(true),
  enriquecimento: z.any().nullable().optional(),
});


export const salvarClienteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      instancia: instanciaSchema,
      id: z.string().uuid().nullable().optional(),
      /** Consultor responsável pelo cadastro (só respeitado para quem tem visão geral). */
      consultor_id: z.string().uuid().nullable().optional(),
      cliente: clienteSchema,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await import("./clientes-db.server");
    const { logIntegrationEvent } = await import("./integration-logs.server");
    const doc = data.cliente.doc.replace(/\D/g, "");

    /** Toda falha do cadastro (banco incluído) fica visível em Logs > Integrações. */
    const logErroBanco = async (etapa: string, err: unknown) =>
      logIntegrationEvent({
        slug: "clientes-cadastro",
        level: "error",
        event: `cadastro.${etapa}.erro`,
        message: `Falha ao ${etapa} o cadastro ${data.cliente.razao_social} (${doc}): ${(err as Error)?.message ?? String(err)}`,
        actorId: context.userId,
        detail: {
          cliente_id: data.id ?? null,
          instancia: data.instancia,
          doc,
          razao_social: data.cliente.razao_social,
          uf: data.cliente.uf ?? null,
          erro: (err as Error)?.message ?? String(err),
        },
      });

    // Duplicidade: mesmo documento em qualquer instância.
    let achados: Awaited<ReturnType<typeof db.findClienteByDoc>>;
    try {
      achados = await db.findClienteByDoc(doc);
    } catch (err) {
      await logErroBanco("consultar", err);
      throw err;
    }
    const conflito = achados.find((a) => a.cliente["id"] !== data.id);
    if (conflito) {
      const msg = `Este documento já está cadastrado em ${db.ORGANIZACAO[conflito.instancia]} (${conflito.cliente["razao_social"]}).`;
      await logErroBanco("validar", new Error(msg));
      throw new Error(msg);
    }


    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("full_name, email, numero_sap, sf_user_id")
      .eq("id", context.userId)
      .maybeSingle();

    // Consultor responsável: quem cria assume o cadastro; quem tem
    // "Modify All Records" em Contas pode atribuir a outro consultor.
    const permContas = await getPerm(context as any, data.instancia, "contas");
    if (!data.id) assertPodeCriar(permContas, "contas");
    const podeEscolher = permContas.modify_all;
    const consultorId = podeEscolher && data.consultor_id ? data.consultor_id : context.userId;
    let consultorNome = perfil?.full_name ?? perfil?.email ?? null;
    let consultorEmail = perfil?.email ?? null;
    let consultorSap = (perfil as any)?.numero_sap ?? null;
    let consultorSfId = (perfil as any)?.sf_user_id ?? null;
    if (consultorId !== context.userId) {
      const { data: alvo } = await context.supabase
        .from("profiles")
        .select("full_name, email, numero_sap, sf_user_id, ativo, is_consultor")
        .eq("id", consultorId)
        .maybeSingle();
      // Só um consultor válido (ativo + marcado + com código SAP) pode
      // responder por um cadastro.
      if (
        !alvo ||
        alvo.ativo !== true ||
        (alvo as any).is_consultor !== true ||
        String((alvo as any).numero_sap ?? "").trim() === ""
      ) {
        throw new Error(
          "O consultor selecionado não está habilitado (precisa estar ativo, marcado como consultor e com código SAP).",
        );
      }
      consultorNome = alvo?.full_name ?? alvo?.email ?? null;
      consultorEmail = alvo?.email ?? null;
      consultorSap = (alvo as any)?.numero_sap ?? null;
      consultorSfId = (alvo as any)?.sf_user_id ?? null;
    }

    const payload = {
      ...data.cliente,
      doc,
      organizacao: db.ORGANIZACAO[data.instancia],
      instancia: data.instancia,
    };

    let clienteId = data.id ?? null;
    /** Diff campo a campo (auditoria por cliente, visível só ao administrador). */
    let alteracoes: Array<{ campo: string; de: unknown; para: unknown }> = [];
    try {
      if (data.id) {
        const anterior = await assertPodeAlterarCliente(context as any, data.instancia, data.id);
        const patch: Record<string, unknown> = { ...payload };
        // Só reatribui o consultor quando o usuário tem permissão e escolheu alguém.
        if (podeEscolher && data.consultor_id) {
          patch["created_by"] = consultorId;
          patch["created_by_nome"] = consultorNome;
          patch["created_by_email"] = consultorEmail;
        }
        const igual = (a: unknown, b: unknown) => {
          const norm = (v: unknown) =>
            v === null || v === undefined || v === "" ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
          return norm(a) === norm(b);
        };
        alteracoes = Object.keys(patch)
          .filter((campo) => !igual((anterior as any)?.[campo], patch[campo]))
          .map((campo) => ({ campo, de: (anterior as any)?.[campo] ?? null, para: patch[campo] ?? null }));
        const row = await db.updateCliente(data.instancia, data.id, patch);
        clienteId = (row?.["id"] as string) ?? data.id;
      } else {
        const row = await db.insertCliente(data.instancia, {
          ...payload,
          created_by: consultorId,
          created_by_nome: consultorNome,
          created_by_email: consultorEmail,
        });
        clienteId = row["id"] as string;
      }
    } catch (err) {
      await logErroBanco(data.id ? "atualizar" : "gravar", err);
      throw err;
    }

    await logIntegrationEvent({
      slug: "clientes-cadastro",
      level: "info",
      event: data.id ? "cadastro.atualizado" : "cadastro.criado",
      message: data.id
        ? `Cadastro atualizado: ${payload.razao_social} (${doc})${alteracoes.length ? ` — ${alteracoes.length} campo(s) alterado(s): ${alteracoes.map((a) => a.campo).slice(0, 8).join(", ")}` : " — sem alterações de campo"}`
        : `Cadastro criado: ${payload.razao_social} (${doc})`,
      actorId: context.userId,
      detail: {
        cliente_id: clienteId,
        instancia: data.instancia,
        doc,
        razao_social: payload.razao_social,
        ...(data.id ? { alteracoes } : {}),
      },
    });



    // Envio automático ao salvar: SAP + Salesforce. Erros não desfazem o
    // cadastro; ficam visíveis na tela para reenvio.
    const { sincronizarCliente } = await import("./clientes-integracoes.server");
    let sync;
    try {
      sync = await sincronizarCliente(data.instancia, clienteId!, payload, {
        vendedorSap: consultorSap,
        ownerSfId: consultorSfId,
      });
    } catch (err) {
      await logErroBanco("sincronizar", err);
      throw err;
    }

    return { id: clienteId!, sync };

  });

/** Reenvia um cadastro já salvo para o SAP e o Salesforce. */
export const reenviarClienteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        instancia: instanciaSchema,
        id: z.string().uuid(),
        alvos: z.array(z.enum(["sap", "salesforce", "contatos"])).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const cliente = await assertPodeAlterarCliente(context as any, data.instancia, data.id);
    const { data: dono } = await context.supabase
      .from("profiles")
      .select("numero_sap, sf_user_id")
      .eq("id", (cliente as any)?.created_by ?? context.userId)
      .maybeSingle();
    const { sincronizarCliente } = await import("./clientes-integracoes.server");
    return sincronizarCliente(data.instancia, data.id, cliente as Record<string, any>, {
      vendedorSap: (dono as any)?.numero_sap ?? null,
      ownerSfId: (dono as any)?.sf_user_id ?? null,
      ...(data.alvos && data.alvos.length ? { alvos: data.alvos } : {}),
    });
  });

/**
 * Revalida o CNPJ de um cadastro nas fontes oficiais (Serpro + CNPJá).
 * `aplicar = false` só compara (dry-run); `aplicar = true` grava as diferenças.
 */
export const revalidarCnpjClienteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        instancia: instanciaSchema,
        id: z.string().uuid(),
        aplicar: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const cliente = await assertPodeAlterarCliente(context as any, data.instancia, data.id);
    const doc = String((cliente as any)?.doc ?? "").replace(/\D/g, "");
    if (doc.length !== 14) {
      return {
        ok: false as const,
        doc,
        fontes: [] as string[],
        avisos: ["Cadastro sem CNPJ válido — revalidação disponível apenas para CNPJ."],
        alteracoes: [] as Array<{ campo: string; de: string; para: string }>,
        aplicado: false as const,
      };
    }

    const { enrichCnpj } = await import("./cnpj-enrich.server");
    const { logIntegrationEvent } = await import("./integration-logs.server");
    const e = await enrichCnpj(doc);

    const novos: Record<string, unknown> = {
      razao_social: e.razao_social,
      situacao_cadastral: e.situacao_cadastral,
      data_abertura: e.data_abertura,
      natureza_juridica: e.natureza_juridica,
      porte: e.porte,
      cnae_principal_codigo: e.cnae_principal?.codigo ?? null,
      cnae_principal_descricao: e.cnae_principal?.descricao ?? null,
      cnaes_secundarios: e.cnaes_secundarios,
      ie: e.ie,
      ie_situacao: e.ie_situacao,
      suframa: e.suframa,
      suframa_situacao: e.suframa_situacao,
      contribuinte: !!e.ie,
      regime_tributario: e.regime_tributario,
      cep: e.cep,
      logradouro: e.logradouro,
      numero: e.numero,
      complemento: e.complemento,
      bairro: e.bairro,
      cidade: e.cidade,
      uf: e.uf,
      municipio_ibge: e.municipio_ibge,
    };

    const norm = (v: unknown) =>
      v === null || v === undefined || v === "" ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    const alteracoes = Object.entries(novos)
      .filter(([, v]) => norm(v) !== "")
      .filter(([campo, v]) => norm((cliente as any)?.[campo]) !== norm(v))
      .map(([campo, v]) => ({ campo, de: norm((cliente as any)?.[campo]), para: norm(v), valor: v }));

    let aplicado = false;
    if (data.aplicar && alteracoes.length > 0 && e.fontes.length > 0) {
      const db = await import("./clientes-db.server");
      const patch: Record<string, unknown> = {};
      for (const a of alteracoes) patch[a.campo] = a.valor;
      await db.updateCliente(data.instancia, data.id, patch);
      aplicado = true;
    }

    await logIntegrationEvent({
      slug: "clientes-cadastro",
      level: e.fontes.length === 0 ? "error" : e.avisos.length ? "warn" : "info",
      event: aplicado ? "cadastro.cnpj.revalidado" : "cadastro.cnpj.consultado",
      message:
        e.fontes.length === 0
          ? `Revalidação do CNPJ ${doc} falhou: nenhuma fonte respondeu.`
          : `${aplicado ? "Revalidação aplicada" : "Revalidação consultada"} para ${(cliente as any)?.razao_social ?? doc} (${doc}) — ${alteracoes.length} divergência(s). Fontes: ${e.fontes.join(", ")}.`,
      actorId: context.userId,
      detail: {
        cliente_id: data.id,
        instancia: data.instancia,
        doc,
        fontes: e.fontes,
        avisos: e.avisos,
        alteracoes: alteracoes.map(({ campo, de, para }) => ({ campo, de, para })),
        aplicado,
      },
    });

    return {
      ok: e.fontes.length > 0,
      doc,
      fontes: e.fontes,
      avisos: e.avisos,
      alteracoes: alteracoes.map(({ campo, de, para }) => ({ campo, de, para })),
      aplicado,
    };
  });

/** Testa isoladamente banco, SAP, Salesforce ou contatos (sem alterar dados). */
export const testarIntegracoesClienteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        instancia: instanciaSchema,
        id: z.string().uuid().optional(),
        alvos: z.array(z.enum(["banco", "sap", "salesforce", "contatos"])).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.id) await assertPodeAlterarCliente(context as any, data.instancia, data.id);
    const { testarIntegracoes } = await import("./integracoes-diagnostico.server");
    return { resultados: await testarIntegracoes(data.instancia, data.alvos, data.id ?? null) };
  });


/**
 * Finalidade de uso vigente no cadastro do cliente (fonte única de verdade).
 * Usada por propostas antigas e novas — a proposta nunca guarda escolha própria.
 */
export const finalidadeUsoPorDocFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ doc: docSchema }).parse(input))
  .handler(async ({ data }) => {
    const db = await import("./clientes-db.server");
    const achados = await db.findClienteByDoc(data.doc);
    const cliente = achados[0]?.cliente ?? null;
    return { finalidade: (cliente?.["finalidade"] as string | null) ?? null };
  });

export const excluirClienteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ instancia: instanciaSchema, id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await import("./clientes-db.server");
    const atual = await assertPodeAlterarCliente(context as any, data.instancia, data.id);
    await db.deleteCliente(data.instancia, data.id);
    try {
      const { recordModeration } = await import("./moderation-audit.server");
      await recordModeration(
        { supabase: context.supabase, userId: context.userId },
        {
          area: "clientes",
          instanceId: data.instancia,
          action: "delete",
          target: String(atual?.["razao_social"] ?? data.id),
          summary: `Cadastro de cliente excluído (${atual?.["doc"] ?? data.id})`,
          details: { id: data.id, instancia: data.instancia },
        },
      );
    } catch (err) {
      console.error("[clientes] falha ao registrar auditoria de exclusão", err);
    }
    return { ok: true };
  });

/** Migração única dos cadastros antigos (carregadores_clientes) para a nova tabela. */
export const migrarCarregadoresClientesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Apenas administradores podem migrar cadastros.");

    const db = await import("./clientes-db.server");
    const { data: antigos, error } = await context.supabase.from("carregadores_clientes").select("*");
    if (error) throw error;

    const existentes = new Set(
      (await db.listClientes("carregadores")).map((c) => String(c["doc"] ?? "")),
    );

    let migrados = 0;
    for (const c of antigos ?? []) {
      const doc = String(c.doc ?? "").replace(/\D/g, "");
      if (!doc || existentes.has(doc)) continue;
      await db.insertCliente("carregadores", {
        razao_social: c.razao_social,
        nome_fantasia: c.nome_fantasia,
        doc,
        ie: c.ie,
        contribuinte: c.contribuinte,
        regime_tributario: c.regime_tributario,
        email: c.email,
        telefone: c.telefone,
        site: c.site,
        contatos: c.contatos ?? [],
        contato_nome: c.contato_nome,
        contato_cargo: c.contato_cargo,
        contato_email: c.contato_email,
        contato_telefone: c.contato_telefone,
        cep: c.cep,
        logradouro: c.logradouro,
        numero: c.numero,
        complemento: c.complemento,
        bairro: c.bairro,
        cidade: c.cidade,
        uf: c.uf,
        condicao_pagamento: c.condicao_pagamento,
        observacoes: c.observacoes,
        ativo: c.ativo,
        organizacao: db.ORGANIZACAO.carregadores,
        instancia: "carregadores",
        created_by: c.created_by,
        created_at: c.created_at,
      });
      existentes.add(doc);
      migrados++;
    }
    return { migrados, total: (antigos ?? []).length };
  });

/** Verifica se as tabelas já foram criadas nos dois bancos. */
export const statusTabelasClientesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const db = await import("./clientes-db.server");
    return {
      solar: await db.clientesTableExists("solar"),
      carregadores: await db.clientesTableExists("carregadores"),
    };
  });
