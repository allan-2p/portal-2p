import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboards")({
  component: DashboardsLayout,
});

function DashboardsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/dashboards" || pathname === "/dashboards/") {
    return <Navigate to="/dashboards/geral" replace />;
  }
  return <Outlet />;
}
