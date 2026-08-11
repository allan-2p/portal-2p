import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, Loader2, PlayCircle, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  adminGetLogRetention,
  adminRunLogRetention,
  adminUpdateLogRetention,
} from "@/lib/activity.functions";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

export function LogRetention() {
  const qc = useQueryClient();
  const get = useServerFn(adminGetLogRetention);
  const update = useServerFn(adminUpdateLogRetention);
  const run = useServerFn(adminRunLogRetention);

  const { data, isLoading } = useQuery({
    queryKey: ["log-retention"],
    queryFn: () => get(),
  });

  const [hotDays, setHotDays] = useState(90);
  const [archiveDays, setArchiveDays] = useState(365);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!data?.policy) return;
    setHotDays(data.policy.hotDays);
    setArchiveDays(data.policy.archiveDays);
    setEnabled(data.policy.enabled);
  }, [data?.policy]);

  const save = useMutation({
    mutationFn: () => update({ data: { hotDays, archiveDays, enabled } }),
    onSuccess: () => {
      toast.success("Política de retenção atualizada.");
      qc.invalidateQueries({ queryKey: ["log-retention"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runNow = useMutation({
    mutationFn: () => run(),
    onSuccess: (r) => {
      toast.success(`${fmt(r.archived)} arquivados • ${fmt(r.purged)} expurgados.`);
      qc.invalidateQueries({ queryKey: ["log-retention"] });
      qc.invalidateQueries({ queryKey: ["admin-activity"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="glass rounded-xl p-8 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
      </div>
    );
  }
  if (!data) return null;

  return (
    <section className="glass rounded-xl overflow-hidden">
      <header className="px-4 py-3 border-b border-border/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Retenção e arquivamento de logs</h2>
        </div>
        <Badge variant={enabled ? "default" : "secondary"}>
          {enabled ? "Rotina diária ativa (03h)" : "Rotina desativada"}
        </Badge>
      </header>

      <div className="p-4 grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="hot-days">Dias na base ativa</Label>
              <Input
                id="hot-days"
                type="number"
                min={7}
                max={3650}
                value={hotDays}
                onChange={(e) => setHotDays(Number(e.target.value))}
              />
              <p className="text-[11px] text-muted-foreground">
                Depois disso, os registros vão para o arquivo.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="archive-days">Dias totais até o expurgo</Label>
              <Input
                id="archive-days"
                type="number"
                min={30}
                max={3650}
                value={archiveDays}
                onChange={(e) => setArchiveDays(Number(e.target.value))}
              />
              <p className="text-[11px] text-muted-foreground">
                Prazo legal de guarda; após isso são excluídos.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="retention-enabled">Limpeza automática</Label>
              <div className="flex h-9 items-center gap-2">
                <Switch id="retention-enabled" checked={enabled} onCheckedChange={setEnabled} />
                <span className="text-sm text-muted-foreground">
                  {enabled ? "Ligada" : "Desligada"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || archiveDays < hotDays}
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar política
            </Button>
            <Button variant="outline" onClick={() => runNow.mutate()} disabled={runNow.isPending}>
              {runNow.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              Executar agora
            </Button>
          </div>
          {archiveDays < hotDays && (
            <p className="text-xs text-destructive">
              O prazo total de guarda deve ser maior ou igual aos dias na base ativa.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Registros ativos", value: data.counts.hot },
              { label: "A arquivar agora", value: data.counts.pending },
              { label: "Arquivados", value: data.counts.archived },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border border-border/60 p-3">
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className="text-xl font-semibold tabular-nums">{fmt(c.value)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border/60 overflow-hidden self-start">
          <div className="px-3 py-2 border-b border-border/60 text-xs font-semibold flex items-center gap-2">
            <Trash2 className="h-3.5 w-3.5" /> Últimas execuções
          </div>
          {data.runs.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground text-center">
              Nenhuma execução registrada ainda.
            </p>
          ) : (
            <ul className="divide-y divide-border/50 max-h-64 overflow-auto">
              {data.runs.map((r) => (
                <li key={r.id} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    {new Date(r.ran_at).toLocaleString("pt-BR")}
                  </span>
                  <span className="tabular-nums">
                    {fmt(r.archived_count)} arq. • {fmt(r.purged_count)} exp.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
