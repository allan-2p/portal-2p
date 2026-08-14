import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { ModerationAuditLog } from "@/components/moderation-audit-log";
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
import { Pencil, Trash2, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logModeration } from "@/lib/moderation-audit";
import { validateAtivacaoCarregadores } from "@/lib/product-visibility";
import { useCpoInvalidate, useCpoProductsAdmin, useCpoUfs } from "@/hooks/use-cpo";
import { fmtBRL, type CpoProduct } from "@/lib/cpo";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";


export const Route = createFileRoute("/_authenticated/carregadores/produtos")({
  head: () => ({
    meta: [
      { title: "Gestão de Produtos — 2P Carregadores" },
      { name: "description", content: "Catálogo de carregadores, alíquotas por UF e política de margem." },
      { property: "og:title", content: "Gestão de Produtos — 2P Carregadores" },
      { property: "og:description", content: "Gerencie custos, ICMS/FCP por estado e regras de margem." },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="cpo.produtos">
      <ProdutosCpoPage />
    </AdminRouteGuard>
  ),
});

function ProdutosCpoPage() {
  return (
    <AppLayout>
      <div className="max-w-[1700px] mx-auto space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-primary font-semibold">Módulo CPO</div>
          <h1 className="text-3xl font-bold mt-1">Gestão de Produtos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Catálogo único do portal (alimentado pelo SAP e por edições manuais), alíquotas por UF. Base usada pelo cálculo de DRE das propostas de carregadores.
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

        <ModerationAuditLog area="cpo_produtos" description="alterações em produtos e alíquotas de Carregadores." />
      </div>
    </AppLayout>
  );
}

/* ---------------------------- Produtos ---------------------------- */

type Draft = {
  id?: string;
  codigo: string;
  nome: string;
  custo: string;
  ativo: boolean;
  ncm_id: string;
};


function ProdutosTab() {
  const { data: produtos = [], isLoading, error, refetch, isFetching } = useCpoProductsAdmin();
  const invalidate = useCpoInvalidate();
  const [busca, setBusca] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const filtrados = produtos.filter((p) =>
    `${p.codigo ?? ""} ${p.nome}`.toLowerCase().includes(busca.trim().toLowerCase()),
  );

  async function salvar() {
    if (!draft) return;
    if (!draft.id) return toast.error("Produtos só podem ser criados pela sincronização com o SAP.");
    if (!draft.nome.trim()) return toast.error("Informe o nome do produto.");
    const impedimento = draft.ativo
      ? validateAtivacaoCarregadores({ custo: Number(draft.custo) || 0, ncm_id: draft.ncm_id || null })
      : null;
    if (impedimento) return toast.error(impedimento);
    const payload = {
      descricao: draft.nome.trim(),
      custo: Number(draft.custo) || 0,
      ativo: draft.ativo,
      ncm_id: draft.ncm_id || null,
    };

    setSaving(true);
    const { error } = await supabase.from("sap_produtos").update(payload).eq("id", draft.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    void logModeration({
      area: "cpo_produtos",
      action: "atualizou",
      target: payload.descricao,
      summary: `Produto atualizado: ${payload.descricao}`,
      details: { custo: payload.custo, ativo: payload.ativo },
    });
    toast.success("Produto atualizado.");
    setDraft(null);
    invalidate();
  }


  async function excluir(p: CpoProduct) {
    const { error } = await supabase.from("sap_produtos").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    void logModeration({
      area: "cpo_produtos",
      action: "removeu",
      target: p.nome,
      summary: `Produto removido: ${p.nome}`,
    });
    toast.success("Produto removido.");
    invalidate();
  }

  async function toggleAtivo(p: CpoProduct) {
    if (!p.ativo) {
      const impedimento = validateAtivacaoCarregadores({ custo: Number(p.custo) || 0, ncm_id: p.ncm_id ?? null });
      if (impedimento) return toast.error(impedimento);
    }
    const { error } = await supabase.from("sap_produtos").update({ ativo: !p.ativo }).eq("id", p.id);
    if (error) return toast.error(error.message);
    void logModeration({
      area: "cpo_produtos",
      action: p.ativo ? "desativou" : "ativou",
      target: p.nome,
      summary: `Produto ${p.ativo ? "desativado" : "ativado"}: ${p.nome}`,
    });
    invalidate();
  }


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="text-left px-4 py-3">Código (SKU)</th>
                <th className="text-left px-4 py-3">Produto</th>
                <th className="text-left px-4 py-3">NCM</th>
                <th className="text-right px-4 py-3">Custo</th>
                <th className="text-center px-4 py-3">Ativo</th>
                <th className="text-right px-4 py-3">Ações</th>
              </tr>

            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-surface-2">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.codigo || "—"}</td>
                  <td className="px-4 py-3 font-medium">{p.nome}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {p.ncm_codigo ? (
                      <span className="text-muted-foreground">{p.ncm_codigo}</span>
                    ) : (
                      <span className="rounded-full bg-warning/10 px-2 py-0.5 font-sans text-[11px] font-medium text-warning">
                        NCM não veio do SAP
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{fmtBRL(p.custo)}</td>
                  <td className="px-4 py-3 text-center">
                    <Switch
                      checked={p.ativo}
                      onCheckedChange={() => toggleAtivo(p)}
                      aria-label={p.ativo ? "Desativar produto" : "Ativar produto"}
                      title={
                        !p.ativo && !p.ncm_id
                          ? "O NCM ainda não veio do SAP para este material"
                          : undefined
                      }
                    />
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
                            codigo: p.codigo ?? "",
                            nome: p.nome,
                            custo: String(p.custo),
                            ativo: p.ativo,
                            ncm_id: p.ncm_id ?? "",
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
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    {isLoading || isFetching ? (
                      "Carregando…"
                    ) : error ? (
                      <div className="space-y-2">
                        <p className="text-destructive">
                          Não foi possível carregar o catálogo: {(error as Error).message}
                        </p>
                        <Button variant="outline" size="sm" onClick={() => void refetch()}>
                          Tentar novamente
                        </Button>
                      </div>
                    ) : (
                      "Nenhum produto cadastrado."
                    )}
                  </td>

                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg overflow-hidden p-4 sm:p-6 max-h-[90dvh] flex flex-col gap-4">
          <DialogHeader className="text-left">
            <DialogTitle className="break-words">Editar produto</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3 min-w-0 flex-1 overflow-y-auto -mx-1 px-1">

              <Field label="Código (SKU)">
                <Input className="w-full" value={draft.codigo} readOnly disabled />
              </Field>

              <Field label="Nome">
                <Input className="w-full" value={draft.nome} onChange={(e) => setDraft({ ...draft, nome: e.target.value })} />
              </Field>
              
              <Field label="Custo (R$)">
                <Input
                  className="w-full"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={draft.custo}
                  onChange={(e) => setDraft({ ...draft, custo: e.target.value })}
                />
              </Field>

              <div className="flex items-start gap-3">
                <Switch
                  className="mt-0.5 shrink-0"
                  checked={draft.ativo}
                  onCheckedChange={(v) => setDraft({ ...draft, ativo: v })}
                />
                <span className="min-w-0 text-sm break-words">Disponível para propostas</span>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={saving} className="w-full gap-2 sm:w-auto">
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


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-xs text-muted-foreground break-words leading-snug block">{label}</Label>
      {children}
    </div>

  );
}

