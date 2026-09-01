import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageSquarePlus, Radar, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { AtlasChatLazy as AtlasChat } from "@/components/atlas/atlas-chat-lazy";
import { criarThreadFn, excluirThreadFn, listarThreadsFn } from "@/lib/atlas.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/solar/atlas")({
  head: () => ({
    meta: [
      { title: "Atlas — Copiloto comercial | Portal 2P" },
      {
        name: "description",
        content:
          "Converse com o Atlas: perguntas abertas sobre clientes, pedidos, metas e alertas da sua carteira no Portal 2P.",
      },
      { property: "og:title", content: "Atlas — Copiloto comercial | Portal 2P" },
      {
        property: "og:description",
        content:
          "Assistente de inteligência comercial do Grupo 2P com dados de clientes, pedidos e metas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AtlasPage,
});

const CAPACIDADES = [
  {
    titulo: "Clientes da sua carteira",
    detalhe: "Busca por nome/CNPJ, segmento, consultor e contatos.",
  },
  { titulo: "Pedidos e propostas", detalhe: "Valores, status, datas e comparativos por período." },
  { titulo: "Metas e realizado", detalhe: "Meta do ano, realizado mês a mês e gap para bater." },
  { titulo: "Alertas do radar", detalhe: "Clientes em piora e a ação recomendada." },
];

function AtlasPage() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const qc = useQueryClient();

  const listar = useServerFn(listarThreadsFn);
  const criar = useServerFn(criarThreadFn);
  const excluir = useServerFn(excluirThreadFn);

  const threads = useQuery({ queryKey: ["atlas-threads"], queryFn: async () => await listar() });

  const novaConversa = useMutation({
    mutationFn: async () => await criar({ data: {} }),
    onSuccess: (t) => {
      setThreadId(t.id);
      void qc.invalidateQueries({ queryKey: ["atlas-threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apagar = useMutation({
    mutationFn: async (id: string) => await excluir({ data: { id } }),
    onSuccess: (_r, id) => {
      if (id === threadId) setThreadId(null);
      void qc.invalidateQueries({ queryKey: ["atlas-threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!threads.isSuccess || threadId) return;
    const primeira = threads.data[0];
    if (primeira) setThreadId(primeira.id);
    else if (!novaConversa.isPending) novaConversa.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads.isSuccess, threadId]);

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-8rem)] gap-4">
        {/* Conversas */}
        <aside className="hidden w-64 shrink-0 flex-col rounded-2xl border border-border bg-card lg:flex">
          <div className="border-b border-border p-3 text-[11px] leading-relaxed text-muted-foreground">
            <div className="mb-1.5 font-semibold text-foreground">O que o Atlas consulta hoje</div>
            <ul className="space-y-1.5">
              {CAPACIDADES.map((c) => (
                <li key={c.titulo}>
                  <span className="text-foreground">{c.titulo}</span> — {c.detalhe}
                </li>
              ))}
            </ul>
            <p className="mt-2">Sempre dentro da sua carteira e das suas permissões.</p>
          </div>
          <div className="flex items-center gap-2 border-b border-border p-3">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => novaConversa.mutate()}
              disabled={novaConversa.isPending}
            >
              <MessageSquarePlus className="mr-1.5 h-4 w-4" />
              Nova conversa
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {threads.isLoading && (
              <div className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {(threads.data ?? []).map((t) => (
              <div
                key={t.id}
                className={cn(
                  "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm",
                  t.id === threadId
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-surface-2",
                )}
              >
                <button
                  type="button"
                  onClick={() => setThreadId(t.id)}
                  className="min-w-0 flex-1 truncate text-left"
                >
                  {t.titulo}
                </button>
                <button
                  type="button"
                  aria-label="Excluir conversa"
                  onClick={() => apagar.mutate(t.id)}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Chat */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold">Atlas</h1>
              <p className="truncate text-[11px] text-muted-foreground">
                Pergunte à vontade sobre clientes, pedidos, metas e riscos da sua carteira.
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="lg:hidden"
                onClick={() => novaConversa.mutate()}
              >
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/atlas-ia/radar">
                  <Radar className="mr-1.5 h-4 w-4" />
                  Radar
                </Link>
              </Button>
            </div>
          </header>
          <div className="min-h-0 flex-1">
            {threadId ? (
              <AtlasChat threadId={threadId} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparando sua conversa…
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
