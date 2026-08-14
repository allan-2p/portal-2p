import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { useInstance } from "@/components/instance-provider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { FeatureKey } from "@/lib/instances";
import type { CapabilityId } from "@/lib/feature-capabilities";

export const NO_PERMISSION_HINT = "Seu perfil não permite esta ação. Fale com um administrador.";

/** Hook simples: `can("pedidos", "editar")`. */
export function useCan(feature: FeatureKey, action: CapabilityId = "visualizar") {
  const { can } = useInstance();
  return can(feature, action);
}

/**
 * Esconde (padrão) ou desabilita o conteúdo quando o perfil não libera a
 * tela/ação. No modo `disable` o filho recebe `disabled` e um tooltip
 * explicando o bloqueio.
 */
export function PermissionGate({
  feature,
  action = "visualizar",
  mode = "hide",
  fallback = null,
  children,
}: {
  feature: FeatureKey;
  action?: CapabilityId;
  mode?: "hide" | "disable";
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const allowed = useCan(feature, action);
  if (allowed) return <>{children}</>;
  if (mode === "hide") return <>{fallback}</>;

  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<any>, {
        disabled: true,
        "aria-disabled": true,
      })
    : children;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed opacity-60">{child}</span>
        </TooltipTrigger>
        <TooltipContent>{NO_PERMISSION_HINT}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
