import { createFileRoute, redirect } from "@tanstack/react-router";

/** Produtos e Estoque agora vivem na Gestão de Produtos de cada unidade. */
export const Route = createFileRoute("/_authenticated/admin/grupo-2p")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/produtos-solar" });
  },
  component: () => null,
});
