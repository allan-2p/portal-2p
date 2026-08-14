import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2, ShieldAlert } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { checkAdminFeature } from "@/lib/admin-guard.functions";
import type { FeatureKey } from "@/lib/instances";
import type { CapabilityId } from "@/lib/feature-capabilities";

/**
 * Guard de rota administrativa: a permissão é validada no backend
 * (`checkAdminFeature`), então abrir a URL direto não libera a tela.
 */
export function AdminRouteGuard({
  feature,
  action = "visualizar",
  children,
}: {
  feature: FeatureKey;
  action?: CapabilityId;
  children: ReactNode;
}) {
  const check = useServerFn(checkAdminFeature);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-feature-guard", feature, action],
    queryFn: () => check({ data: { feature, action } }),
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

  if (!data?.allowed) {
    return (
      <AppLayout>
        <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 text-center">
          <ShieldAlert className="h-10 w-10 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold">Acesso restrito</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Seu perfil não tem permissão para esta tela. Fale com um administrador
              se precisar de acesso.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/">Voltar para a home</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  return <>{children}</>;
}
