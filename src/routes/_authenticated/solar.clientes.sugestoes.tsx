import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * As Sugestões do Atlas foram mescladas no Radar (aba "Sugestões").
 * A rota antiga continua existindo apenas para redirecionar links salvos.
 */
export const Route = createFileRoute("/_authenticated/solar/clientes/sugestoes")({
  beforeLoad: () => {
    throw redirect({ to: "/atlas-ia/radar" });
  },
});
