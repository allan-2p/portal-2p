import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Users as UsersIcon, Loader2, Lock, ChevronDown, Check } from "lucide-react";
import { getSalesforceSalespeople } from "@/lib/salesforce.functions";
import { useSellerScope } from "@/hooks/use-seller-scope";

export function VendedorFilter({
  value,
  onChange,
  allowedIds,
  multiple = true,
}: {
  /** Um id, "all", ou vários ids separados por vírgula quando `multiple`. */
  value: string;
  onChange: (v: string) => void;
  /** Restrição adicional imposta pela tela (ex: Segmentação). Interseção com o escopo do usuário. */
  allowedIds?: string[];
  /** Permite selecionar vários vendedores ao mesmo tempo (padrão). */
  multiple?: boolean;
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
  const lockedId = isIndividual ? (scope?.sf_user_id ?? null) : null;

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

  const selectedIds = useMemo(
    () => (value === "all" || !value ? [] : value.split(",").filter(Boolean)),
    [value],
  );

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
    const valid = selectedIds.filter((id) => effectiveAllowed.has(id));
    if (valid.length === 0) {
      const first = effectiveAllowed.values().next().value;
      if (first) onChange(first);
    } else if (valid.length !== selectedIds.length) {
      onChange(valid.join(","));
    }
  }, [effectiveAllowed, value, selectedIds, isIndividual, onChange]);

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

  if (multiple) {
    return (
      <MultiVendedor
        people={people}
        selectedIds={selectedIds}
        showAll={showAll}
        scopeLabel={scopeLabel}
        loading={q.isFetching || scopeQ.isFetching}
        onChange={onChange}
      />
    );
  }

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

function MultiVendedor({
  people,
  selectedIds,
  showAll,
  scopeLabel,
  loading,
  onChange,
}: {
  people: { id: string; name: string }[];
  selectedIds: string[];
  showAll: boolean;
  scopeLabel: string | null;
  loading: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = new Set(selectedIds);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const arr = Array.from(next);
    if (arr.length === 0) onChange(showAll ? "all" : (people[0]?.id ?? "all"));
    else onChange(arr.join(","));
  };

  const label =
    selectedIds.length === 0
      ? "Todos"
      : selectedIds.length === 1
        ? (people.find((p) => p.id === selectedIds[0])?.name ?? "1 vendedor")
        : `${selectedIds.length} vendedores`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border hover:bg-surface-2 transition-colors"
      >
        <UsersIcon className="h-4 w-4 text-primary" />
        <span className="text-xs text-muted-foreground">
          Vendedor{scopeLabel ? ` · ${scopeLabel}` : ""}
        </span>
        <span className="text-sm font-medium max-w-[220px] truncate">{label}</span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 right-0 w-72 max-h-80 overflow-auto rounded-xl border border-border bg-card shadow-lg p-1">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Selecionar vendedores
            </span>
            {selectedIds.length > 0 && showAll && (
              <button
                type="button"
                onClick={() => onChange("all")}
                className="text-[11px] text-primary hover:underline"
              >
                Limpar
              </button>
            )}
          </div>
          {showAll && (
            <button
              type="button"
              onClick={() => onChange("all")}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-surface-2 text-left"
            >
              <span className="h-4 w-4 flex items-center justify-center">
                {selectedIds.length === 0 && <Check className="h-3.5 w-3.5 text-primary" />}
              </span>
              Todos
            </button>
          )}
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-surface-2 text-left"
            >
              <span className="h-4 w-4 flex items-center justify-center">
                {selected.has(p.id) && <Check className="h-3.5 w-3.5 text-primary" />}
              </span>
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
