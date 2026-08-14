import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { AccessDenied } from "@/components/access-denied";
import { checkAdminFeature, getAdminAreas } from "@/lib/admin-guard.functions";
import type { FeatureKey } from "@/lib/instances";
import type { AdminSectionId } from "@/lib/admin-nav";
import type { CapabilityId } from "@/lib/feature-capabilities";

/**
 * Guard de rota administrativa: a permissão é validada no backend
 * (`checkAdminFeature`), então abrir a URL direto não libera a tela.
 * Quando `area` é informada, o usuário também precisa ter acesso à área
 * (Configurações, Moderação, Integrações ou Logs) que contém a tela.
 */
export function AdminRouteGuard({
  feature,
  action = "visualizar",
  area,
  children,
}: {
  feature: FeatureKey;
  action?: CapabilityId;
  area?: AdminSectionId;
  children: ReactNode;
}) {
  const check = useServerFn(checkAdminFeature);
  const fetchAreas = useServerFn(getAdminAreas);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-feature-guard", feature, action],
    queryFn: () => check({ data: { feature, action } }),
    staleTime: 60_000,
  });
  const areasQ = useQuery({
    queryKey: ["admin-areas"],
    queryFn: () => fetchAreas(),
    staleTime: 60_000,
    enabled: !!area,
  });

  if (isLoading || (!!area && areasQ.isLoading)) {
    return (
      <AppLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const areaOk = !area || areasQ.data?.[area] === true;

  if (!data?.allowed || !areaOk) {
    return (
      <AppLayout>
        <AccessDenied />
      </AppLayout>
    );
  }

  return <>{children}</>;
}
