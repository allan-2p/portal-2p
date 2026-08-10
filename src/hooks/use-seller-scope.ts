import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyScope, type MyScope } from "@/lib/scope.functions";
import { useAuth } from "@/hooks/use-auth";

export function useSellerScope() {
  const { user, loading: authLoading } = useAuth();
  const fetchScope = useServerFn(getMyScope);
  const query = useQuery({
    queryKey: ["my-scope", user?.id],
    queryFn: () => fetchScope(),
    enabled: !!user && !authLoading,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    query,
    scope: query.data,
    ready: !!user && !authLoading && !query.isLoading && !query.isError && !!query.data,
  };
}

function resolveOwner(selected: string, scope: MyScope | undefined): string | null {
  if (!scope) return null;
  if (scope.scope === "geral") return selected;
  const allowed = scope.allowed_sf_ids ?? [];
  if (selected !== "all") {
    const ids = selected.split(",").map((v) => v.trim()).filter((v) => allowed.includes(v));
    if (ids.length) return ids.join(",");
  }
  return allowed[0] ?? null;
}

export function useScopedOwner(initialOwnerId = "all") {
  const [ownerId, setOwnerIdState] = useState(initialOwnerId);
  const sellerScope = useSellerScope();
  const effectiveOwnerId = useMemo(
    () => resolveOwner(ownerId, sellerScope.scope),
    [ownerId, sellerScope.scope],
  );

  useEffect(() => {
    if (!sellerScope.ready || !effectiveOwnerId || ownerId === effectiveOwnerId) return;
    setOwnerIdState(effectiveOwnerId);
  }, [effectiveOwnerId, ownerId, sellerScope.ready]);

  const setOwnerId = useCallback((next: string) => {
    setOwnerIdState(next);
  }, []);

  return {
    ownerId,
    setOwnerId,
    effectiveOwnerId,
    ownerParam: effectiveOwnerId && effectiveOwnerId !== "all" ? effectiveOwnerId : null,
    dataEnabled: sellerScope.ready && (effectiveOwnerId === "all" || !!effectiveOwnerId),
    sellerScope,
  };
}