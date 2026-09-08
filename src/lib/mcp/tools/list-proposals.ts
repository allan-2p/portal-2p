import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { listarPropostas } from "@/lib/propostas-db.server";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_proposals",
  title: "Listar propostas",
  description: "Lista as propostas comerciais (propostas) visíveis para o usuário autenticado.",
  inputSchema: {
    status: z.string().optional().describe("Filtra por status da proposta (ex.: rascunho, enviada, aprovada)."),
    instancia: z
      .enum(["solar", "carregadores"])
      .optional()
      .describe("Instância usada para checar as permissões (padrão: solar)."),
    limit: z.number().int().optional().describe("Número máximo de propostas retornadas (padrão 20, máximo 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit, instancia }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }

    // A leitura precisa passar exatamente pelas mesmas checagens do portal:
    // permissão de objeto + escopo do consultor. Sem isso o service role do
    // banco do Grupo 2P devolveria propostas de toda a empresa.
    const supabase = supabaseForUser(ctx);
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (userErr || !userId) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }

    const inst = (instancia ?? "solar") as "solar" | "carregadores";
    const permCtx = { supabase, userId };

    const take = Math.min(Math.max(limit ?? 20, 1), 100);
    let data: Record<string, unknown>[] = [];
    try {
      const { assertPodeLer, getPerm } = await import("@/lib/object-perms.server");
      const perm = await getPerm(permCtx as any, inst, "propostas");
      assertPodeLer(perm, "propostas");

      const rows = await listarPropostas({
        // created_by/consultor_id/sap_vendedor_codigo/cliente_doc são
        // necessários para aplicar o escopo do consultor.
        select:
          "id,numero,cliente_nome,cliente_doc,uf,status,totais,created_at,updated_at,created_by,consultor_id,sap_vendedor_codigo",
        limit: take,
        ...(status ? { statusIn: [status] } : {}),
      });

      const { escopoDoConsultor, registroNoEscopo } = await import("@/lib/escopo-consultor.server");
      const escopo = await escopoDoConsultor(permCtx as any, inst, perm);
      data = (rows as Record<string, unknown>[]).filter((r) => registroNoEscopo(r, escopo));
    } catch (e) {
      return { content: [{ type: "text", text: (e as Error).message }], isError: true };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { proposals: data },
    };
  },
});
