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
import { Pencil, Plus, Search, Sun } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logModeration } from "@/lib/moderation-audit";
import { useSolarModulos } from "@/hooks/use-solar-catalogo";
import type { SolarModulo } from "@/lib/solar-calculadora";

export const Route = createFileRoute("/_authenticated/admin/modulos-solar")({
  head: () => ({
    meta: [
      { title: "Módulos fotovoltaicos — 2P Solar" },
      {
        name: "description",
        content: "Cadastro dos módulos usados na Calculadora 2P: dimensões, espessura e disponibilidade.",
      },
      { property: "og:title", content: "Módulos fotovoltaicos — 2P Solar" },
      { property: "og:description", content: "Gerencie os módulos padrão da Calculadora 2P." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.produtos" area="moderacao">
      <ModulosSolarPage />
    </AdminRouteGuard>
  ),
});

type Form = {
  id?: string;
  nome: string;
  largura: string;
  altura: string;
  espessura: string;
  personalizado: boolean;
  ativo: boolean;
  ordem: string;
};

const vazio: Form = {
  nome: "",
  largura: "",
  altura: "",
  espessura: "",
  personalizado: false,
  ativo: true,
  ordem: "0",
};

function ModulosSolarPage() {
  const qc = useQueryClient();
  const modulosQ = useSolarModulos(true);
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Form | null>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (modulosQ.data ?? []).filter((m) => !q || m.nome.toLowerCase().includes(q));
  }, [modulosQ.data, busca]);

  function abrir(m?: SolarModulo) {
    setForm(
      m
        ? {
            id: m.id,
            nome: m.nome,
            largura: String(m.largura ?? ""),
            altura: String(m.altura ?? ""),
            espessura: String(m.espessura ?? ""),
            personalizado: m.personalizado,
            ativo: m.ativo,
            ordem: String(m.ordem ?? 0),
          }
        : { ...vazio },
    );
  }

  async function salvar() {
    if (!form) return;
    if (!form.nome.trim()) return toast.error("Informe o nome do módulo.");
    const payload = {
      nome: form.nome.trim(),
      largura: form.personalizado ? null : Number(form.largura) || null,
      altura: form.personalizado ? null : Number(form.altura) || null,
      espessura: form.personalizado ? null : Number(form.espessura) || null,
      personalizado: form.personalizado,
      ativo: form.ativo,
      ordem: Number(form.ordem) || 0,
    };
    const res = form.id
      ? await supabase.from("solar_modulos").update(payload).eq("id", form.id)
      : await supabase.from("solar_modulos").insert(payload);
    if (res.error) return toast.error(res.error.message);
    void logModeration({
      area: "produtos",
      action: form.id ? "atualizou" : "criou",
      target: payload.nome,
      summary: `Módulo fotovoltaico ${form.id ? "atualizado" : "criado"} na Calculadora 2P: ${payload.nome}`,
    });
    setForm(null);
    void qc.invalidateQueries({ queryKey: ["solar-modulos"] });
    toast.success("Módulo salvo.");
  }

  async function alternarAtivo(m: SolarModulo) {
    const { error } = await supabase.from("solar_modulos").update({ ativo: !m.ativo }).eq("id", m.id);
    if (error) return toast.error(error.message);
    void qc.invalidateQueries({ queryKey: ["solar-modulos"] });
  }

  return (
    <AppLayout>
      <div className="max-w-[1200px] mx-auto space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-primary font-semibold">
              Moderação · 2P Solar · Gestão de Produtos
            </div>
            <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
              <Sun className="h-6 w-6 text-primary" /> Módulos
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Lista de módulos oferecida em “Realizar Proposta”. As dimensões alimentam a
              Calculadora 2P (comprimento das fileiras, barras de trilho e grampos).
            </p>
          </div>
          <Button className="gap-2" onClick={() => abrir()}>
            <Plus className="h-4 w-4" /> Novo módulo
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar módulo"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase border-b border-border">
                  <th className="text-left px-4 py-3">Módulo</th>
                  <th className="text-right px-4 py-3">Largura (mm)</th>
                  <th className="text-right px-4 py-3">Altura (mm)</th>
                  <th className="text-right px-4 py-3">Espessura (mm)</th>
                  <th className="text-center px-4 py-3">Ativo</th>
                  <th className="text-right px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="px-4 py-3 font-medium">
                      {m.nome}
                      {m.personalizado && (
                        <span className="ml-2 text-xs text-muted-foreground">(medidas digitadas na proposta)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{m.largura ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{m.altura ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{m.espessura ?? "—"}</td>
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
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      {modulosQ.isLoading ? "Carregando…" : "Nenhum módulo cadastrado."}
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
            <DialogTitle>{form?.id ? "Editar módulo" : "Novo módulo"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Nome</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.personalizado}
                  onCheckedChange={(v) => setForm({ ...form, personalizado: v })}
                />
                Medidas informadas pelo vendedor (Personalizado)
              </label>
              {!form.personalizado && (
                <div className="grid grid-cols-3 gap-3">
                  {(["largura", "altura", "espessura"] as const).map((k) => (
                    <div key={k} className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground capitalize">{k} (mm)</Label>
                      <Input
                        value={form[k]}
                        onChange={(e) => setForm({ ...form, [k]: e.target.value.replace(/\D/g, "") })}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Ordem</Label>
                  <Input
                    value={form.ordem}
                    onChange={(e) => setForm({ ...form, ordem: e.target.value.replace(/\D/g, "") })}
                  />
                </div>
                <label className="flex items-end gap-2 text-sm pb-2">
                  <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
                  Ativo
                </label>
              </div>
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
