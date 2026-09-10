import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAbaPersistente } from "@/hooks/use-aba-persistente";
import { CatalogoProdutosSap } from "@/components/produtos/catalogo-produtos-sap";
import { EstoquePainel } from "@/components/estoque-painel";

// A galeria de fotos só é baixada quando a aba é aberta (chunk separado).
const CatalogoFotos = lazy(() =>
  import("@/components/produtos/catalogo-fotos").then((m) => ({ default: m.CatalogoFotos })),
);


export const Route = createFileRoute("/_authenticated/admin/produtos-solar")({
  head: () => ({
    meta: [
      { title: "Gestão de Produtos — 2P Solar" },
      { name: "description", content: "Controle de produtos ativos e inativos do catálogo 2P Solar, alimentado pelo SAP." },
      { property: "og:title", content: "Gestão de Produtos — 2P Solar" },
      { property: "og:description", content: "Ative ou inative os produtos disponíveis no portal 2P Solar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.produtos" area="moderacao">
      <ProdutosSolarPage />
    </AdminRouteGuard>
  ),
});

/** Gestão de Produtos do 2P Solar: catálogo (fonte única) e estoque. */
function ProdutosSolarPage() {
  // "catalogo" é o valor legado dos links antigos; hoje aponta para o catálogo SAP.
  const [aba, setAba] = useAbaPersistente("produtos-solar", "sap");
  const abaAtual = aba === "catalogo" ? "sap" : aba;
  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-primary font-semibold">Moderação · 2P Solar</div>
          <h1 className="text-3xl font-bold mt-1">Gestão de Produtos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Catálogo e estoque da 2P Solar. O catálogo é a única fonte de ativação, visibilidade,
            nome, preço e foto dos produtos desta unidade.
          </p>
        </div>

        <Tabs value={abaAtual} onValueChange={setAba}>
          <TabsList>
            <TabsTrigger value="sap">Catálogo</TabsTrigger>
            <TabsTrigger value="fotos">Fotos do catálogo</TabsTrigger>
            <TabsTrigger value="estoque">Estoque</TabsTrigger>
          </TabsList>
          <TabsContent value="sap" className="mt-4">
            <CatalogoProdutosSap org="solar" />
          </TabsContent>
          <TabsContent value="fotos" className="mt-4">
            <Suspense fallback={<p className="py-10 text-center text-muted-foreground">Carregando catálogo…</p>}>
              <CatalogoFotos org="solar" />
            </Suspense>
          </TabsContent>

          <TabsContent value="estoque" className="mt-0">
            <EstoquePainel
              org="solar"
              titulo="Estoque — 2P Solar"
              descricao="Saldos, NCM, custo e containers em trânsito dos materiais da 2P Solar, vindos do SAP."
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
