import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Users as UsersIcon, Loader2 } from "lucide-react";
import { getSalesforceSalespeople } from "@/lib/salesforce.functions";

export function VendedorFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const fetchSalespeople = useServerFn(getSalesforceSalespeople);
  const q = useQuery({
    queryKey: ["sf-salespeople"],
    queryFn: () => fetchSalespeople(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const people = q.data?.records ?? [];
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
