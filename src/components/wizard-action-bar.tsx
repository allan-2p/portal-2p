import * as React from "react";
import { ChevronLeft, ChevronRight, AlertCircle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type WizardAction = {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  /** Escondido em telas pequenas quando o rótulo é secundário. */
  hideLabelOnMobile?: boolean;
};

export type WizardActionBarProps = {
  step: number;
  totalSteps: number;
  stepLabel?: string;
  onBack?: () => void;
  onNext?: () => void;
  backDisabled?: boolean;
  nextDisabled?: boolean;
  /** Lista de pendências; quando houver, aparece um chip de alerta. */
  errors?: string[];
  /** Só exibe as pendências depois de uma tentativa do usuário. */
  showErrors?: boolean;
  /** Horário do último salvamento automático. */
  savedAt?: Date | null;
  savedLabel?: string;
  /** Ações secundárias (salvar, exportar...). */
  actions?: WizardAction[];
  /** Ação principal, sempre à direita. */
  primary?: WizardAction | null;
  className?: string;
};

/**
 * Barra de ações fixa para fluxos em etapas — padrão global do portal.
 * Esquerda: progresso e status. Direita: navegação, ações e CTA principal.
 */
export function WizardActionBar({
  step,
  totalSteps,
  stepLabel,
  onBack,
  onNext,
  backDisabled,
  nextDisabled,
  errors = [],
  showErrors = false,
  savedAt,
  savedLabel = "Rascunho salvo",
  actions = [],
  primary,
  className,
}: WizardActionBarProps) {
  const pending = showErrors ? errors : [];
  const pct = Math.round((step / Math.max(totalSteps, 1)) * 100);

  return (
    <div
      className={cn(
        "sticky bottom-0 z-30 mt-6 -mx-4 sm:-mx-6 lg:-mx-8",
        "border-t border-border bg-background/80 backdrop-blur-xl",
        "shadow-[0_-8px_24px_-16px_hsl(var(--foreground)/0.35)]",
        className,
      )}
    >
      {/* Progresso do fluxo */}
      <div className="h-0.5 w-full bg-border/60">
        <div
          className="h-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Status do fluxo */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="hidden sm:inline-flex h-8 shrink-0 items-center rounded-full border border-border bg-surface-2 px-3 text-xs font-semibold tabular-nums text-muted-foreground">
              {step}/{totalSteps}
            </span>
            <div className="min-w-0">
              {stepLabel ? (
                <div className="text-sm font-semibold truncate">{stepLabel}</div>
              ) : null}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {savedAt ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    {savedLabel} às{" "}
                    {savedAt.toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                ) : null}
                {pending.length > 0 ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/15 transition-colors"
                      >
                        <AlertCircle className="h-3.5 w-3.5" />
                        {pending.length} pendência{pending.length > 1 ? "s" : ""}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" side="top" className="w-80">
                      <p className="text-sm font-semibold">Corrija para continuar</p>
                      <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                        {pending.map((e, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                            <span>{e}</span>
                          </li>
                        ))}
                      </ul>
                    </PopoverContent>
                  </Popover>
                ) : null}
              </div>
            </div>
          </div>

          {/* Navegação + ações */}
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {onBack || onNext ? (
              <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
                {onBack ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onBack}
                    disabled={backDisabled}
                    className="h-8 gap-1 px-2.5"
                    aria-label="Etapa anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Voltar</span>
                  </Button>
                ) : null}
                {onNext ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onNext}
                    disabled={nextDisabled}
                    className="h-8 gap-1 px-2.5"
                    aria-label="Próxima etapa"
                  >
                    <span className="hidden sm:inline">Próximo</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            ) : null}

            {actions.length > 0 ? (
              <div className="hidden lg:block h-6 w-px bg-border" aria-hidden />
            ) : null}

            <div className="flex flex-1 flex-wrap items-center gap-2 lg:flex-none">
              {actions.map((a) => (
                <Button
                  key={a.label}
                  variant="outline"
                  onClick={a.onClick}
                  disabled={a.disabled || a.loading}
                  className="h-9 flex-1 gap-2 lg:flex-none"
                >
                  {a.loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    a.icon
                  )}
                  <span className={cn(a.hideLabelOnMobile && "hidden sm:inline")}>
                    {a.label}
                  </span>
                </Button>
              ))}
            </div>

            {primary ? (
              <Button
                onClick={primary.onClick}
                disabled={primary.disabled || primary.loading}
                className="h-9 w-full gap-2 sm:w-auto"
              >
                {primary.loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  primary.icon
                )}
                {primary.label}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
