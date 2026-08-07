import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL } from "@/lib/cpo";
import { Zap, Users, CalendarClock, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/carregadores/")({
  head: () => ({
    meta: [
      { title: "Home — Portal 2P Carregadores" },
      { name: "description", content: "Visão geral das propostas, clientes e tarefas da unidade de carregadores." },
      { property: "og:title", content: "Home — Portal 2P Carregadores" },
      { property: "og:description", content: "Indicadores da operação de carregadores veiculares." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CarregadoresHome,
});

type Prop = {
  id: string;
  numero: string | null;
  cliente_nome: string;
  uf: string;
  status: string;
  totais: Record<string, number> | null;
  created_at: string;
};

function CarregadoresHome() {
  const { data: props = [], isLoading } = useQuery({
    queryKey: ["cpo-home-propostas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cpo_proposals")
        .select("id,numero,cliente_nome,uf,status,totais,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Prop[];
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["cpo-home-tarefas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cpo_tasks")
        .select("id,titulo,due_date,status,cliente_nome")
        .eq("status", "aberta")
        .order("due_date", { ascending: true })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const valorProposta = (p: Prop) =>
    Number(p.totais?.["valorTotal"] ?? p.totais?.["total"] ?? p.totais?.["valor"] ?? 0);

  const kpis = useMemo(() => {
    const total = props.length;
    const valor = props.reduce((s, p) => s + valorProposta(p), 0);
    const clientes = new Set(props.map((p) => p.cliente_nome.trim().toUpperCase())).size;
    const aprovadas = props.filter((p) => p.status === "Aprovada").length;
    return { total, valor, clientes, aprovadas };
  }, [props]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">Portal 2P Carregadores</h1>
            <p className="text-sm text-muted-foreground">Operação CPO — propostas, clientes e tarefas da unidade.</p>
          </div>
          <Button asChild>
            <Link to="/carregadores/propostas/nova">
              <Plus className="h-4 w-4 mr-1.5" /> Nova proposta
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Propostas" value={String(kpis.total)} icon={<Zap className="h-4 w-4" />} />
          <Kpi label="Aprovadas" value={String(kpis.aprovadas)} icon={<Zap className="h-4 w-4" />} />
          <Kpi label="Valor em propostas" value={fmtBRL(kpis.valor)} icon={<Zap className="h-4 w-4" />} />
          <Kpi label="Clientes" value={String(kpis.clientes)} icon={<Users className="h-4 w-4" />} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Últimas propostas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
              {!isLoading && props.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma proposta emitida ainda.</p>
              )}
              {props.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 border-b border-border last:border-0 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.cliente_nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.numero ?? "—"} • {p.uf} • {p.status}
                    </div>
                  </div>
                  <div className="text-sm font-semibold shrink-0">
                    {fmtBRL(Number(p.totais?.["total"] ?? p.totais?.["receita"] ?? 0))}
                  </div>
                </div>
              ))}
              <Button asChild variant="ghost" size="sm" className="w-full mt-1">
                <Link to="/carregadores/propostas">Ver todas</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="h-4 w-4" /> Próximas tarefas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tasks.length === 0 && <p className="text-sm text-muted-foreground">Sem tarefas abertas.</p>}
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 border-b border-border last:border-0 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{t.titulo}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.cliente_nome ?? "Sem cliente"}</div>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {t.due_date ? new Date(t.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                  </div>
                </div>
              ))}
              <Button asChild variant="ghost" size="sm" className="w-full mt-1">
                <Link to="/carregadores/tarefas">Ver tarefas</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-display font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
