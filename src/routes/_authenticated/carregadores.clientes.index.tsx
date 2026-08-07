import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/carregadores/clientes/")({
  beforeLoad: () => {
    throw redirect({ to: "/carregadores/clientes/cadastros" });
  },
});
