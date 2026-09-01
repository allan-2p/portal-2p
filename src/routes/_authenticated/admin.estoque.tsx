import { createFileRoute, redirect } from "@tanstack/react-router";

/** O estoque passou para Moderação, separado por unidade. */
export const Route = createFileRoute("/_authenticated/admin/estoque")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/moderacao/estoque/$unidade", params: { unidade: "grupo-2p" } });
  },
  component: () => null,
});
