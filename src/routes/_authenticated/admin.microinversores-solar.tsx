import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Cpu, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logModeration } from "@/lib/moderation-audit";
import { useSolarMicroinversores, type SolarMicroinversor } from "@/hooks/use-solar-catalogo";

export const Route = createFileRoute("/_authenticated/admin/microinversores-solar")({
  head: () => ({
    meta: [
      { title: "Microinversores — 2P Solar" },
      {
        name: "description",
        content:
          "Modelos de microinversor da Calculadora 2P: módulos por unidade e fixadores por unidade.",
      },
      { property: "og:title", content: "Microinversores — 2P Solar" },
      {
        property: "og:description",
        content: "Gerencie os modelos de microinversor usados na Calculadora 2P.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.produtos" area="moderacao">
      <MicroinversoresSolarPage />
    </AdminRouteGuard>
  ),
});

type Form = {
  id?: string;
  nome: string;
  modelo_legado: string;
  modulos_por_unidade: string;
  fixadores_por_unidade: string;
  ativo: boolean;
  ordem: string;
};

const vazio: Form = {
  nome: "",
  modelo_legado: "",
  modulos_por_unidade: "2",
  fixadores_por_unidade: "2",
  ativo: true,
  ordem: "0",
};

function MicroinversoresSolarPage() {
  const qc = useQueryClient();
  const microQ = useSolarMicroinversores(true);
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Form | null>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (microQ.data ?? []).filter((m) => !q || m.nome.toLowerCase().includes(q));
  }, [microQ.data, busca]);

  function abrir(m?: SolarMicroinversor) {
    setForm(
      m
        ? {
            id: m.id,
            nome: m.nome,
            modelo_legado: String(m.modelo_legado ?? ""),
            modulos_por_unidade: String(m.modulos_por_unidade ?? 2),
            fixadores_por_unidade: String(m.fixadores_por_unidade ?? 2),
            ativo: m.ativo,
            ordem: String(m.ordem ?? 0),
          }
        : { ...vazio },
    );
  }

  async function salvar() {
    if (!form) return;
    if (!form.nome.trim()) return toast.error("Informe o nome do modelo.");
    const payload = {
      nome: form.nome.trim(),
      modelo_legado: Number(form.modelo_legado) || 0,
      modulos_por_unidade: Math.max(1, Number(form.modulos_por_unidade) || 1),
      fixadores_por_unidade: Math.max(0, Number(form.fixadores_por_unidade) || 0),
      ativo: form.ativo,
      ordem: Number(form.ordem) || 0,
    };
    const res = form.id
      ? await supabase.from("solar_microinversores").update(payload).eq("id", form.id)
      : await supabase.from("solar_microinversores").insert(payload);
    if (res.error) return toast.error(res.error.message);
    void logModeration({
      area: "produtos",
      action: form.id ? "atualizou" : "criou",
      target: payload.nome,
      summary: `Microinversor ${form.id ? "atualizado" : "criado"}: ${payload.nome}`,
    });
    setForm(null);
    void qc.invalidateQueries({ queryKey: ["solar-microinversores"] });
    toast.success("Modelo salvo.");
  }

  async function alternarAtivo(m: SolarMicroinversor) {
    const { error } = await supabase
      .from("solar_microinversores")
      .update({ ativo: !m.ativo })
      .eq("id", m.id);
    if (error) return toast.error(error.message);
    void qc.invalidateQueries({ queryKey: ["solar-microinversores"] });
  }

  return (
    <AppLayout>
      <div className="max-w-[1100px] mx-auto space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-primary font-semibold">
              Moderação · 2P Solar · Gestão de Produtos
            </div>
            <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
              <Cpu className="h-6 w-6 text-primary" /> Microinversores
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cada modelo define quantos módulos atende e quantos fixadores consome — a calculadora
              usa esses números para sugerir a quantidade do projeto.
            </p>
          </div>
          <Button className="gap-2" onClick={() => abrir()}>
            <Plus className="h-4 w-4" /> Novo modelo
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar modelo"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase border-b border-border">
                  <th className="text-left px-4 py-3">Modelo</th>
                  <th className="text-right px-4 py-3">Módulos / unidade</th>
                  <th className="text-right px-4 py-3">Fixadores / unidade</th>
                  <th className="text-center px-4 py-3">Ativo</th>
                  <th className="text-right px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="px-4 py-3 font-medium">{m.nome}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{m.modulos_por_unidade}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{m.fixadores_por_unidade}</td>
                    <td className="px-4 py-3 text-center">
                      <Switch checked={m.ativo} onCheckedChange={() => void alternarAtivo(m)} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => abrir(m)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!lista.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      {microQ.isLoading ? "Carregando…" : "Nenhum modelo cadastrado."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={!!form} onOpenChange={(v) => !v && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar modelo" : "Novo modelo"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Nome</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Módulos por unidade</Label>
                  <Input
                    value={form.modulos_por_unidade}
                    onChange={(e) =>
                      setForm({ ...form, modulos_por_unidade: e.target.value.replace(/\D/g, "") })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Fixadores por unidade</Label>
                  <Input
                    value={form.fixadores_por_unidade}
                    onChange={(e) =>
                      setForm({ ...form, fixadores_por_unidade: e.target.value.replace(/\D/g, "") })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Código legado</Label>
                  <Input
                    value={form.modelo_legado}
                    onChange={(e) =>
                      setForm({ ...form, modelo_legado: e.target.value.replace(/\D/g, "") })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Ordem</Label>
                  <Input
                    value={form.ordem}
                    onChange={(e) => setForm({ ...form, ordem: e.target.value.replace(/\D/g, "") })}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
                Ativo
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={() => void salvar()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
