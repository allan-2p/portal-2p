import { Gift } from "lucide-react";
import { cn } from "@/lib/utils";

/** Detecta bonificação a partir do valor de tipo de NF (aceita "bonificacao" / "Bonificação"). */
export function ehTipoNfBonificacao(v: unknown): boolean {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .startsWith("bonifica");
}

export function BonificacaoBadge({
  className,
  detalhe = true,
}: {
  className?: string;
  detalhe?: boolean;
}) {
  return (
    <span
      title="Pedido bonificado — nenhuma cobrança será emitida"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400",
        className,
      )}
    >
      <Gift className="h-3 w-3" aria-hidden />
      Bonificação
      {detalhe ? <span className="font-semibold normal-case tracking-normal">· sem cobrança</span> : null}
    </span>
  );
}
