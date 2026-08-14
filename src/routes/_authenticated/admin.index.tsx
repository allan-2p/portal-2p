import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2, Shield } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { AccessDenied } from "@/components/access-denied";
import { getAdminAreas } from "@/lib/admin-guard.functions";
import { ADMIN_SECTIONS } from "@/lib/admin-nav";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Administração | Portal 2P" },
      {
        name: "description",
        content:
          "Ambiente de administração do Grupo 2P: configurações, moderação, integrações e logs, sem instância específica.",
      },
      { property: "og:title", content: "Administração | Portal 2P" },
      {
        property: "og:description",
        content: "Área neutra do Grupo 2P com configurações, moderação, integrações e logs do Portal 2P.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdministracaoHome,
});

function AdministracaoHome() {
  const fetchAreas = useServerFn(getAdminAreas);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-areas"],
    queryFn: () => fetchAreas(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const sections = ADMIN_SECTIONS.filter((s) => data?.[s.id] === true);

  if (!sections.length) {
    return (
      <AppLayout>
        <AccessDenied />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-foreground text-background flex items-center justify-center shrink-0">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Grupo 2P
            </div>
            <h1 className="font-display text-2xl font-bold">Administração</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Ambiente neutro do grupo — sem instância específica. Configurações, moderação,
              integrações e logs do Portal 2P.
            </p>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.id}
                to={s.home}
                className="group rounded-xl border border-border bg-surface hover:bg-surface-2 p-4 transition-colors flex items-start gap-3"
              >
                <span className="h-9 w-9 rounded-lg bg-foreground/10 flex items-center justify-center shrink-0">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-semibold">
                    {s.label}
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{s.description}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
