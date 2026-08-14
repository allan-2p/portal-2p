import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { AccessDenied } from "@/components/access-denied";
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
        <AccessDenied />
      </AppLayout>
    );
  }

  return <>{children}</>;
}
