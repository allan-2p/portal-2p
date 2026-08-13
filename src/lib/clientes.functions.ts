import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const instanciaSchema = z.enum(["solar", "carregadores"]);
const docSchema = z.string().min(11).max(20);

/**
 * Garante que o usuário é dono do cadastro (created_by) ou administrador.
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
  if (dono && dono === context.userId) return atual;
  const { data: isAdmin } = await context.supabase.rpc("is_admin");
  if (!isAdmin) {
    throw new Error("Você não tem permissão para alterar este cadastro.");
  }
  return atual;
}

/** Consulta a tabela `clientes` da instância. */
export const listClientesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ instancia: instanciaSchema }).parse(input))
  .handler(async ({ data }) => {
    const db = await import("./clientes-db.server");
    try {
      return { ok: true as const, clientes: await db.listClientes(data.instancia) };
    } catch (e) {
      if (e instanceof db.ClientesTableMissing) {
        return { ok: false as const, motivo: "tabela-ausente" as const, clientes: [] };
      }
      throw e;
    }
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
      cliente: clienteSchema,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await import("./clientes-db.server");
    const doc = data.cliente.doc.replace(/\D/g, "");

    // Duplicidade: mesmo documento em qualquer instância.
    const achados = await db.findClienteByDoc(doc);
    const conflito = achados.find((a) => a.cliente["id"] !== data.id);
    if (conflito) {
      throw new Error(
        `Este documento já está cadastrado em ${db.ORGANIZACAO[conflito.instancia]} (${conflito.cliente["razao_social"]}).`,
      );
    }

    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();

    const payload = {
      ...data.cliente,
      doc,
      organizacao: db.ORGANIZACAO[data.instancia],
      instancia: data.instancia,
    };

    if (data.id) {
      const row = await db.updateCliente(data.instancia, data.id, payload);
      return { id: row?.["id"] ?? data.id };
    }
    const row = await db.insertCliente(data.instancia, {
      ...payload,
      created_by: context.userId,
      created_by_nome: perfil?.full_name ?? null,
      created_by_email: perfil?.email ?? null,
    });
    return { id: row["id"] as string };
  });

export const excluirClienteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ instancia: instanciaSchema, id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const db = await import("./clientes-db.server");
    await db.deleteCliente(data.instancia, data.id);
    return { ok: true };
  });

/** Migração única dos cadastros antigos (cpo_clientes) para a nova tabela. */
export const migrarCpoClientesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Apenas administradores podem migrar cadastros.");

    const db = await import("./clientes-db.server");
    const { data: antigos, error } = await context.supabase.from("cpo_clientes").select("*");
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
