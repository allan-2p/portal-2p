import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, BellOff, Check, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mascaraDoc } from "@/lib/cnpj";
import { atualizarAlertaFn, listarAlertasFn, rodarRadarFn } from "@/lib/atlas.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/atlas-ia/radar")({
  head: () => ({
    meta: [
      { title: "Radar do Atlas — Clientes em risco | Portal 2P" },
      {
        name: "description",
        content:
          "Alertas semanais do Atlas com clientes em piora de faturamento, inatividade e projeção abaixo da meta, com recomendações de ação.",
      },
      { property: "og:title", content: "Radar do Atlas — Clientes em risco | Portal 2P" },
      {
        property: "og:description",
        content: "Acompanhe os clientes que precisam de atenção nesta semana e trate cada alerta.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RadarPage,
});

const TOM: Record<string, string> = {
  critico: "bg-destructive/15 text-destructive border-destructive/30",
  alto: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  medio: "bg-sky-500/15 text-sky-600 border-sky-500/30",
};

function RadarPage() {
  const { hasRole } = useAuth();
  const podeRodar = hasRole("admin") || hasRole("diretor");
  const [situacao, setSituacao] = useState("aberto");
  const qc = useQueryClient();

  const listar = useServerFn(listarAlertasFn);
  const atualizar = useServerFn(atualizarAlertaFn);
  const rodar = useServerFn(rodarRadarFn);

  const alertas = useQuery({
    queryKey: ["atlas-alertas", situacao],
    queryFn: async () => await listar({ data: { situacao } }),
  });

  const mudar = useMutation({
    mutationFn: async (v: { id: string; acao: "tratar" | "reabrir" | "silenciar" }) =>
      await atualizar({ data: v }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["atlas-alertas"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const varrer = useMutation({
    mutationFn: async () => await rodar({ data: {} }),
    onSuccess: () => {
      toast.success("Radar executado.");
      void qc.invalidateQueries({ queryKey: ["atlas-alertas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold">Radar do Atlas</h1>
            <p className="text-sm text-muted-foreground">
              Clientes piorando em faturamento, frequência de compra, atividade ou projeção contra a meta.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Select value={situacao} onValueChange={setSituacao}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aberto">Abertos</SelectItem>
                <SelectItem value="tratado">Tratados</SelectItem>
                <SelectItem value="silenciado">Silenciados</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
            {podeRodar && (
              <Button variant="outline" onClick={() => varrer.mutate()} disabled={varrer.isPending}>
                {varrer.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                )}
                Rodar agora
              </Button>
            )}
          </div>
        </header>

        {alertas.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando alertas…
          </div>
        )}

        {alertas.isSuccess && alertas.data.length === 0 && (
          <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            Nenhum alerta nesta situação.
          </p>
        )}

        <div className="space-y-3">
          {(alertas.data ?? []).map((a) => (
            <article key={a.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{a.cliente_nome}</h2>
                  <p className="text-xs text-muted-foreground">
                    {mascaraDoc(a.cliente_doc)}
                    {a.consultor_nome ? ` • ${a.consultor_nome}` : ""}
                    {a.instancia ? ` • ${a.instancia}` : ""}
                  </p>
                </div>
                <Badge variant="outline" className={`ml-auto ${TOM[a.severidade] ?? ""}`}>
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {a.severidade} • {a.score}
                </Badge>
              </div>

              <p className="mt-3 text-sm">{a.resumo}</p>
              {a.recomendacao && (
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm">
                  {a.recomendacao}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                {(a.sinais ?? []).map((s, i) => (
                  <Badge key={i} variant="secondary" className="text-[11px] font-normal">
                    {s.descricao}
                  </Badge>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {a.situacao !== "tratado" && (
                  <Button size="sm" variant="outline" onClick={() => mudar.mutate({ id: a.id, acao: "tratar" })}>
                    <Check className="mr-1.5 h-4 w-4" /> Marcar como tratado
                  </Button>
                )}
                {a.situacao !== "silenciado" && (
                  <Button size="sm" variant="ghost" onClick={() => mudar.mutate({ id: a.id, acao: "silenciar" })}>
                    <BellOff className="mr-1.5 h-4 w-4" /> Silenciar 30 dias
                  </Button>
                )}
                {a.situacao !== "aberto" && (
                  <Button size="sm" variant="ghost" onClick={() => mudar.mutate({ id: a.id, acao: "reabrir" })}>
                    <RotateCcw className="mr-1.5 h-4 w-4" /> Reabrir
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
