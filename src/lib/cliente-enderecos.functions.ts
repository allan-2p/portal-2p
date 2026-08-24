import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const instanciaSchema = z.enum(["solar", "carregadores"]);

export type ClienteEndereco = {
  id: string;
  apelido: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  contato: string | null;
  telefone: string | null;
  observacoes: string | null;
  favorito: boolean;
};

const mapa = (r: any): ClienteEndereco => ({
  id: r.id,
  apelido: r.apelido ?? null,
  cep: r.cep ?? null,
  logradouro: r.logradouro ?? null,
  numero: r.numero ?? null,
  complemento: r.complemento ?? null,
  bairro: r.bairro ?? null,
  cidade: r.cidade ?? null,
  uf: r.uf ?? null,
  contato: r.contato ?? null,
  telefone: r.telefone ?? null,
  observacoes: r.observacoes ?? null,
  favorito: !!r.favorito,
});

/** Endereços de entrega do cliente (por id do cadastro ou por CNPJ). */
export const listEnderecosClienteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clienteId: z.string().uuid().optional(), doc: z.string().optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; enderecos: ClienteEndereco[]; erro?: string }> => {
    const db = await import("./cliente-enderecos.server");
    try {
      const rows = data.clienteId
        ? await db.listEnderecos(data.clienteId)
        : await db.listEnderecosPorDoc(data.doc ?? "");
      return { ok: true, enderecos: rows.map(mapa) };
    } catch (e) {
      if (e instanceof db.EnderecosTableMissing) return { ok: false, enderecos: [], erro: e.message };
      throw e;
    }
  });

/** Cria/atualiza um endereço de entrega. */
export const salvarEnderecoClienteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        instancia: instanciaSchema,
        clienteId: z.string().uuid(),
        clienteDoc: z.string(),
        endereco: z.object({
          id: z.string().uuid().nullish(),
          apelido: z.string().nullish(),
          cep: z.string().nullish(),
          logradouro: z.string().nullish(),
          numero: z.string().nullish(),
          complemento: z.string().nullish(),
          bairro: z.string().nullish(),
          cidade: z.string().nullish(),
          uf: z.string().nullish(),
          contato: z.string().nullish(),
          telefone: z.string().nullish(),
          observacoes: z.string().nullish(),
          favorito: z.boolean().nullish(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; endereco: ClienteEndereco }> => {
    const e = data.endereco;
    if (!e.logradouro?.trim() || !e.cidade?.trim() || !e.uf?.trim()) {
      throw new Error("Informe ao menos logradouro, cidade e UF do endereço de entrega.");
    }
    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const db = await import("./cliente-enderecos.server");
    const row = await db.salvarEndereco(
      data.instancia,
      { id: data.clienteId, doc: data.clienteDoc },
      e,
      { id: context.userId, nome: perfil?.full_name || perfil?.email || null },
    );
    return { ok: true, endereco: mapa(row) };
  });

/** Marca um endereço como favorito (o anterior deixa de ser). */
export const favoritarEnderecoClienteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clienteId: z.string().uuid(), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await import("./cliente-enderecos.server");
    await db.definirFavorito(data.clienteId, data.id);
    return { ok: true };
  });

export const excluirEnderecoClienteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await import("./cliente-enderecos.server");
    await db.excluirEndereco(data.id);
    return { ok: true };
  });
