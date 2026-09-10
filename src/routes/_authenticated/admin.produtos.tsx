import { createFileRoute, redirect } from "@tanstack/react-router";

/** Produtos passou para Moderação › Grupo 2P; mantém links e favoritos antigos. */
export const Route = createFileRoute("/_authenticated/admin/produtos")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/grupo-2p" });
  },
  component: () => null,
});
