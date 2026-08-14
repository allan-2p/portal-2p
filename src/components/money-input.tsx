import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { fmtBRL, parseMoeda } from "@/lib/cpo";

/* ---------- preferência global: digitação livre x máscara automática ---------- */

const STORAGE_KEY = "cpo:money-mask";
let maskOn = false;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  maskOn = window.localStorage.getItem(STORAGE_KEY) === "1";
}

function setMaskPref(on: boolean) {
  maskOn = on;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  }
  listeners.forEach((l) => l());
}

export function useMoneyMask() {
  const on = React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => maskOn,
    () => false,
  );
  return [on, setMaskPref] as const;
}

/** Alterna entre digitação livre e máscara automática em todos os campos de dinheiro. */
export function MoneyMaskToggle({ className }: { className?: string }) {
  const [on, setOn] = useMoneyMask();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Switch id="money-mask" checked={on} onCheckedChange={setOn} />
      <Label htmlFor="money-mask" className="text-xs text-muted-foreground cursor-pointer">
        {on ? "Máscara automática (R$)" : "Digitação livre"}
      </Label>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: number;
  onValueChange: (n: number) => void;
  /** Casas decimais permitidas ao digitar (padrão 2). */
  decimals?: number;
  /** Valor máximo aceito (opcional). */
  maxValue?: number;
  /** Notifica o pai quando o campo fica inválido/volta a ficar válido. */
  onValidityChange?: (erro: string | null) => void;
  /** Força o modo do campo, ignorando a preferência global. */
  mask?: boolean;
  /** Atraso (ms) para propagar o valor digitado ao pai. 0 desativa. */
  debounceMs?: number;
};

type Sane = { text: string; aviso: string | null };


/** Mantém a digitação do usuário, limitando as casas decimais, sem arredondar. */
function sanitize(input: string, decimals: number): Sane {
  let aviso: string | null = null;

  const semInvalidos = input.replace(/[^\d.,-]/g, "");
  if (semInvalidos !== input) aviso = "Use apenas números e vírgula (ex.: 1234,56).";

  const negativo = semInvalidos.trim().startsWith("-");
  if (negativo) aviso = "Valor não pode ser negativo.";

  // vírgula é o separador decimal; ponto é tratado como vírgula
  const s = semInvalidos.replace(/-/g, "").replace(/\./g, ",");
  const [intPart, ...rest] = s.split(",");
  if (rest.length === 0) return { text: intPart, aviso };

  if (rest.length > 1) aviso = "Use apenas um separador decimal.";
  const decRaw = rest.join("");
  if (decRaw.length > decimals) {
    aviso = `Máximo de ${decimals} casas decimais.`;
  }
  return { text: `${intPart},${decRaw.slice(0, decimals)}`, aviso };
}

/**
 * Campo monetário: mantém exatamente o texto digitado enquanto está em foco
 * (sem arredondar), valida a entrada e só formata em R$ ao sair do campo.
 */
export function MoneyInput({
  value,
  onValueChange,
  onFocus,
  onBlur,
  decimals = 2,
  maxValue,
  onValidityChange,
  mask,
  debounceMs = 200,
  className,
  ...rest
}: Props) {
  const [globalMask] = useMoneyMask();
  const masked = mask ?? globalMask;
  const [raw, setRaw] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  // Digitação não dispara recálculo a cada tecla: o pai só é notificado após
  // uma pausa (ou imediatamente ao sair do campo).
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeRef = React.useRef(onValueChange);
  changeRef.current = onValueChange;

  const cancelPending = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  React.useEffect(() => cancelPending, []);

  const emit = (n: number, immediate: boolean) => {
    cancelPending();
    if (immediate || debounceMs <= 0) {
      changeRef.current(n);
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      changeRef.current(n);
    }, debounceMs);
  };

  const report = (msg: string | null) => {
    setErro(msg);
    onValidityChange?.(msg);
  };

  const evaluate = (text: string) => {
    const { text: clean, aviso } = sanitize(text, decimals);
    const n = parseMoeda(clean);
    let msg = aviso;
    if (!msg && maxValue !== undefined && n > maxValue) {
      msg = `Valor acima do limite permitido (${fmtBRL(maxValue)}).`;
    }
    return { clean, n, msg };
  };

  /** Modo máscara: dígitos entram pelos centavos, formatando em R$ a cada tecla. */
  const evaluateMasked = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 15);
    const n = digits ? Number(digits) / Math.pow(10, decimals) : 0;
    let msg: string | null = null;
    if (maxValue !== undefined && n > maxValue) {
      msg = `Valor acima do limite permitido (${fmtBRL(maxValue)}).`;
    }
    return { clean: digits ? fmtBRL(n) : "", n, msg };
  };

  return (
    <>
      <Input
        inputMode="decimal"
        aria-invalid={erro ? true : undefined}
        {...rest}
        className={cn(erro && "border-destructive focus-visible:ring-destructive", className)}
        value={raw !== null ? raw : value ? fmtBRL(value) : ""}
        onFocus={(e) => {
          // mostra o número exato armazenado, sem arredondar
          setRaw(masked ? (value ? fmtBRL(value) : "") : value ? String(value).replace(".", ",") : "");
          onFocus?.(e);
          requestAnimationFrame(() => e.target.select?.());
        }}
        onChange={(e) => {
          const { clean, n, msg } = masked ? evaluateMasked(e.target.value) : evaluate(e.target.value);
          setRaw(clean);
          report(msg);
          emit(n, false);
        }}
        onBlur={(e) => {
          const { n, msg } = masked ? evaluateMasked(e.target.value) : evaluate(e.target.value);
          setRaw(null);
          report(msg);
          emit(n, true);
          onBlur?.(e);
        }}
      />

      {erro ? <p className="text-[11px] text-destructive mt-1">{erro}</p> : null}
    </>
  );
}
