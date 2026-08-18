import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_task",
  title: "Criar tarefa",
  description: "Cria uma nova tarefa (carregadores_tarefas) para o usuário autenticado.",
  inputSchema: {
    titulo: z.string().trim().describe("Título da tarefa."),
    descricao: z.string().optional().describe("Descrição detalhada da tarefa."),
    cliente_nome: z.string().optional().describe("Nome do cliente relacionado."),
    due_date: z.string().optional().describe("Data de vencimento no formato AAAA-MM-DD."),
    prioridade: z.string().optional().describe("Prioridade da tarefa (ex.: alta, media, baixa)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ titulo, descricao, cliente_nome, due_date, prioridade }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    if (!titulo.trim()) {
      return { content: [{ type: "text", text: "Informe um título para a tarefa." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("carregadores_tarefas")
      .insert({
        titulo: titulo.trim(),
        descricao: descricao ?? null,
        cliente_nome: cliente_nome ?? null,
        due_date: due_date ?? null,
        ...(prioridade ? { prioridade } : {}),
        owner_id: ctx.getUserId(),
      })
      .select()
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { task: data },
    };
  },
});
