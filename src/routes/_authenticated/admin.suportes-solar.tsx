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
import { Anchor, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logModeration } from "@/lib/moderation-audit";
import { useSolarSuportes } from "@/hooks/use-solar-catalogo";
import type { SolarSuporte } from "@/lib/solar-calculadora";
import { resolverProduto } from "@/lib/solar-sku";
import {
  SapCodigoCell,
  SapDeParaResumo,
  useSapCatalogoCodigos,
} from "@/components/solar/sap-codigo";


export const Route = createFileRoute("/_authenticated/admin/suportes-solar")({
  head: () => ({
    meta: [
      { title: "Suportes — 2P Solar" },
      {
        name: "description",
        content:
          "Cadastro dos suportes/fixações da Calculadora 2P: código do fixador, mini-trilho e disponibilidade.",
      },
      { property: "og:title", content: "Suportes — 2P Solar" },
      { property: "og:description", content: "Gerencie os suportes usados na Calculadora 2P." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.produtos" area="moderacao">
      <SuportesSolarPage />
    </AdminRouteGuard>
  ),
});

type Form = {
  id?: string;
  nome: string;
  legado_id: string;
  codigo_sap: string;
  cod_extra: string;
  cod_mini_trilho: string;
  multiplo: string;
  smart: boolean;
  ativo: boolean;
  ordem: string;
};

const vazio: Form = {
  nome: "",
  legado_id: "",
  codigo_sap: "",
  cod_extra: "",
  cod_mini_trilho: "",
  multiplo: "2",
  smart: false,
  ativo: true,
  ordem: "0",
};

function SuportesSolarPage() {
  const qc = useQueryClient();
  const suportesQ = useSolarSuportes(true);
  const catalogo = useSapCatalogoCodigos().data ?? [];

  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Form | null>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (suportesQ.data ?? []).filter((s) => !q || s.nome.toLowerCase().includes(q));
  }, [suportesQ.data, busca]);

  function abrir(s?: SolarSuporte) {
    setForm(
      s
        ? {
            id: s.id,
            nome: s.nome,
            legado_id: String(s.legado_id ?? ""),
            codigo_sap: s.codigo_sap ?? "",
            cod_extra: s.cod_extra ?? "",
            cod_mini_trilho: s.cod_mini_trilho ?? "",
            multiplo: String(s.multiplo ?? 2),
            smart: !!s.smart,
            ativo: s.ativo,
            ordem: String(s.ordem ?? 0),
          }
        : { ...vazio },
    );
  }

  async function salvar() {
    if (!form) return;
    if (!form.nome.trim()) return toast.error("Informe o nome do suporte.");
    const payload = {
      nome: form.nome.trim(),
      legado_id: form.legado_id ? Number(form.legado_id) : null,
      codigo_sap: form.codigo_sap.trim() || null,
      cod_extra: form.cod_extra.trim() || null,
      cod_mini_trilho: form.cod_mini_trilho.trim() || null,
      multiplo: Math.max(1, Number(form.multiplo) || 2),
      smart: form.smart,
      usa_barra: !form.smart,
      ativo: form.ativo,
      ordem: Number(form.ordem) || 0,
    };
    const res = form.id
      ? await supabase.from("solar_suportes").update(payload).eq("id", form.id)
      : await supabase.from("solar_suportes").insert(payload);
    if (res.error) return toast.error(res.error.message);
    void logModeration({
      area: "produtos",
      action: form.id ? "atualizou" : "criou",
      target: payload.nome,
      summary: `Suporte ${form.id ? "atualizado" : "criado"} na Calculadora 2P: ${payload.nome}`,
    });
    setForm(null);
    void qc.invalidateQueries({ queryKey: ["solar-suportes"] });
    toast.success("Suporte salvo.");
  }

  async function alternarAtivo(s: SolarSuporte) {
    const { error } = await supabase.from("solar_suportes").update({ ativo: !s.ativo }).eq("id", s.id);
    if (error) return toast.error(error.message);
    void qc.invalidateQueries({ queryKey: ["solar-suportes"] });
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
              <Anchor className="h-6 w-6 text-primary" /> Suportes
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Só os suportes ativos aparecem no cálculo. Suportes “Smart” usam mini-trilho e não
              consomem barras de trilho.
            </p>
          </div>
          <Button className="gap-2" onClick={() => abrir()}>
            <Plus className="h-4 w-4" /> Novo suporte
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar suporte"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase border-b border-border">
                  <th className="text-left px-4 py-3">Suporte</th>
                  <th className="text-left px-4 py-3">Código</th>
                  <th className="text-left px-4 py-3">Complemento</th>
                  <th className="text-left px-4 py-3">Mini-trilho</th>
                  <th className="text-right px-4 py-3">Múltiplo</th>
                  <th className="text-center px-4 py-3">Smart</th>
                  <th className="text-center px-4 py-3">Ativo</th>
                  <th className="text-right px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((s) => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="px-4 py-3 font-medium">{s.nome}</td>
                    {(["codigo_sap", "cod_extra", "cod_mini_trilho"] as const).map((k) => (
                      <td className="px-4 py-3" key={k}>
                        <SapCodigoCell codigo={(s as any)[k]} nomeRef={s.nome} produtos={catalogo} />
                      </td>
                    ))}

                    <td className="px-4 py-3 text-right tabular-nums">{s.multiplo}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {s.smart ? "Sim" : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Switch checked={s.ativo} onCheckedChange={() => void alternarAtivo(s)} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => abrir(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!lista.length && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      {suportesQ.isLoading ? "Carregando…" : "Nenhum suporte cadastrado."}
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
            <DialogTitle>{form?.id ? "Editar suporte" : "Novo suporte"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Nome</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Código do fixador</Label>
                  <Input
                    value={form.codigo_sap}
                    onChange={(e) => setForm({ ...form, codigo_sap: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Código complementar</Label>
                  <Input
                    value={form.cod_extra}
                    onChange={(e) => setForm({ ...form, cod_extra: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Código do mini-trilho</Label>
                  <Input
                    value={form.cod_mini_trilho}
                    onChange={(e) => setForm({ ...form, cod_mini_trilho: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Múltiplo de compra</Label>
                  <Input
                    value={form.multiplo}
                    onChange={(e) => setForm({ ...form, multiplo: e.target.value.replace(/\D/g, "") })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Código legado</Label>
                  <Input
                    value={form.legado_id}
                    onChange={(e) => setForm({ ...form, legado_id: e.target.value.replace(/\D/g, "") })}
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
                <Switch checked={form.smart} onCheckedChange={(v) => setForm({ ...form, smart: v })} />
                Telhado Smart / mini-trilho (não usa barras de trilho)
              </label>
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
