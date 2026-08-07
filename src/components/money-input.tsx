import * as React from "react";
import { Input } from "@/components/ui/input";
import { fmtBRL, parseMoeda } from "@/lib/cpo";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: number;
  onValueChange: (n: number) => void;
};

/**
 * Campo monetário que deixa digitar livremente (inclusive centavos).
 * Enquanto está em foco mostra o texto cru; ao sair formata em BRL.
 */
export function MoneyInput({ value, onValueChange, onFocus, onBlur, ...rest }: Props) {
  const [raw, setRaw] = React.useState<string | null>(null);

  return (
    <Input
      inputMode="decimal"
      {...rest}
      value={raw !== null ? raw : value ? fmtBRL(value) : ""}
      onFocus={(e) => {
        setRaw(value ? String(value).replace(".", ",") : "");
        onFocus?.(e);
        requestAnimationFrame(() => e.target.select?.());
      }}
      onChange={(e) => {
        const next = e.target.value.replace(/[^\d.,]/g, "");
        setRaw(next);
        onValueChange(parseMoeda(next));
      }}
      onBlur={(e) => {
        setRaw(null);
        onValueChange(parseMoeda(e.target.value));
        onBlur?.(e);
      }}
    />
  );
}
