import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { AccessDenied } from "@/components/access-denied";
import { getAdminAreas } from "@/lib/admin-guard.functions";
import type { AdminSectionId } from "@/lib/admin-nav";

/**
 * Guard das homes administrativas: libera quem tem o toggle da área ou
 * qualquer tela dela (mesma regra da engrenagem, validada no backend).
 */
export function AdminAreaGuard({
  area,
  children,
}: {
  area: AdminSectionId;
  children: ReactNode;
}) {
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

  if (data?.[area] !== true) {
    return (
      <AppLayout>
        <AccessDenied />
      </AppLayout>
    );
  }

  return <>{children}</>;
}
