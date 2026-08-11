import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_proposals",
  title: "Listar propostas",
  description: "Lista as propostas comerciais (cpo_proposals) visíveis para o usuário autenticado.",
  inputSchema: {
    status: z.string().optional().describe("Filtra por status da proposta (ex.: rascunho, enviada, aprovada)."),
    limit: z.number().int().optional().describe("Número máximo de propostas retornadas (padrão 20, máximo 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const take = Math.min(Math.max(limit ?? 20, 1), 100);
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("cpo_proposals")
      .select("id, numero, cliente_nome, uf, status, totais, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(take);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { proposals: data ?? [] },
    };
  },
});
