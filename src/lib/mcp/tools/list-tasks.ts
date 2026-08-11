import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_tasks",
  title: "Listar tarefas",
  description: "Lista as tarefas (cpo_tasks) visíveis para o usuário autenticado, opcionalmente filtradas por status.",
  inputSchema: {
    status: z.string().optional().describe("Filtra por status exato da tarefa (ex.: aberta, concluida)."),
    limit: z.number().int().optional().describe("Número máximo de tarefas retornadas (padrão 25, máximo 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const take = Math.min(Math.max(limit ?? 25, 1), 100);
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("cpo_tasks")
      .select("id, titulo, descricao, cliente_nome, due_date, prioridade, status, created_at")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(take);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { tasks: data ?? [] },
    };
  },
});
