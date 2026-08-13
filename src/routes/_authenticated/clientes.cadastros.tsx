import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { ClientesCadastroPage } from "@/components/clientes-cadastro-page";

export const Route = createFileRoute("/_authenticated/clientes/cadastros")({
  head: () => ({
    meta: [
      { title: "Cadastro de clientes — Portal 2P Solar" },
      { name: "description", content: "Cadastro universal de clientes com validação de CNPJ, checagem de duplicidade e enriquecimento automático de dados fiscais." },
      { property: "og:title", content: "Cadastro de clientes — Portal 2P Solar" },
      { property: "og:description", content: "Valide o CNPJ, evite duplicidade e preencha os dados fiscais automaticamente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppLayout>
      <ClientesCadastroPage instancia="solar" />
    </AppLayout>
  ),
});
