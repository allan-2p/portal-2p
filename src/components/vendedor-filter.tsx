import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Users as UsersIcon, Loader2, Lock } from "lucide-react";
import { getSalesforceSalespeople } from "@/lib/salesforce.functions";
import { useAuth } from "@/hooks/use-auth";

export function VendedorFilter({
  value,
  onChange,
  allowedIds,
}: {
  value: string;
  onChange: (v: string) => void;
  allowedIds?: string[];
}) {
  const { profile, roles, loading } = useAuth();
  // Vendedor "puro": tem papel vendedor e nenhum papel elevado.
  const isLockedVendedor =
    !loading &&
    roles.includes("vendedor") &&
    !roles.some((r) => r === "admin" || r === "diretor" || r === "gerente" || r === "marketing");
  const lockedId = isLockedVendedor ? profile?.sf_user_id ?? null : null;

  const fetchSalespeople = useServerFn(getSalesforceSalespeople);
  const q = useQuery({
    queryKey: ["sf-salespeople"],
    queryFn: () => fetchSalespeople(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Trava o filtro no próprio vendedor
  useEffect(() => {
    if (lockedId && value !== lockedId) onChange(lockedId);
  }, [lockedId, value, onChange]);

  const allowed = allowedIds ? new Set(allowedIds) : null;
  const people = (q.data?.records ?? []).filter((p) => (allowed ? allowed.has(p.id) : true));

  if (lockedId) {
    const me = people.find((p) => p.id === lockedId);
    const label = me?.name ?? profile?.full_name ?? "Você";
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border opacity-90"
        title="Filtro fixo — vendedores visualizam apenas seus próprios dados"
      >
        <UsersIcon className="h-4 w-4 text-primary" />
        <label className="text-xs text-muted-foreground">Vendedor</label>
        <span className="text-sm font-medium max-w-[220px] truncate">{label}</span>
        <Lock className="h-3 w-3 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border">
      <UsersIcon className="h-4 w-4 text-primary" />
      <label className="text-xs text-muted-foreground">Vendedor</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm font-medium outline-none pr-1 max-w-[220px]"
        disabled={q.isLoading}
      >
        <option value="all">Todos</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {q.isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
    </div>
  );
}
