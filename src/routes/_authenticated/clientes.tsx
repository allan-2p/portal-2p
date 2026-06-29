import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/clientes")({
  component: ClientesLayout,
});

function ClientesLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/clientes" || pathname === "/clientes/") {
    return <Navigate to="/clientes/segmentacao" replace />;
  }
  return <Outlet />;
}
