import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/solar/clientes")({
  component: ClientesLayout,
});

function ClientesLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/solar/clientes" || pathname === "/solar/clientes/") {
    return <Navigate to="/solar/clientes/segmentacao" replace />;
  }
  return <Outlet />;
}
