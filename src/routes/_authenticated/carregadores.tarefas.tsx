import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { VendedorNamesFilter } from "@/components/vendedor-names-filter";
import { useCpoVendedores } from "@/hooks/use-cpo-vendedores";

export const Route = createFileRoute("/_authenticated/carregadores/tarefas")({
  head: () => ({
    meta: [
      { title: "Tarefas — Portal 2P Carregadores" },
      { name: "description", content: "Agenda de tarefas da operação de carregadores, independente do portal Solar." },
      { property: "og:title", content: "Tarefas — Portal 2P Carregadores" },
      { property: "og:description", content: "Crie, priorize e conclua tarefas da unidade de carregadores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CarregadoresTarefas,
});

type Task = {
  id: string;
  titulo: string;
  descricao: string | null;
  cliente_nome: string | null;
  due_date: string | null;
  prioridade: string;
  status: string;
  owner_id: string | null;
};

const PRIOS = [
  { v: "alta", label: "Alta", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
  { v: "media", label: "Média", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { v: "baixa", label: "Baixa", cls: "bg-muted text-muted-foreground" },
];

function CarregadoresTarefas() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"aberta" | "concluida" | "todas">("aberta");
  const [vendedor, setVendedor] = useState("__all__");
  const vend = useCpoVendedores();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ titulo: "", descricao: "", cliente_nome: "", due_date: "", prioridade: "media" });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["cpo-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cpo_tasks")
        .select("id,titulo,descricao,cliente_nome,due_date,prioridade,status,owner_id")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Task[];
    },
  });

  const rows = useMemo(
    () =>
      tasks
        .filter((t) => (filter === "todas" ? true : t.status === filter))
        .filter((t) => vend.matches(vendedor, t.owner_id)),
    [tasks, filter, vendedor, vend],
  );

  async function create() {
    if (!form.titulo.trim()) { toast.error("Informe o título da tarefa."); return; }
    const { error } = await supabase.from("cpo_tasks").insert({
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      cliente_nome: form.cliente_nome.trim() || null,
      due_date: form.due_date || null,
      prioridade: form.prioridade,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Tarefa criada.");
    setForm({ titulo: "", descricao: "", cliente_nome: "", due_date: "", prioridade: "media" });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["cpo-tasks"] });
    qc.invalidateQueries({ queryKey: ["cpo-home-tarefas"] });
  }

  async function toggle(t: Task) {
    const next = t.status === "aberta" ? "concluida" : "aberta";
    const { error } = await supabase.from("cpo_tasks").update({ status: next }).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["cpo-tasks"] });
    qc.invalidateQueries({ queryKey: ["cpo-home-tarefas"] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("cpo_tasks").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["cpo-tasks"] });
    qc.invalidateQueries({ queryKey: ["cpo-home-tarefas"] });
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">Tarefas</h1>
            <p className="text-sm text-muted-foreground">Agenda própria da unidade de carregadores.</p>
          </div>
          <div className="flex items-center gap-2">
            <VendedorNamesFilter
              value={vendedor}
              onChange={setVendedor}
              options={vend.names}
              allLabel="Todos os vendedores"
            />
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aberta">Abertas</SelectItem>
                <SelectItem value="concluida">Concluídas</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-1.5" /> Nova tarefa</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Título</Label>
                    <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
                  </div>
                  <div>
                    <Label>Cliente</Label>
                    <Input value={form.cliente_nome} onChange={(e) => setForm({ ...form, cliente_nome: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Data</Label>
                      <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                    </div>
                    <div>
                      <Label>Prioridade</Label>
                      <Select value={form.prioridade} onValueChange={(v) => setForm({ ...form, prioridade: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PRIOS.map((p) => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Descrição</Label>
                    <Textarea rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
                  </div>
                  <Button className="w-full" onClick={create}>Criar tarefa</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {isLoading && <div className="p-4 text-sm text-muted-foreground">Carregando…</div>}
            {!isLoading && rows.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">Nenhuma tarefa por aqui.</div>
            )}
            {rows.map((t) => {
              const prio = PRIOS.find((p) => p.v === t.prioridade) ?? PRIOS[1];
              return (
                <div key={t.id} className="flex items-center gap-3 p-3">
                  <button
                    onClick={() => toggle(t)}
                    title={t.status === "aberta" ? "Concluir" : "Reabrir"}
                    className={cn(
                      "h-6 w-6 rounded-full border flex items-center justify-center shrink-0",
                      t.status === "concluida" ? "bg-emerald-500/20 border-emerald-500 text-emerald-600" : "border-border hover:bg-surface-2",
                    )}
                  >
                    {t.status === "concluida" && <Check className="h-3.5 w-3.5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-sm font-medium truncate", t.status === "concluida" && "line-through text-muted-foreground")}>
                      {t.titulo}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {t.cliente_nome ?? "Sem cliente"}
                      {t.descricao ? ` • ${t.descricao}` : ""}
                    </div>
                  </div>
                  <span className={cn("text-[11px] px-2 py-0.5 rounded-full shrink-0", prio.cls)}>{prio.label}</span>
                  <span className="text-xs text-muted-foreground w-24 text-right shrink-0">
                    {t.due_date ? new Date(t.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => remove(t.id)} title="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
