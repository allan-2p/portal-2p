import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_clientes",
  title: "Listar clientes",
  description: "Busca clientes cadastrados (cpo_clientes) por razão social, nome fantasia ou documento.",
  inputSchema: {
    search: z.string().optional().describe("Texto para buscar na razão social, nome fantasia ou CNPJ."),
    limit: z.number().int().optional().describe("Número máximo de clientes retornados (padrão 25, máximo 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const take = Math.min(Math.max(limit ?? 25, 1), 100);
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("cpo_clientes")
      .select("id, razao_social, nome_fantasia, doc, cidade, uf, ativo, email, telefone")
      .order("razao_social", { ascending: true })
      .limit(take);
    if (search) {
      const term = search.replace(/[%,]/g, " ").trim();
      query = query.or(
        `razao_social.ilike.%${term}%,nome_fantasia.ilike.%${term}%,doc.ilike.%${term}%`,
      );
    }
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { clientes: data ?? [] },
    };
  },
});
