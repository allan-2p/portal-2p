import { createFileRoute } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAbaPersistente } from "@/hooks/use-aba-persistente";
import { CatalogoProdutosSap } from "@/components/produtos/catalogo-produtos-sap";
import { EstoquePainel } from "@/components/estoque-painel";

export const Route = createFileRoute("/_authenticated/admin/grupo-2p")({
  head: () => ({
    meta: [
      { title: "Grupo 2P — Produtos e Estoque | Portal 2P" },
      {
        name: "description",
        content:
          "Moderação do Grupo 2P: catálogo de produtos do SAP, visibilidade por unidade e estoque consolidado.",
      },
      { property: "og:title", content: "Grupo 2P — Produtos e Estoque | Portal 2P" },
      {
        property: "og:description",
        content: "Catálogo de produtos e estoque consolidado do Grupo 2P em uma única tela.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Grupo2pPage,
});

function Grupo2pPage() {
  const [aba, setAba] = useAbaPersistente("grupo-2p", "produtos");

  return (
    <AppLayout>
      <AdminRouteGuard feature="admin.objetos.produtos" area="moderacao">
        <div className="p-4 pb-0 md:p-6 md:pb-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Boxes className="h-5 w-5 text-primary" />
            Grupo 2P
          </h1>
          <p className="text-sm text-muted-foreground">
            Produtos e estoque compartilhados pela 2P Solar e pela 2P Carregadores.
          </p>
        </div>
        <Tabs value={aba} onValueChange={setAba} className="w-full">
          <div className="px-4 pt-4 md:px-6">
            <TabsList>
              <TabsTrigger value="produtos">Produtos</TabsTrigger>
              <TabsTrigger value="estoque">Estoque</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="produtos" className="mt-0">
            <CatalogoProdutosSap />
          </TabsContent>
          <TabsContent value="estoque" className="mt-0">
            <EstoquePainel />
          </TabsContent>
        </Tabs>
      </AdminRouteGuard>
    </AppLayout>
  );
}
