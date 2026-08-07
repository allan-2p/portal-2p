import * as React from "react";
import { Input } from "@/components/ui/input";
import { fmtBRL, parseMoeda } from "@/lib/cpo";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: number;
  onValueChange: (n: number) => void;
  /** Casas decimais permitidas ao digitar (padrão 2). */
  decimals?: number;
};

/** Mantém a digitação do usuário, limitando as casas decimais. */
function sanitize(input: string, decimals: number) {
  // só dígitos e separadores; vírgula é o separador decimal
  let s = input.replace(/[^\d.,]/g, "").replace(/\./g, ",");
  const [intPart, ...rest] = s.split(",");
  if (rest.length === 0) return intPart;
  const dec = rest.join("").slice(0, decimals);
  return `${intPart},${dec}`;
}

/**
 * Campo monetário que deixa digitar livremente (com limite de casas decimais).
 * Enquanto está em foco mantém exatamente o texto digitado; ao sair formata em R$.
 */
export function MoneyInput({ value, onValueChange, onFocus, onBlur, decimals = 2, ...rest }: Props) {
  const [raw, setRaw] = React.useState<string | null>(null);

  return (
    <Input
      inputMode="decimal"
      {...rest}
      value={raw !== null ? raw : value ? fmtBRL(value) : ""}
      onFocus={(e) => {
        setRaw(value ? value.toFixed(decimals).replace(".", ",") : "");
        onFocus?.(e);
        requestAnimationFrame(() => e.target.select?.());
      }}
      onChange={(e) => {
        const next = sanitize(e.target.value, decimals);
        setRaw(next);
        onValueChange(Number(parseMoeda(next).toFixed(decimals)));
      }}
      onBlur={(e) => {
        const n = Number(parseMoeda(sanitize(e.target.value, decimals)).toFixed(decimals));
        setRaw(null);
        onValueChange(n);
        onBlur?.(e);
      }}
    />
  );
}

