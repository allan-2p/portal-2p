import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/solar/dashboards")({
  head: () => ({
    meta: [
      { title: "Dashboards — Portal 2P" },
      {
        name: "description",
        content:
          "Painéis de metas e desempenho comercial do Portal 2P, por vendedor, equipe e período.",
      },
      { property: "og:title", content: "Dashboards — Portal 2P" },
      {
        property: "og:description",
        content:
          "Painéis de metas e desempenho comercial do Portal 2P, por vendedor, equipe e período.",
      },
      { property: "og:url", content: "/solar/dashboards" },
    ],
    links: [{ rel: "canonical", href: "/solar/dashboards" }],
  }),
  component: DashboardsLayout,
});


function DashboardsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/solar/dashboards" || pathname === "/solar/dashboards/") {
    return <Navigate to="/solar/dashboards/metas" replace />;
  }
  return <Outlet />;
}
