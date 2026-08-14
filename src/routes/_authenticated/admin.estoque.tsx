import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, Boxes, Ship, Package, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { listEstoque, syncEstoqueProdutos } from "@/lib/estoque.functions";

export const Route = createFileRoute("/_authenticated/admin/estoque")({
  component: EstoquePage,
  head: () => ({
    meta: [
      { title: "Estoque e Produtos | Portal 2P" },
      {
        name: "description",
        content: "Estoque, NCM e catálogo consolidado do SAP para 2P Solar e 2P Carregadores.",
      },
      { property: "og:title", content: "Estoque e Produtos | Portal 2P" },
      {
        property: "og:description",
        content: "Saldos, containers em trânsito e produtos consolidados do SAP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));
const qtd = (v: number) => new Intl.NumberFormat("pt-BR").format(Number(v ?? 0));

function statusEstoque(livre: number, pend: number, entreposto: number, futuro: number) {
  if (livre - pend > 0) return { label: "Em estoque", cls: "bg-emerald-500/15 text-emerald-600" };
  if (entreposto > 0) return { label: "Entreposto", cls: "bg-sky-500/15 text-sky-600" };
  if (futuro > 0) return { label: "Sob encomenda", cls: "bg-amber-500/15 text-amber-600" };
  return { label: "Indisponível", cls: "bg-muted text-muted-foreground" };
}

function EstoquePage() {
  const fetchAll = useServerFn(listEstoque);
  const sync = useServerFn(syncEstoqueProdutos);
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");

  const q = useQuery({ queryKey: ["estoque-consolidado"], queryFn: () => fetchAll({}) });

  const syncM = useMutation({
    mutationFn: () => sync({}),
    onSuccess: (r) => {
      const pulados = r.espelho.filter((e) => !e.ok);
      toast.success(
        `Sincronizado: ${r.materiais} materiais, ${r.containers} containers, ${r.produtos} produtos.`,
      );
      for (const p of pulados) toast.warning(`Espelho ${p.target}: ${p.message}`);
      qc.invalidateQueries({ queryKey: ["estoque-consolidado"] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const futuroPorMaterial = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of q.data?.containers ?? []) {
      m.set(c.material, (m.get(c.material) ?? 0) + Number(c.est_entreposto ?? 0));
    }
    return m;
  }, [q.data]);

  const termo = busca.trim().toLowerCase();
  const filtrar = <T extends Record<string, any>>(rows: T[], campos: string[]) =>
    !termo
      ? rows
      : rows.filter((r) => campos.some((c) => String(r[c] ?? "").toLowerCase().includes(termo)));

  const produtos = filtrar(q.data?.produtos ?? [], ["codigo", "descricao", "ncm"]);
  const estoque = filtrar(q.data?.estoque ?? [], ["material", "descricao", "ncm"]);
  const containers = filtrar(q.data?.containers ?? [], ["id_container", "material", "supplier"]);
  const lastRun = q.data?.lastRun ?? null;

  return (
    <AppLayout>
      <AdminRouteGuard feature="admin.objetos.produtos" area="configuracoes">
        <div className="space-y-6 p-4 md:p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Estoque e Produtos</h1>
              <p className="text-sm text-muted-foreground">
                Base consolidada do SAP (RFC ZHDIT_ZMMR059): catálogo, NCM, custo, preço e saldos —
                replicada para 2P Solar e 2P Carregadores.
              </p>
            </div>
            <Button onClick={() => syncM.mutate()} disabled={syncM.isPending}>
              {syncM.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sincronizar SAP
            </Button>
          </header>

          {lastRun?.status === "error" && (
            <Card className="border-destructive/40">
              <CardContent className="flex items-start gap-2 pt-6 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{lastRun.error_message}</span>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: Package, label: "Produtos consolidados", valor: q.data?.produtos.length ?? 0 },
              { icon: Boxes, label: "Materiais com estoque", valor: q.data?.estoque.length ?? 0 },
              { icon: Ship, label: "Containers em trânsito", valor: q.data?.containers.length ?? 0 },
            ].map((c) => (
              <Card key={c.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <c.icon className="h-4 w-4" />
                    {c.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{qtd(c.valor)}</CardContent>
              </Card>
            ))}
          </div>

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por código, descrição, NCM..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          {q.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <Tabs defaultValue="produtos">
              <TabsList>
                <TabsTrigger value="produtos">Produtos</TabsTrigger>
                <TabsTrigger value="estoque">Estoque</TabsTrigger>
                <TabsTrigger value="containers">Em trânsito</TabsTrigger>
              </TabsList>

              <TabsContent value="produtos" className="mt-4">
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="p-3">Código</th>
                        <th className="p-3">Descrição</th>
                        <th className="p-3">NCM</th>
                        <th className="p-3">Visibilidade</th>
                        <th className="p-3 text-right">Custo</th>
                        <th className="p-3 text-right">Preço SAP</th>
                        <th className="p-3">Catálogo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {produtos.map((p) => (
                        <tr key={p.codigo} className="border-t">
                          <td className="p-3 font-mono text-xs">{p.codigo}</td>
                          <td className="p-3">{p.descricao}</td>
                          <td className="p-3 font-mono text-xs">
                            {p.ncm ?? <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="p-3 capitalize">{p.visibilidade}</td>
                          <td className="p-3 text-right">{money(p.custo)}</td>
                          <td className="p-3 text-right">{money(p.preco_venda)}</td>
                          <td className="p-3">
                            {p.no_catalogo ? (
                              <Badge variant="secondary">No catálogo</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {produtos.length === 0 && (
                        <tr>
                          <td className="p-6 text-center text-muted-foreground" colSpan={7}>
                            Nenhum produto. Rode a sincronização com o SAP.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="estoque" className="mt-4">
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="p-3">Material</th>
                        <th className="p-3">Descrição</th>
                        <th className="p-3">NCM</th>
                        <th className="p-3 text-right">Livre</th>
                        <th className="p-3 text-right">Pendente</th>
                        <th className="p-3 text-right">Entreposto</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estoque.map((e) => {
                        const s = statusEstoque(
                          e.est_livre,
                          e.qtd_pend_faturar,
                          e.est_entreposto,
                          futuroPorMaterial.get(e.material) ?? 0,
                        );
                        return (
                          <tr key={e.material} className="border-t">
                            <td className="p-3 font-mono text-xs">{e.material}</td>
                            <td className="p-3">{e.descricao}</td>
                            <td className="p-3 font-mono text-xs">{e.ncm ?? "—"}</td>
                            <td className="p-3 text-right">{qtd(e.est_livre)}</td>
                            <td className="p-3 text-right">{qtd(e.qtd_pend_faturar)}</td>
                            <td className="p-3 text-right">{qtd(e.est_entreposto)}</td>
                            <td className="p-3">
                              <span className={`rounded px-2 py-0.5 text-xs font-medium ${s.cls}`}>
                                {s.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {estoque.length === 0 && (
                        <tr>
                          <td className="p-6 text-center text-muted-foreground" colSpan={7}>
                            Sem dados de estoque.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="containers" className="mt-4">
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="p-3">Container</th>
                        <th className="p-3">Material</th>
                        <th className="p-3">Fornecedor</th>
                        <th className="p-3 text-right">Quantidade</th>
                        <th className="p-3">Remessa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {containers.map((c) => (
                        <tr key={`${c.id_container}-${c.material}`} className="border-t">
                          <td className="p-3 font-mono text-xs">{c.id_container}</td>
                          <td className="p-3 font-mono text-xs">{c.material}</td>
                          <td className="p-3">{c.supplier ?? "—"}</td>
                          <td className="p-3 text-right">{qtd(c.est_entreposto)}</td>
                          <td className="p-3">{c.dt_remessa ?? "Pronta entrega"}</td>
                        </tr>
                      ))}
                      {containers.length === 0 && (
                        <tr>
                          <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                            Nenhum pedido em trânsito.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </AdminRouteGuard>
    </AppLayout>
  );
}
