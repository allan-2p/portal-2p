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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Plus, Rows3, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logModeration } from "@/lib/moderation-audit";
import { useSolarTrilhos } from "@/hooks/use-solar-catalogo";
import type { SolarTrilho } from "@/lib/solar-calculadora";
import { resolverProduto } from "@/lib/solar-sku";
import {
  SapCodigoCell,
  SapDeParaResumo,
  useSapCatalogoCodigos,
} from "@/components/solar/sap-codigo";


export const Route = createFileRoute("/_authenticated/admin/trilhos-solar")({
  head: () => ({
    meta: [
      { title: "Trilhos — 2P Solar" },
      {
        name: "description",
        content:
          "Cadastro dos trilhos da Calculadora 2P: família, comprimentos de barra e disponibilidade.",
      },
      { property: "og:title", content: "Trilhos — 2P Solar" },
      { property: "og:description", content: "Gerencie os trilhos usados na Calculadora 2P." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.produtos" area="moderacao">
      <TrilhosSolarPage />
    </AdminRouteGuard>
  ),
});

type Form = {
  id?: string;
  nome: string;
  familia: string;
  legado_id: string;
  cod_4800: string;
  cod_3600: string;
  cod_2400: string;
  cod_2700: string;
  ativo: boolean;
  ordem: string;
};

const vazio: Form = {
  nome: "",
  familia: "padrao",
  legado_id: "",
  cod_4800: "",
  cod_3600: "",
  cod_2400: "",
  cod_2700: "",
  ativo: true,
  ordem: "0",
};

const FAMILIAS = [
  { value: "padrao", label: "Padrão (2P-TC)" },
  { value: "reforcado", label: "Reforçado (2P-TCR)" },
  { value: "light", label: "Light (2P-TCL)" },
];

function TrilhosSolarPage() {
  const qc = useQueryClient();
  const trilhosQ = useSolarTrilhos(true);
  const catalogo = useSapCatalogoCodigos().data ?? [];

  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Form | null>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (trilhosQ.data ?? []).filter((t) => !q || t.nome.toLowerCase().includes(q));
  }, [trilhosQ.data, busca]);

  function abrir(t?: SolarTrilho) {
    setForm(
      t
        ? {
            id: t.id,
            nome: t.nome,
            familia: t.familia ?? "padrao",
            legado_id: String(t.legado_id ?? ""),
            cod_4800: t.cod_4800 ?? "",
            cod_3600: t.cod_3600 ?? "",
            cod_2400: t.cod_2400 ?? "",
            cod_2700: t.cod_2700 ?? "",
            ativo: t.ativo,
            ordem: String(t.ordem ?? 0),
          }
        : { ...vazio },
    );
  }

  async function salvar() {
    if (!form) return;
    if (!form.nome.trim()) return toast.error("Informe o nome do trilho.");
    const payload = {
      nome: form.nome.trim(),
      familia: form.familia,
      legado_id: form.legado_id ? Number(form.legado_id) : null,
      cod_4800: form.cod_4800.trim() || null,
      cod_3600: form.cod_3600.trim() || null,
      cod_2400: form.cod_2400.trim() || null,
      cod_2700: form.cod_2700.trim() || null,
      ativo: form.ativo,
      ordem: Number(form.ordem) || 0,
    };
    const res = form.id
      ? await supabase.from("solar_trilhos").update(payload).eq("id", form.id)
      : await supabase.from("solar_trilhos").insert(payload);
    if (res.error) return toast.error(res.error.message);
    void logModeration({
      area: "produtos",
      action: form.id ? "atualizou" : "criou",
      target: payload.nome,
      summary: `Trilho ${form.id ? "atualizado" : "criado"} na Calculadora 2P: ${payload.nome}`,
    });
    setForm(null);
    void qc.invalidateQueries({ queryKey: ["solar-trilhos"] });
    toast.success("Trilho salvo.");
  }

  async function alternarAtivo(t: SolarTrilho) {
    const { error } = await supabase.from("solar_trilhos").update({ ativo: !t.ativo }).eq("id", t.id);
    if (error) return toast.error(error.message);
    void qc.invalidateQueries({ queryKey: ["solar-trilhos"] });
  }

  const pendencias = useMemo(() => {
    const out: string[] = [];
    for (const t of trilhosQ.data ?? []) {
      for (const k of ["cod_4800", "cod_3600", "cod_2400", "cod_2700"] as const) {
        const cod = (t as any)[k] as string | null;
        if (cod && !resolverProduto(catalogo, cod)) out.push(`${t.nome} · ${k.replace("cod_", "")}: ${cod}`);
      }
    }
    return out;
  }, [trilhosQ.data, catalogo]);

  return (

    <AppLayout>
      <div className="max-w-[1200px] mx-auto space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-primary font-semibold">
              Moderação · 2P Solar · Gestão de Produtos
            </div>
            <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
              <Rows3 className="h-6 w-6 text-primary" /> Trilhos
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Apenas os trilhos ativos aparecem na disposição dos painéis por fileira. Os códigos
              por comprimento alimentam a quantificação de barras.
            </p>
          </div>
          <Button className="gap-2" onClick={() => abrir()}>
            <Plus className="h-4 w-4" /> Novo trilho
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar trilho"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <SapDeParaResumo pendencias={pendencias} />

        <div className="glass rounded-2xl overflow-hidden">

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase border-b border-border">
                  <th className="text-left px-4 py-3">Trilho</th>
                  <th className="text-left px-4 py-3">Família</th>
                  <th className="text-left px-4 py-3">4800</th>
                  <th className="text-left px-4 py-3">3600</th>
                  <th className="text-left px-4 py-3">2400</th>
                  <th className="text-left px-4 py-3">2700</th>
                  <th className="text-center px-4 py-3">Ativo</th>
                  <th className="text-right px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((t) => (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="px-4 py-3 font-medium">{t.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {FAMILIAS.find((f) => f.value === t.familia)?.label ?? t.familia}
                    </td>
                    <td className="px-4 py-3">{t.cod_4800 ?? "—"}</td>
                    <td className="px-4 py-3">{t.cod_3600 ?? "—"}</td>
                    <td className="px-4 py-3">{t.cod_2400 ?? "—"}</td>
                    <td className="px-4 py-3">{t.cod_2700 ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <Switch checked={t.ativo} onCheckedChange={() => void alternarAtivo(t)} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => abrir(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!lista.length && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      {trilhosQ.isLoading ? "Carregando…" : "Nenhum trilho cadastrado."}
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
            <DialogTitle>{form?.id ? "Editar trilho" : "Novo trilho"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Nome</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Família</Label>
                  <Select value={form.familia} onValueChange={(v) => setForm({ ...form, familia: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FAMILIAS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Código legado</Label>
                  <Input
                    value={form.legado_id}
                    onChange={(e) => setForm({ ...form, legado_id: e.target.value.replace(/\D/g, "") })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(["cod_4800", "cod_3600", "cod_2400", "cod_2700"] as const).map((k) => (
                  <div key={k} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Código da barra {k.replace("cod_", "")} mm
                    </Label>
                    <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
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
