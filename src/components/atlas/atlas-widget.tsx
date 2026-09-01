/**
 * Chat lateral do Atlas: botão flutuante no canto inferior direito e painel
 * com a lista de conversas do usuário.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquarePlus, Sparkles, X, Radar, Trash2, Maximize2, History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AtlasChat } from "./atlas-chat";
import { criarThreadFn, excluirThreadFn, listarThreadsFn } from "@/lib/atlas.functions";
import { useAuth } from "@/hooks/use-auth";

const ABERTO_KEY = "portal2p-atlas-open";
const THREAD_KEY = "portal2p-atlas-thread";

export function AtlasWidget() {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [aberto, setAberto] = useState(false);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const qc = useQueryClient();

  const listar = useServerFn(listarThreadsFn);
  const criar = useServerFn(criarThreadFn);
  const excluir = useServerFn(excluirThreadFn);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAberto(window.localStorage.getItem(ABERTO_KEY) === "1");
    setThreadId(window.localStorage.getItem(THREAD_KEY));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ABERTO_KEY, aberto ? "1" : "0");
  }, [aberto]);

  useEffect(() => {
    if (typeof window === "undefined" || !threadId) return;
    window.localStorage.setItem(THREAD_KEY, threadId);
  }, [threadId]);

  const threads = useQuery({
    queryKey: ["atlas-threads"],
    queryFn: async () => await listar(),
    enabled: Boolean(user) && aberto,
  });

  // Sem conversa selecionada: usa a mais recente ou cria uma nova.
  const novaConversa = useMutation({
    mutationFn: async () => await criar({ data: {} }),
    onSuccess: (t) => {
      setThreadId(t.id);
      setMostrarLista(false);
      void qc.invalidateQueries({ queryKey: ["atlas-threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!aberto || !threads.isSuccess) return;
    // Id guardado no navegador pode apontar para uma conversa já excluída.
    if (threadId && !threads.data.some((t) => t.id === threadId)) {
      setThreadId(null);
      if (typeof window !== "undefined") window.localStorage.removeItem(THREAD_KEY);
      return;
    }
    if (threadId) return;
    const primeira = threads.data[0];
    if (primeira) setThreadId(primeira.id);
    else if (!novaConversa.isPending) novaConversa.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, threads.isSuccess, threads.data, threadId]);


  const apagar = useMutation({
    mutationFn: async (id: string) => await excluir({ data: { id } }),
    onSuccess: (_r, id) => {
      if (id === threadId) setThreadId(null);
      void qc.invalidateQueries({ queryKey: ["atlas-threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const contexto = useMemo(() => `o usuário está na tela ${pathname}`, [pathname]);

  // Não exibe o botão flutuante dentro das telas de proposta (criação, edição,
  // visualização) para não competir com o formulário/composer da proposta.
  const esconderNaProposta =
    pathname.startsWith("/carregadores/propostas") || pathname.startsWith("/solar/propostas");

  if (!user || esconderNaProposta) return null;

  return (
    <>
      {!aberto && (
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir o chat do Atlas"
          className="fixed bottom-5 right-5 z-40 flex h-13 items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
        >
          <Sparkles className="h-4 w-4" />
          Atlas
        </button>
      )}

      {aberto && (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden border border-border bg-card shadow-2xl",
            "inset-x-0 bottom-0 top-0 sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(640px,calc(100vh-6rem))] sm:w-[420px] sm:rounded-2xl",
          )}
          role="dialog"
          aria-label="Chat do Atlas"
        >
          <header className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Atlas</span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                title="Conversas"
                onClick={() => setMostrarLista((v) => !v)}
              >
                <History className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Nova conversa"
                onClick={() => novaConversa.mutate()}
              >
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" title="Radar do Atlas" asChild>
                <Link to="/atlas-ia/radar" onClick={() => setAberto(false)}>
                  <Radar className="h-4 w-4" />
                </Link>
              </Button>
              {threadId && (
                <Button variant="ghost" size="icon-sm" title="Abrir em tela cheia" asChild>
                  <Link
                    to="/atlas-ia/$threadId"
                    params={{ threadId }}
                    onClick={() => setAberto(false)}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Link>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                title="Fechar"
                onClick={() => setAberto(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {mostrarLista && (
            <div className="max-h-56 overflow-y-auto border-b border-border">
              {(threads.data ?? []).length === 0 && (
                <p className="p-3 text-xs text-muted-foreground">Nenhuma conversa ainda.</p>
              )}
              {(threads.data ?? []).map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm",
                    t.id === threadId ? "bg-primary/10" : "hover:bg-surface-2",
                  )}
                >
                  <button
                    type="button"
                    className="flex-1 truncate text-left"
                    onClick={() => {
                      setThreadId(t.id);
                      setMostrarLista(false);
                    }}
                  >
                    {t.titulo}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Excluir conversa"
                    onClick={() => apagar.mutate(t.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1">
            {threadId ? (
              <AtlasChat threadId={threadId} contexto={contexto} compacto />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">Preparando sua conversa…</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
