import { createFileRoute, redirect } from "@tanstack/react-router";

/** Estoque passou para Moderação › Grupo 2P; mantém links e favoritos antigos. */
export const Route = createFileRoute("/_authenticated/admin/estoque")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/grupo-2p" });
  },
  component: () => null,
});
