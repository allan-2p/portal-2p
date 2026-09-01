import { createFileRoute, redirect } from "@tanstack/react-router";

/** A gestão de produtos passou para Moderação, separada por unidade. */
export const Route = createFileRoute("/_authenticated/admin/produtos")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/moderacao/produtos/$unidade", params: { unidade: "grupo-2p" } });
  },
  component: () => null,
});
