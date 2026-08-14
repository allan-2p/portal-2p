import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  PROPOSTA_STATUS,
  propostaStatusStyle,
  type PropostaStatus,
} from "@/lib/proposta-status";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * UI universal de status de propostas/pedidos (2P Solar, 2P Carregadores, Grupo 2P).
 * Padrão: na lista aparece só a bolinha; a legenda fica acima da tabela.
 */

export function StatusDot({
  status,
  size = "md",
  className,
}: {
  status: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const s = propostaStatusStyle(status);
  const dim = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label={status}
            className={cn(
              "inline-block rounded-full ring-2 ring-background shadow-sm transition-transform hover:scale-125",
              dim,
              className,
            )}
            style={{ backgroundColor: s.bg }}
          />
        </TooltipTrigger>
        <TooltipContent
          className="border-0 font-medium"
          style={{ backgroundColor: s.bg, color: s.fg }}
        >
          {status}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Legenda horizontal minimalista — opcionalmente clicável para filtrar por status. */
export function StatusLegend({
  statuses = PROPOSTA_STATUS as unknown as string[],
  active,
  onToggle,
  className,
}: {
  statuses?: readonly string[];
  active?: string[] | null;
  onToggle?: (status: string) => void;
  className?: string;
}) {
  const interactive = typeof onToggle === "function";
  return (
    <div
      className={cn(
        "flex items-center gap-x-4 gap-y-2 flex-wrap text-xs",
        className,
      )}
      aria-label="Legenda de status"
    >
      {statuses.map((s) => {
        const st = propostaStatusStyle(s);
        const isActive = !active || active.length === 0 || active.includes(s);
        const Cmp = interactive ? "button" : "span";
        return (
          <Cmp
            key={s}
            {...(interactive
              ? { type: "button" as const, onClick: () => onToggle?.(s), "aria-pressed": isActive }
              : {})}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-2 py-1 transition-colors",
              interactive && "hover:bg-surface-2 cursor-pointer",
              !isActive && "opacity-35",
            )}
          >
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: st.bg }}
            />
            <span className="text-muted-foreground">{s}</span>
          </Cmp>
        );
      })}
    </div>
  );
}

/** Seletor compacto de status: bolinha + nome, coerente com a legenda. */
export function StatusPicker({
  value,
  options = PROPOSTA_STATUS as unknown as string[],
  onChange,
  disabled,
  compact = false,
}: {
  value: string;
  options?: readonly string[];
  onChange: (status: PropostaStatus) => void;
  disabled?: boolean;
  /** Mostra apenas a bolinha (padrão das listas). */
  compact?: boolean;
}) {
  const s = propostaStatusStyle(value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          title={value}
          className={cn(
            "inline-flex items-center transition-colors disabled:opacity-50",
            compact
              ? "h-7 w-7 justify-center rounded-full hover:bg-surface-2"
              : "gap-2 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-surface-2",
          )}
          aria-label={`Status: ${value}`}
        >
          <span
            className={cn(
              "rounded-full ring-2 ring-background transition-transform",
              compact ? "h-3 w-3 hover:scale-125" : "h-2.5 w-2.5",
            )}
            style={{ backgroundColor: s.bg }}
          />
          {!compact && (
            <>
              <span className="font-medium">{value}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        {options.map((o) => {
          const os = propostaStatusStyle(o);
          return (
            <DropdownMenuItem
              key={o}
              onSelect={() => onChange(o as PropostaStatus)}
              className="gap-2 text-xs"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: os.bg }} />
              <span className="flex-1">{o}</span>
              {o === value && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
