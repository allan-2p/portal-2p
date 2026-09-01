/**
 * Card do Atlas Radar na home: alertas abertos de clientes em piora.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, Radar, Sparkles } from "lucide-react";
import { listarAlertasFn } from "@/lib/atlas.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AtlasRadarCard() {
  const listar = useServerFn(listarAlertasFn);
  const alertas = useQuery({
    queryKey: ["atlas-alertas", "aberto", "home"],
    queryFn: async () => await listar({ data: { situacao: "aberto", limite: 8 } }),
    staleTime: 5 * 60 * 1000,
  });

  const itens = alertas.data ?? [];

  return (
    <div className="glass rounded-2xl p-5 min-h-[280px] flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-display font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Atlas radar
            {alertas.isFetching && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Clientes da sua carteira com sinais de piora
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/atlas-ia/radar">
            <Radar className="mr-1.5 h-3.5 w-3.5" />
            Abrir radar
          </Link>
        </Button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {alertas.isLoading && (
          <div className="text-center text-sm text-muted-foreground py-8">Carregando…</div>
        )}
        {alertas.isError && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Não consegui carregar os alertas agora.
          </div>
        )}
        {!alertas.isLoading && !alertas.isError && itens.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Nenhum alerta aberto. A varredura roda toda segunda de manhã.
          </div>
        )}
        {itens.map((a) => (
          <div
            key={a.id}
            className="rounded-xl border border-border bg-surface p-3 hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide",
                  a.severidade === "critico"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-warning/20 text-[color:var(--warning)]",
                )}
              >
                {a.severidade === "critico" ? "Crítico" : "Atenção"}
              </span>
              <span className="text-sm font-medium truncate">{a.cliente_nome}</span>
            </div>
            <div className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="line-clamp-2">
                {a.recomendacao ?? a.resumo ?? a.sinais.map((s) => s.titulo).join(" · ")}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
