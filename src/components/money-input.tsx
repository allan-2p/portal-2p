import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fmtBRL, parseMoeda } from "@/lib/cpo";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: number;
  onValueChange: (n: number) => void;
  /** Casas decimais permitidas ao digitar (padrão 2). */
  decimals?: number;
  /** Valor máximo aceito (opcional). */
  maxValue?: number;
  /** Notifica o pai quando o campo fica inválido/volta a ficar válido. */
  onValidityChange?: (erro: string | null) => void;
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
  className,
  ...rest
}: Props) {
  const [raw, setRaw] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

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
          setRaw(value ? String(value).replace(".", ",") : "");
          onFocus?.(e);
          requestAnimationFrame(() => e.target.select?.());
        }}
        onChange={(e) => {
          const { clean, n, msg } = evaluate(e.target.value);
          setRaw(clean);
          report(msg);
          onValueChange(n);
        }}
        onBlur={(e) => {
          const { n, msg } = evaluate(e.target.value);
          setRaw(null);
          report(msg);
          onValueChange(n);
          onBlur?.(e);
        }}
      />
      {erro ? <p className="text-[11px] text-destructive mt-1">{erro}</p> : null}
    </>
  );
}
