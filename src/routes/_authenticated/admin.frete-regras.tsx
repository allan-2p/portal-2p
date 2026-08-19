import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { ModeracaoPlaceholder } from "@/components/admin/moderacao-placeholder";
import { FreteRegrasEditor } from "@/components/admin/frete-regras-editor";

export const Route = createFileRoute("/_authenticated/admin/frete-regras")({
  head: () => ({
    meta: [
      { title: "Regras de Fretes — 2P Solar | Portal 2P" },
      {
        name: "description",
        content:
          "Regras de frete aplicadas nas cotações do Portal 2P: bloqueios por transportadora, adicionais TDE, área rural e limites — com personalização pelo painel.",
      },
      { property: "og:title", content: "Regras de Fretes — 2P Solar | Portal 2P" },
      {
        property: "og:description",
        content: "Controle das restrições e adicionais de frete aplicados nas propostas do Grupo 2P.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.regras" area="moderacao">
      <AppLayout>
        <ModeracaoPlaceholder
          unidade="2P Solar"
          titulo="Regras de Fretes"
          descricao="Restrições por transportadora, adicionais (TDE) e taxas aplicados automaticamente em toda cotação Fretefy — editáveis aqui."
        >
          <p className="text-sm text-muted-foreground">
            O que estiver salvo nesta tela é exatamente o que o portal aplica na cotação da proposta: as
            transportadoras bloqueadas somem da lista de opções e os adicionais entram no valor final, com o
            ajuste registrado ao lado de cada opção.
          </p>
        </ModeracaoPlaceholder>
        <div className="max-w-[1100px] mx-auto mt-5">
          <FreteRegrasEditor unidade="solar" />
        </div>
      </AppLayout>
    </AdminRouteGuard>
  ),
});
