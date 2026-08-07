import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCpoConfig, useCpoInvalidate, useCpoProducts, useCpoUfs } from "@/hooks/use-cpo";
import { fmtBRL, type CpoConfig, type CpoProduct } from "@/lib/cpo";

export const Route = createFileRoute("/_authenticated/carregadores/produtos")({
  head: () => ({
    meta: [
      { title: "Produtos e Alíquotas CPO — Portal 2P Carregadores" },
      { name: "description", content: "Catálogo de carregadores, alíquotas por UF e política de margem." },
      { property: "og:title", content: "Produtos e Alíquotas CPO — Portal 2P Carregadores" },
      { property: "og:description", content: "Gerencie custos, preços sugeridos, ICMS/FCP por estado e regras de margem." },
    ],
  }),
  component: ProdutosCpoPage,
});

function ProdutosCpoPage() {
  return (
    <AppLayout>
      <div className="max-w-[1700px] mx-auto space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-primary font-semibold">Módulo CPO</div>
          <h1 className="text-3xl font-bold mt-1">Produtos e Alíquotas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Base usada pelo cálculo de DRE das propostas de carregadores.
          </p>
        </div>

        <Tabs defaultValue="produtos">
          <TabsList>
            <TabsTrigger value="produtos">Produtos</TabsTrigger>
            <TabsTrigger value="ufs">Alíquotas por UF</TabsTrigger>
          </TabsList>
          <TabsContent value="produtos" className="mt-4"><ProdutosTab /></TabsContent>
          <TabsContent value="ufs" className="mt-4"><UfsTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

/* ---------------------------- Produtos ---------------------------- */

type Draft = {
  id?: string;
  nome: string;
  potencia: string;
  custo: string;
  preco_sugerido: string;
  ativo: boolean;
};

const EMPTY: Draft = { nome: "", potencia: "", custo: "", preco_sugerido: "", ativo: true };

function ProdutosTab() {
  const { data: produtos = [], isLoading } = useCpoProducts();
  const invalidate = useCpoInvalidate();
  const [busca, setBusca] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const filtrados = produtos.filter((p) =>
    `${p.nome} ${p.potencia ?? ""}`.toLowerCase().includes(busca.trim().toLowerCase()),
  );

  async function salvar() {
    if (!draft) return;
    if (!draft.nome.trim()) return toast.error("Informe o nome do produto.");
    const payload = {
      nome: draft.nome.trim(),
      potencia: draft.potencia.trim() || null,
      custo: Number(draft.custo) || 0,
      preco_sugerido: Number(draft.preco_sugerido) || 0,
      ativo: draft.ativo,
    };
    setSaving(true);
    const { error } = draft.id
      ? await supabase.from("cpo_products").update(payload).eq("id", draft.id)
      : await supabase.from("cpo_products").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(draft.id ? "Produto atualizado." : "Produto criado.");
    setDraft(null);
    invalidate();
  }

  async function excluir(p: CpoProduct) {
    const { error } = await supabase.from("cpo_products").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Produto removido.");
    invalidate();
  }

  async function toggleAtivo(p: CpoProduct) {
    const { error } = await supabase.from("cpo_products").update({ ativo: !p.ativo }).eq("id", p.id);
    if (error) return toast.error(error.message);
    invalidate();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Button className="gap-2" onClick={() => setDraft({ ...EMPTY })}>
          <Plus className="h-4 w-4" /> Novo produto
        </Button>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="text-left px-4 py-3">Produto</th>
                <th className="text-left px-4 py-3">Potência</th>
                <th className="text-right px-4 py-3">Custo</th>
                <th className="text-right px-4 py-3">Preço sugerido</th>
                <th className="text-right px-4 py-3">Markup</th>
                <th className="text-center px-4 py-3">Ativo</th>
                <th className="text-right px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-surface-2">
                  <td className="px-4 py-3 font-medium">{p.nome}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.potencia || "—"}</td>
                  <td className="px-4 py-3 text-right">{fmtBRL(p.custo)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmtBRL(p.preco_sugerido)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {p.custo > 0 ? `${(((p.preco_sugerido - p.custo) / p.custo) * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Switch checked={p.ativo} onCheckedChange={() => toggleAtivo(p)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar produto"
                        onClick={() =>
                          setDraft({
                            id: p.id,
                            nome: p.nome,
                            potencia: p.potencia ?? "",
                            custo: String(p.custo),
                            preco_sugerido: String(p.preco_sugerido),
                            ativo: p.ativo,
                          })
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Excluir produto" onClick={() => excluir(p)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    {isLoading ? "Carregando…" : "Nenhum produto cadastrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="grid gap-3">
              <Field label="Nome">
                <Input value={draft.nome} onChange={(e) => setDraft({ ...draft, nome: e.target.value })} />
              </Field>
              <Field label="Potência (ex.: 7,4 kW)">
                <Input value={draft.potencia} onChange={(e) => setDraft({ ...draft, potencia: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Custo (R$)">
                  <Input
                    type="number"
                    step="0.01"
                    value={draft.custo}
                    onChange={(e) => setDraft({ ...draft, custo: e.target.value })}
                  />
                </Field>
                <Field label="Preço sugerido (R$)">
                  <Input
                    type="number"
                    step="0.01"
                    value={draft.preco_sugerido}
                    onChange={(e) => setDraft({ ...draft, preco_sugerido: e.target.value })}
                  />
                </Field>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={draft.ativo} onCheckedChange={(v) => setDraft({ ...draft, ativo: v })} />
                <span className="text-sm">Disponível para propostas</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" /> Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------ UFs ------------------------------- */

function UfsTab() {
  const { data: ufs = [], isLoading } = useCpoUfs();
  const invalidate = useCpoInvalidate();
  const [edits, setEdits] = useState<Record<string, { aliq: string; fcp: string }>>({});
  const [saving, setSaving] = useState(false);

  const dirty = Object.keys(edits).length > 0;

  async function salvar() {
    setSaving(true);
    for (const [uf, v] of Object.entries(edits)) {
      const { error } = await supabase
        .from("cpo_uf_rates")
        .update({ aliq_interna: Number(v.aliq) / 100, fcp: Number(v.fcp) / 100 })
        .eq("uf", uf);
      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }
    }
    setSaving(false);
    setEdits({});
    invalidate();
    toast.success("Alíquotas atualizadas.");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Alíquota interna e FCP do estado de destino — usados no cálculo de DIFAL.
        </p>
        <Button onClick={salvar} disabled={!dirty || saving} className="gap-2">
          <Save className="h-4 w-4" /> Salvar alterações
        </Button>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="text-left px-4 py-3">UF</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-right px-4 py-3">Alíquota interna (%)</th>
                <th className="text-right px-4 py-3">FCP (%)</th>
              </tr>
            </thead>
            <tbody>
              {ufs.map((u) => {
                const e = edits[u.uf];
                return (
                  <tr key={u.uf} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="px-4 py-2 font-semibold">{u.uf}</td>
                    <td className="px-4 py-2 text-muted-foreground">{u.nome}</td>
                    <td className="px-4 py-2 text-right">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 w-28 ml-auto text-right"
                        value={e ? e.aliq : (u.aliq_interna * 100).toFixed(2)}
                        onChange={(ev) =>
                          setEdits((p) => ({
                            ...p,
                            [u.uf]: {
                              aliq: ev.target.value,
                              fcp: p[u.uf]?.fcp ?? (u.fcp * 100).toFixed(2),
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 w-28 ml-auto text-right"
                        value={e ? e.fcp : (u.fcp * 100).toFixed(2)}
                        onChange={(ev) =>
                          setEdits((p) => ({
                            ...p,
                            [u.uf]: {
                              aliq: p[u.uf]?.aliq ?? (u.aliq_interna * 100).toFixed(2),
                              fcp: ev.target.value,
                            },
                          }))
                        }
                      />
                    </td>
                  </tr>
                );
              })}
              {ufs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    {isLoading ? "Carregando…" : "Nenhuma UF cadastrada."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

