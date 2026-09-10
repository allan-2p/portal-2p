import { createFileRoute } from "@tanstack/react-router";
import { catalogoFrom } from "@/lib/catalogo-client";
import { Suspense, lazy, useState } from "react";
import { useAbaPersistente } from "@/hooks/use-aba-persistente";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { useCarregadoresInvalidate, useCarregadoresUfs } from "@/hooks/use-carregadores";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { EstoquePainel } from "@/components/estoque-painel";
// Catálogo de fotos só é baixado quando a aba é aberta (chunk separado).
const CatalogoProdutosSap = lazy(() =>
  import("@/components/produtos/catalogo-produtos-sap").then((m) => ({ default: m.CatalogoProdutosSap })),
);
const CatalogoFotos = lazy(() =>
  import("@/components/produtos/catalogo-fotos").then((m) => ({ default: m.CatalogoFotos })),
);



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
    <AdminRouteGuard feature="carregadores.produtos" area="moderacao">
      <ProdutosCarregadoresPage />
    </AdminRouteGuard>
  ),
});

function ProdutosCarregadoresPage() {
  // "produtos" é o valor legado dos links antigos; hoje tudo vive no catálogo.
  const [aba, setAba] = useAbaPersistente("carregadores-produtos", "sap");
  const abaAtual = aba === "produtos" ? "sap" : aba;
  return (
    <AppLayout>
      <div className="max-w-[1700px] mx-auto space-y-5">
        <div>
          <h1 className="text-3xl font-bold mt-1">Gestão de Produtos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Catálogo único do portal (alimentado pelo SAP e por edições manuais), alíquotas por UF. Base usada pelo cálculo de DRE das propostas de carregadores.
          </p>
        </div>

        <Tabs value={abaAtual} onValueChange={setAba}>
          <TabsList>
            <TabsTrigger value="sap">Catálogo</TabsTrigger>
            <TabsTrigger value="fotos">Fotos do catálogo</TabsTrigger>
            <TabsTrigger value="estoque">Estoque</TabsTrigger>
            <TabsTrigger value="ufs">Alíquotas por UF</TabsTrigger>
          </TabsList>
          <TabsContent value="fotos" className="mt-4">
            <Suspense fallback={<p className="py-10 text-center text-muted-foreground">Carregando catálogo…</p>}>
              <CatalogoFotos />
            </Suspense>
          </TabsContent>
          <TabsContent value="sap" className="mt-4">
            <Suspense fallback={<p className="py-10 text-center text-muted-foreground">Carregando catálogo…</p>}>
              <CatalogoProdutosSap org="carregadores" />
            </Suspense>
          </TabsContent>
          <TabsContent value="estoque" className="mt-0">
            <EstoquePainel
              org="carregadores"
              titulo="Estoque — 2P Carregadores"
              descricao="Saldos, NCM, custo e containers em trânsito dos materiais da 2P Carregadores, vindos do SAP."
            />
          </TabsContent>
          <TabsContent value="ufs" className="mt-4"><UfsTab /></TabsContent>
        </Tabs>


      </div>
    </AppLayout>
  );
}

/* ------------------------------ UFs ------------------------------- */

function UfsTab() {
  const { data: ufs = [], isLoading } = useCarregadoresUfs();
  const invalidate = useCarregadoresInvalidate();
  const [edits, setEdits] = useState<Record<string, { aliq: string; fcp: string }>>({});
  const [saving, setSaving] = useState(false);

  const dirty = Object.keys(edits).length > 0;

  async function salvar() {
    setSaving(true);
    for (const [uf, v] of Object.entries(edits)) {
      const { error } = await catalogoFrom("carregadores_uf_rates")
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

