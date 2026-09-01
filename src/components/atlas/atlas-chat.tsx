/**
 * Painel de conversa do Atlas (usado no chat lateral e na tela cheia).
 */
import { useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, AlertTriangle, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listarMensagensFn } from "@/lib/atlas.functions";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";

/** Rótulos amigáveis das consultas que o Atlas faz no meio da resposta. */
const FERRAMENTA_LABEL: Record<string, string> = {
  buscar_clientes: "Consultando clientes da carteira",
  resumo_cliente: "Abrindo o dossiê do cliente",
  desempenho_periodo: "Somando pedidos e propostas do período",
  minhas_metas: "Comparando meta x realizado",
  alertas_abertos: "Lendo os alertas do radar",
};

const SUGESTOES = [
  "Quais clientes da minha carteira caíram nos últimos 90 dias?",
  "Monte um plano de ação para o cliente com maior queda.",
  "Como está meu realizado contra a meta neste ano?",
];

export function AtlasChat({
  threadId,
  contexto,
  compacto = false,
}: {
  threadId: string;
  contexto?: string;
  compacto?: boolean;
}) {
  const carregarMensagens = useServerFn(listarMensagensFn);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const historico = useQuery({
    queryKey: ["atlas-mensagens", threadId],
    queryFn: async () => await carregarMensagens({ data: { threadId } }),
    staleTime: 0,
  });

  const iniciais: UIMessage[] = useMemo(
    () =>
      (historico.data ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        parts: (Array.isArray(m.parts) ? m.parts : []) as UIMessage["parts"],
      })),
    [historico.data],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/atlas-chat",
        // O token vai no fetch para poder ser lido de forma assíncrona.
        fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers = new Headers(init?.headers);
          if (token) headers.set("Authorization", `Bearer ${token}`);
          return fetch(input, { ...init, headers });
        }) as typeof fetch,
        body: () => ({ threadId, contexto }),
      }),
    [threadId, contexto],
  );

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: threadId,
    transport,
    onError: (e) => toast.error(e.message || "O Atlas não conseguiu responder agora."),
  });

  // Restaura o histórico salvo ao abrir/trocar de conversa.
  useEffect(() => {
    if (historico.isSuccess) setMessages(iniciais);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historico.isSuccess, threadId, iniciais]);

  useEffect(() => {
    if (status === "ready") inputRef.current?.focus();
  }, [status, threadId]);

  const ocupado = status === "submitted" || status === "streaming";

  async function enviar(texto: string) {
    const t = texto.trim();
    if (!t || ocupado) return;
    await sendMessage({ text: t });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className={compacto ? "gap-6 p-3" : undefined}>
          {messages.length === 0 && (
            <ConversationEmptyState
              icon={<Sparkles className="h-6 w-6" />}
              title="Fale com o Atlas"
              description="Peça insights e planos de ação por cliente e por período."
            >
              <div className="mt-2 flex w-full flex-col gap-2">
                {SUGESTOES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void enviar(s)}
                    className="rounded-lg border border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </ConversationEmptyState>
          )}

          {messages.map((m) => {
            const texto = m.parts
              .map((p) => (p.type === "text" ? p.text : ""))
              .join("")
              .trim();
            const ferramentas = m.parts.filter((p) => p.type.startsWith("tool-"));
            if (!texto && ferramentas.length === 0) return null;
            return (
              <Message from={m.role} key={m.id}>
                <MessageContent>
                  {ferramentas.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {ferramentas.map((p, i) => {
                        const nome = p.type.replace(/^tool-/, "");
                        const estado = (p as { state?: string }).state ?? "";
                        const pronto = estado.includes("output") || estado.includes("result");
                        return (
                          <span
                            key={`${m.id}-${nome}-${i}`}
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {pronto ? (
                              <Check className="h-3 w-3 text-success" />
                            ) : (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            )}
                            {FERRAMENTA_LABEL[nome] ?? nome}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {texto ? (
                    <MessageResponse>{texto}</MessageResponse>
                  ) : (
                    <span className="text-xs text-muted-foreground">Consultando os dados…</span>
                  )}
                </MessageContent>
              </Message>
            );
          })}

          {status === "submitted" && (
            <Message from="assistant">
              <MessageContent>
                <span className="text-xs text-muted-foreground">O Atlas está pensando…</span>
              </MessageContent>
            </Message>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error.message}</span>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border p-3">
        <PromptInput
          onSubmit={async (msg, event) => {
            event.preventDefault();
            const texto = msg.text ?? "";
            (event.currentTarget as HTMLFormElement).reset();
            await enviar(texto);
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea
              ref={inputRef}
              autoFocus
              placeholder="Pergunte sobre um cliente, período ou meta…"
            />
          </PromptInputBody>
          <PromptInputFooter>
            <span className="pl-1 text-[11px] text-muted-foreground">
              O Atlas responde com os dados que você tem acesso.
            </span>
            <PromptInputSubmit status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
