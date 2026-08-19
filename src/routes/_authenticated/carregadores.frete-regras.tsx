import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { ModeracaoPlaceholder } from "@/components/admin/moderacao-placeholder";
import { FreteRegrasEditor } from "@/components/admin/frete-regras-editor";

export const Route = createFileRoute("/_authenticated/carregadores/frete-regras")({
  head: () => ({
    meta: [
      { title: "Regras de Fretes — 2P Carregadores | Portal 2P" },
      {
        name: "description",
        content:
          "Regras de frete das propostas de carregadores: bloqueio da Braspress por potência (80 kW), área rural e taxa de despacho para CPF.",
      },
      { property: "og:title", content: "Regras de Fretes — 2P Carregadores | Portal 2P" },
      {
        property: "og:description",
        content: "Controle das restrições de frete aplicadas nas propostas de carregadores do Grupo 2P.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="carregadores.regras" area="moderacao">
      <AppLayout>
        <ModeracaoPlaceholder
          unidade="2P Carregadores"
          titulo="Regras de Fretes"
          descricao="Restrições e taxas aplicadas automaticamente nas cotações Fretefy das propostas de carregadores."
        >
          <p className="text-sm text-muted-foreground">
            Carregadores acima da potência máxima configurada (padrão 60 kW, o que inclui os de 80 kW) não
            são transportados pela Braspress — ela some da lista de opções na proposta. As regras de trilhos
            são exclusivas da 2P Solar e não se aplicam aqui.
          </p>
        </ModeracaoPlaceholder>
        <div className="max-w-[1100px] mx-auto mt-5">
          <FreteRegrasEditor unidade="carregadores" />
        </div>
      </AppLayout>
    </AdminRouteGuard>
  ),
});
