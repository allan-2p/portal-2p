import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { CpoConfigTab } from "@/components/cpo-config-tab";
import { CpoComissaoRegras } from "@/components/cpo-comissao-regras";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";


export const Route = createFileRoute("/_authenticated/carregadores/comissoes")({
  head: () => ({
    meta: [
      { title: "Comissões CPO — Portal 2P Carregadores" },
      { name: "description", content: "Política tributária e regras de comissão das propostas de carregadores." },
      { property: "og:title", content: "Comissões CPO — Portal 2P Carregadores" },
      { property: "og:description", content: "Defina base e percentual de comissão, IPI, PIS/COFINS e margens mínimas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="cpo.comissoes" area="moderacao">
      <ComissoesCpoPage />
    </AdminRouteGuard>
  ),
});

function ComissoesCpoPage() {
  return (
    <AppLayout>
      <div className="max-w-[1700px] mx-auto space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-primary font-semibold">Moderação</div>
          <h1 className="text-3xl font-bold mt-1">Comissões</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Regras de comissão por regime (CLT e PJ) e parâmetros tributários usados no DRE das propostas.
          </p>
        </div>
        <CpoComissaoRegras />
        <div>
          <h2 className="font-semibold mb-2">Parâmetros tributários</h2>
          <CpoConfigTab />
        </div>
      </div>


    </AppLayout>
  );
}
