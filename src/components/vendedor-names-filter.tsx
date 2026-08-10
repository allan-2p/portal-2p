import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Users as UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Filtro de vendedores por NOME, com multi-seleção.
 * Valor: "__all__" ou nomes separados por vírgula.
 * Mesma semântica visual do filtro do Perfil de Cliente.
 */
export function VendedorNamesFilter({
  value,
  onChange,
  options,
  disabled = false,
  allLabel = "Todos",
  className,
  showIcon = true,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
  allLabel?: string;
  className?: string;
  showIcon?: boolean;
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

  const selected = useMemo(() => parseVendedores(value), [value]);
  const selectedSet = new Set(selected);

  const toggle = (name: string) => {
    const next = new Set(selectedSet);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    const arr = Array.from(next);
    onChange(arr.length === 0 ? "__all__" : arr.join(","));
  };

  const label =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? selected[0]
        : `${selected.length} vendedores`;

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 h-9 px-3 rounded-lg bg-surface border border-border text-sm hover:bg-surface-2 transition-colors w-[220px]",
          disabled && "opacity-60 cursor-not-allowed",
        )}
      >
        {showIcon && <UsersIcon className="h-3.5 w-3.5 text-primary shrink-0" />}
        <span className="truncate flex-1 text-left font-medium">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-2 left-0 w-72 max-h-80 overflow-auto rounded-xl border border-border bg-card shadow-lg p-1">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Selecionar vendedores
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange("__all__")}
                className="text-[11px] text-primary hover:underline"
              >
                Limpar
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => onChange("__all__")}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-surface-2 text-left"
          >
            <span className="h-4 w-4 flex items-center justify-center">
              {selected.length === 0 && <Check className="h-3.5 w-3.5 text-primary" />}
            </span>
            {allLabel}
          </button>
          {options.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-surface-2 text-left"
            >
              <span className="h-4 w-4 flex items-center justify-center">
                {selectedSet.has(v) && <Check className="h-3.5 w-3.5 text-primary" />}
              </span>
              <span className="truncate">{v}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "__all__" / "" → []; senão a lista de nomes selecionados. */
export function parseVendedores(value: string): string[] {
  if (!value || value === "__all__") return [];
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

/** true quando o registro passa no filtro (lista vazia = todos). */
export function matchVendedor(selected: string[], owner: string | null | undefined) {
  if (selected.length === 0) return true;
  return selected.includes(owner ?? "");
}
