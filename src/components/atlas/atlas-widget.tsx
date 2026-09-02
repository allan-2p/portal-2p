/**
 * Chat lateral do Atlas: botão flutuante arrastável na lateral direita e painel
 * com a lista de conversas do usuário.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquarePlus, X, Radar, Trash2, Maximize2, History, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AtlasChatLazy as AtlasChat } from "./atlas-chat-lazy";
import { AtlasIcon } from "./atlas-icon";
import { criarThreadFn, excluirThreadFn, listarThreadsFn } from "@/lib/atlas.functions";
import { useAuth } from "@/hooks/use-auth";

const ABERTO_KEY = "portal2p-atlas-open";
const THREAD_KEY = "portal2p-atlas-thread";
const OFFSET_Y_KEY = "portal2p-atlas-offset-y";

export function AtlasWidget() {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [aberto, setAberto] = useState(false);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [offsetY, setOffsetY] = useState(0);
  const qc = useQueryClient();

  const dragRef = useRef<{ startY: number; startOffset: number; moved: boolean } | null>(null);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(OFFSET_Y_KEY);
    if (saved) setOffsetY(Number(saved) || 0);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(OFFSET_Y_KEY, String(offsetY));
  }, [offsetY]);

  const clampOffset = (next: number) => {
    if (typeof window === "undefined") return next;
    const padding = 80;
    const max = Math.max(0, (window.innerHeight - padding * 2) / 2 - 40);
    return Math.max(-max, Math.min(max, next));
  };

  // O arrasto é acompanhado no window: se ficasse no botão, sair da área
  // (poucos pixels) encerraria o movimento antes de reposicionar o ícone.
  const startDrag = (clientY: number) => {
    if (typeof window === "undefined") return;
    dragRef.current = { startY: clientY, startOffset: offsetY, moved: false };
    moveuRef.current = false;

    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      ev.preventDefault();
      const delta = ev.clientY - d.startY;
      if (Math.abs(delta) > 4) {
        d.moved = true;
        moveuRef.current = true;
      }
      setOffsetY(clampOffset(d.startOffset + delta));
    };
    const endDrag = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      // Zera só depois do click, que dispara logo após o pointerup.
      window.setTimeout(() => {
        moveuRef.current = false;
      }, 0);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  };

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
        <div
          className="fixed right-0 top-1/2 z-20 -translate-y-1/2"
          style={{ transform: `translateY(calc(-50% + ${offsetY}px))` }}
        >
          <Button
            size="icon"
            onClick={() => {
              if (moveuRef.current) return;
              setAberto(true);
            }}
            onPointerDown={(e) => startDrag(e.clientY)}
            style={{ touchAction: "none" }}
            aria-label="Abrir o chat do Atlas"
            title="Arraste para cima/baixo · clique para abrir o Atlas"
            className="relative h-11 w-9 cursor-grab rounded-l-full rounded-r-none border border-r-0 border-primary-foreground/20 bg-primary/80 text-primary-foreground shadow-md opacity-70 transition-[width,opacity] hover:w-11 hover:bg-primary hover:opacity-100 focus-visible:w-11 focus-visible:opacity-100 active:cursor-grabbing sm:h-12 sm:w-10 sm:hover:w-12 sm:focus-visible:w-12"
          >
            <AtlasIcon className="h-5 w-5" />
            <GripVertical className="pointer-events-none absolute left-0.5 h-3 w-3 opacity-40" />
          </Button>
        </div>
      )}

      {aberto && (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden border border-border bg-card shadow-2xl",
            "inset-x-0 bottom-0 top-0 sm:inset-auto sm:right-5 sm:top-20 sm:h-[min(640px,calc(100vh-6rem))] sm:w-[420px] sm:rounded-2xl",
          )}
          role="dialog"
          aria-label="Chat do Atlas"
        >
          <header className="flex items-center gap-2 border-b border-border px-3 py-2">
            <AtlasIcon className="h-4 w-4 text-primary" />
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
