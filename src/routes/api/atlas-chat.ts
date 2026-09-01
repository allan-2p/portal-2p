/**
 * Streaming do chat do Atlas.
 *
 * A rota devolve uma Response de streaming (por isso é rota HTTP e não server
 * function). A autorização usa o bearer do Supabase; as ferramentas de dados
 * só enxergam o que o usuário pode ver.
 */
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider, ATLAS_MODEL, mensagemErroGateway } from "@/lib/ai-gateway.server";
import { autenticarRequest, type AtlasCtx } from "@/lib/atlas-auth.server";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function instrucoes(hoje: string, contexto: string): string {
  return [
    "Você é o Atlas, copiloto comercial do Portal 2P (2P Solar e 2P Carregadores).",
    "Responda sempre em português do Brasil, direto ao ponto, com números concretos.",
    `Hoje é ${hoje}.`,
    "Use as ferramentas para buscar dados reais antes de afirmar qualquer número — nunca invente valores.",
    "Quando o usuário pedir insights ou plano de ação, entregue: (1) diagnóstico curto com números, (2) 3 a 5 ações objetivas com prazo sugerido, (3) risco principal.",
    "Se os dados forem insuficientes, diga o que falta em vez de estimar.",
    "Aceite perguntas abertas e conversa livre: se a pergunta não exigir dados, responda como um consultor comercial experiente (argumentação de venda, negociação, follow-up, objeções).",
    "Se a pergunta estiver fora do que você consegue consultar, explique em uma linha o que você tem hoje (clientes, pedidos/propostas, metas e alertas do radar) e siga ajudando com o que dá.",
    "Valores em reais no formato brasileiro. Nunca exponha IDs internos, tokens ou detalhes técnicos.",
    contexto ? `Contexto da tela em que o usuário está: ${contexto}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Conversas interrompidas podem ter ficado com uma chamada de ferramenta sem
 * resultado salvo — isso quebra as próximas requisições
 * (AI_MissingToolResultsError). Removemos essas partes do histórico.
 */
function sanearHistorico(messages: UIMessage[]): UIMessage[] {
  return messages
    .map((m) => {
      const parts = (m.parts ?? []).filter((p) => {
        const tipo = String((p as { type?: string }).type ?? "");
        if (!tipo.startsWith("tool-") && tipo !== "dynamic-tool") return true;
        const estado = String((p as { state?: string }).state ?? "");
        return estado === "output-available" || estado === "output-error";
      });
      return { ...m, parts } as UIMessage;
    })
    .filter((m) => (m.parts ?? []).length > 0);
}

function ferramentas(ctx: AtlasCtx) {
  return {
    buscar_clientes: tool({
      description:
        "Busca clientes da carteira do usuário por nome, cidade, documento (CNPJ/CPF) ou código SAP.",
      inputSchema: z.object({
        termo: z.string().describe("Texto da busca. Vazio lista os primeiros clientes."),
        limite: z.number().int().min(1).max(30).optional(),
      }),
      execute: async ({ termo, limite }) => {
        const { buscarClientes } = await import("@/lib/atlas-dados.server");
        const rows = await buscarClientes(ctx, { termo, limite: limite ?? 10 });
        return {
          total: rows.length,
          clientes: rows.map((c) => ({
            nome: c.nome,
            documento: c.doc,
            unidade: c.instancia,
            cidade: c.cidade,
            uf: c.uf,
            consultor: c.consultor_nome,
            codigo_sap: c.numero_sap,
          })),
        };
      },
    }),

    resumo_cliente: tool({
      description:
        "Histórico comercial de um cliente: pedidos, faturamento, ticket médio, última compra e status atuais no período.",
      inputSchema: z.object({
        documento: z.string().describe("CNPJ ou CPF do cliente (com ou sem pontuação)."),
        dias: z.number().int().min(30).max(1095).optional().describe("Janela em dias (padrão 365)."),
      }),
      execute: async ({ documento, dias }) => {
        const dados = await import("@/lib/atlas-dados.server");
        const cliente = await dados.clientePorDoc(documento);
        if (!cliente) return { encontrado: false, motivo: "Cliente não encontrado no cadastro." };
        const janela = dias ?? 365;
        const { inicio, fim } = dados.periodoPadrao(janela);
        const rows = await dados.propostasNoEscopo(ctx, { clienteDoc: cliente.doc, inicio, fim });
        const resumo = dados.resumirPeriodo(rows);
        const ultima = rows
          .filter((r) => dados.STATUS_GERACAO.includes(String(r.status)))
          .map((r) => r.created_at)
          .filter(Boolean)
          .sort()
          .pop();
        return {
          encontrado: true,
          cliente: {
            nome: cliente.nome,
            documento: cliente.doc,
            unidade: cliente.instancia,
            cidade: cliente.cidade,
            uf: cliente.uf,
            consultor: cliente.consultor_nome,
          },
          periodo: { inicio, fim, dias: janela },
          pedidos: resumo.pedidos,
          faturamento: brl(resumo.valor),
          ticket_medio: brl(resumo.ticketMedio),
          ultima_compra: ultima ? String(ultima).slice(0, 10) : null,
          por_status: resumo.porStatus,
          ultimos_pedidos: rows.slice(0, 10).map((r) => ({
            numero: r.numero,
            status: r.status,
            unidade: r.organizacao,
            data: r.created_at ? String(r.created_at).slice(0, 10) : null,
            valor: brl(r.valor),
          })),
        };
      },
    }),

    desempenho_periodo: tool({
      description:
        "Faturamento e pedidos do período no escopo do usuário, com ranking de clientes. Use para comparar períodos.",
      inputSchema: z.object({
        inicio: z.string().describe("Data inicial YYYY-MM-DD"),
        fim: z.string().describe("Data final YYYY-MM-DD"),
        unidade: z.enum(["solar", "carregadores"]).optional(),
      }),
      execute: async ({ inicio, fim, unidade }) => {
        const dados = await import("@/lib/atlas-dados.server");
        const rows = await dados.propostasNoEscopo(ctx, {
          inicio,
          fim,
          organizacao: unidade ?? null,
        });
        const resumo = dados.resumirPeriodo(rows);
        const porCliente = new Map<string, { nome: string; valor: number; pedidos: number }>();
        for (const r of rows) {
          if (!dados.STATUS_GERACAO.includes(String(r.status))) continue;
          const k = r.cliente_doc ?? r.cliente_nome ?? "—";
          const atual = porCliente.get(k) ?? { nome: r.cliente_nome ?? k, valor: 0, pedidos: 0 };
          atual.valor += r.valor;
          atual.pedidos += 1;
          porCliente.set(k, atual);
        }
        const top = [...porCliente.values()].sort((a, b) => b.valor - a.valor).slice(0, 10);
        return {
          periodo: { inicio, fim, unidade: unidade ?? "todas" },
          pedidos: resumo.pedidos,
          faturamento: brl(resumo.valor),
          ticket_medio: brl(resumo.ticketMedio),
          por_status: resumo.porStatus,
          top_clientes: top.map((c) => ({ cliente: c.nome, pedidos: c.pedidos, valor: brl(c.valor) })),
        };
      },
    }),

    minhas_metas: tool({
      description: "Meta mensal de faturamento do usuário no ano e o realizado mês a mês.",
      inputSchema: z.object({ ano: z.number().int().min(2020).max(2100).optional() }),
      execute: async ({ ano }) => {
        const dados = await import("@/lib/atlas-dados.server");
        const alvo = ano ?? new Date().getFullYear();
        const perfil = await dados.perfilDoUsuario(ctx);
        const metas = await dados.metasDoUsuario(ctx, perfil?.["sf_user_id"] ?? null, alvo);
        const rows = await dados.propostasNoEscopo(ctx, {
          inicio: `${alvo}-01-01`,
          fim: `${alvo}-12-31`,
          somenteGeracao: true,
        });
        const realizado = new Map<number, number>();
        for (const r of rows) {
          const m = r.created_at ? new Date(String(r.created_at)).getUTCMonth() + 1 : 0;
          if (!m) continue;
          realizado.set(m, (realizado.get(m) ?? 0) + r.valor);
        }
        return {
          ano: alvo,
          consultor: perfil?.["full_name"] ?? null,
          meses: Array.from({ length: 12 }, (_, i) => i + 1).map((m) => ({
            mes: m,
            meta: brl(metas.find((x) => x.mes === m)?.meta ?? 0),
            realizado: brl(realizado.get(m) ?? 0),
          })),
        };
      },
    }),

    alertas_abertos: tool({
      description: "Alertas de piora de clientes gerados pelo radar do Atlas que ainda estão abertos.",
      inputSchema: z.object({ limite: z.number().int().min(1).max(30).optional() }),
      execute: async ({ limite }) => {
        const { data } = await ctx.supabase
          .from("atlas_alertas")
          .select("cliente_nome, instancia, severidade, resumo, recomendacao, sinais, created_at")
          .eq("situacao", "aberto")
          .order("score", { ascending: false })
          .limit(limite ?? 10);
        return { alertas: data ?? [] };
      },
    }),
  };
}

export const Route = createFileRoute("/api/atlas-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await autenticarRequest(request);
        if (!ctx) return new Response("Unauthorized", { status: 401 });

        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response(mensagemErroGateway(401), { status: 500 });

        const body = (await request.json().catch(() => ({}))) as {
          messages?: UIMessage[];
          threadId?: string;
          contexto?: string;
        };
        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (!messages.length) return new Response("Mensagens ausentes.", { status: 400 });
        const threadId = String(body.threadId ?? "");
        if (!threadId) return new Response("Conversa ausente.", { status: 400 });

        // A conversa precisa ser do usuário (RLS garante, mas falhamos cedo).
        const { data: thread } = await ctx.supabase
          .from("atlas_threads")
          .select("id, titulo")
          .eq("id", threadId)
          .maybeSingle();
        if (!thread) return new Response("Conversa não encontrada.", { status: 404 });

        const ultima = messages[messages.length - 1] as UIMessage;
        const { salvarMensagem } = await import("@/lib/atlas-mensagens.server");
        await salvarMensagem(ctx, threadId, ultima);

        // Primeira pergunta vira o título da conversa.
        if (!thread.titulo || thread.titulo === "Nova conversa") {
          const texto = (ultima?.parts ?? [])
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join(" ")
            .trim();
          if (texto) {
            await ctx.supabase
              .from("atlas_threads")
              .update({ titulo: texto.slice(0, 60) })
              .eq("id", threadId);
          }
        }

        console.log("[atlas-dbg]", JSON.stringify(sanearHistorico(messages).map(m=>({r:m.role,p:(m.parts??[]).map(x=>({t:(x as any).type,s:(x as any).state}))}))));
        const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
        const gateway = createLovableAiGatewayProvider(key);

        try {
          const result = streamText({
            model: gateway(ATLAS_MODEL),
            system: instrucoes(hoje, String(body.contexto ?? "")),
            messages: await convertToModelMessages(sanearHistorico(messages), {
              ignoreIncompleteToolCalls: true,
            }),
            tools: ferramentas(ctx),
            stopWhen: stepCountIs(8),
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages,
            onFinish: async ({ responseMessage }) => {
              await salvarMensagem(ctx, threadId, responseMessage as UIMessage);
            },
          });
        } catch (e) {
          const status = Number((e as { statusCode?: number; status?: number })?.statusCode ?? (e as any)?.status ?? 500);
          console.error("[atlas-chat]", status, e);
          return new Response(mensagemErroGateway(status), { status: status >= 400 ? status : 500 });
        }
      },
    },
  },
});
