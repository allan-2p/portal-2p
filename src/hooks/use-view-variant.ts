import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useInstance } from "@/components/instance-provider";
import {
  resolveVariant,
  type ScreenKey,
  type VariantKey,
  type ResolveContext,
} from "@/lib/view-screens";
import {
  getMyViewPreferences,
  setMyViewPreference,
  listVariantRoutings,
} from "@/lib/views.functions";

/**
 * Retorna qual variante renderizar para `screen`, dado:
 *  - as variantes disponíveis (declaradas pelo próprio componente),
 *  - o override pessoal do usuário (toggle "Ver como"),
 *  - o override configurado por admin em `view_variants`,
 *  - fallback determinístico por role+cargo+instance.
 */
export function useViewVariant(screen: ScreenKey, available: VariantKey[]) {
  const { profile, roles, loading } = useAuth();
  const { instance } = useInstance();
  const fetchPrefs = useServerFn(getMyViewPreferences);
  const fetchRoutings = useServerFn(listVariantRoutings);

  const prefsQ = useQuery({
    queryKey: ["view-prefs"],
    queryFn: () => fetchPrefs(),
    staleTime: 60_000,
    enabled: !loading,
  });
  const routingsQ = useQuery({
    queryKey: ["view-routings"],
    queryFn: () => fetchRoutings(),
    staleTime: 60_000,
    enabled: !loading,
  });

  const ctx: ResolveContext = {
    role: roles[0] ?? null,
    cargo: profile?.cargo_tipo ?? profile?.cargo ?? null,
    instance,
  };

  const override = useMemo(() => {
    const personal = prefsQ.data?.[screen];
    if (personal) return personal;
    // Admin routing: primeira linha que casa (mais específica ganha por ordem
    // dos candidatos que resolveVariant enumera).
    const routings = (routingsQ.data ?? []).filter(
      (r) => r.screen === screen && r.enabled,
    );
    if (!routings.length) return null;
    const cargoSlug = ctx.cargo
      ? ctx.cargo.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
      : null;
    const match = routings.find(
      (r) =>
        (r.role == null || r.role === ctx.role) &&
        (r.cargo == null || (cargoSlug && slug(r.cargo) === cargoSlug)) &&
        (r.instance_id == null || r.instance_id === ctx.instance),
    );
    return match?.variant_key ?? null;
  }, [prefsQ.data, routingsQ.data, screen, ctx.role, ctx.cargo, ctx.instance]);

  const variant = resolveVariant(available, ctx, override);
  return {
    variant,
    override,
    personal: prefsQ.data?.[screen] ?? null,
    ctx,
    loading: prefsQ.isLoading || routingsQ.isLoading,
  };
}

export function useSetMyViewPreference() {
  const qc = useQueryClient();
  const mutFn = useServerFn(setMyViewPreference);
  return useMutation({
    mutationFn: (args: { screen: string; variant_key: string | null }) => mutFn({ data: args }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["view-prefs"] }),
  });
}

function slug(v: string) {
  return v.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
