import { useEffect, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Users as UsersIcon, Loader2, Lock } from "lucide-react";
import { getSalesforceSalespeople } from "@/lib/salesforce.functions";
import { useSellerScope } from "@/hooks/use-seller-scope";

export function VendedorFilter({
  value,
  onChange,
  allowedIds,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Restrição adicional imposta pela tela (ex: Segmentação). Interseção com o escopo do usuário. */
  allowedIds?: string[];
}) {
  const { query: scopeQ, scope, ready: scopeReady } = useSellerScope();

  const fetchSalespeople = useServerFn(getSalesforceSalespeople);
  const q = useQuery({
    queryKey: ["sf-salespeople"],
    queryFn: () => fetchSalespeople(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Fail-safe: enquanto o escopo não carrega OU se der erro, trata como Individual
  // (nunca abre "Todos" antes de saber a permissão do usuário).
  const isIndividual = !scopeReady || scope?.scope === "individual";
  const lockedId = isIndividual
    ? (scope?.sf_user_id ?? null)
    : null;

  // Interseção: escopo do usuário ∩ allowedIds da tela
  const effectiveAllowed: Set<string> | null = useMemo(() => {
    const fromScope = scopeReady ? scope?.allowed_sf_ids ?? null : []; // enquanto carrega, restringe
    const fromPage = allowedIds ?? null;
    if (!fromScope && !fromPage) return null;
    const a = new Set(fromScope ?? []);
    if (!fromScope) return new Set(fromPage!);
    if (!fromPage) return a;
    return new Set(fromPage.filter((id) => a.has(id)));
  }, [scope, scopeReady, allowedIds]);

  // Trava o filtro no próprio vendedor
  useEffect(() => {
    if (lockedId && value !== lockedId) onChange(lockedId);
  }, [lockedId, value, onChange]);

  // Se "all" não é permitido, força a primeira opção válida (ou o próprio id).
  useEffect(() => {
    if (isIndividual) return;
    if (!effectiveAllowed) return;
    if (value === "all") {
      const first = effectiveAllowed.values().next().value;
      if (first) onChange(first);
      return;
    }
    if (!effectiveAllowed.has(value)) {
      const first = effectiveAllowed.values().next().value;
      if (first && first !== value) onChange(first);
    }
  }, [effectiveAllowed, value, isIndividual, onChange]);

  const people = (q.data?.records ?? []).filter((p) =>
    effectiveAllowed ? effectiveAllowed.has(p.id) : true,
  );

  // Enquanto o escopo carrega, mostra placeholder travado (sem "Todos")
  if (!scopeReady) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border opacity-80"
        title="Carregando permissões…"
      >
        <UsersIcon className="h-4 w-4 text-primary" />
        <label className="text-xs text-muted-foreground">Vendedor</label>
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (lockedId) {
    const me = people.find((p) => p.id === lockedId);
    const label = me?.name ?? "Você";
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border opacity-90"
        title="Filtro fixo — escopo Individual"
      >
        <UsersIcon className="h-4 w-4 text-primary" />
        <label className="text-xs text-muted-foreground">Vendedor</label>
        <span className="text-sm font-medium max-w-[220px] truncate">{label}</span>
        <Lock className="h-3 w-3 text-muted-foreground" />
      </div>
    );
  }

  // Escopo restrito (Pré Vendas / Carteira): não mostra "Todos" fora do subconjunto
  const showAll = scope?.scope === "geral" && !allowedIds;
  const scopeLabel =
    scope?.scope === "pre_vendas"
      ? "Pré Vendas"
      : scope?.scope === "carteira"
        ? "Carteira"
        : null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border">
      <UsersIcon className="h-4 w-4 text-primary" />
      <label className="text-xs text-muted-foreground">
        Vendedor{scopeLabel ? ` · ${scopeLabel}` : ""}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm font-medium outline-none pr-1 max-w-[220px]"
        disabled={q.isLoading || scopeQ.isLoading}
      >
        {showAll && <option value="all">Todos</option>}
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {(q.isFetching || scopeQ.isFetching) && (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
