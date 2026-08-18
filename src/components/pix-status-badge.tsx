import { cn } from "@/lib/utils";
import { PAGAMENTO_STATUS_META, type PagamentoStatus } from "@/lib/pagamentos-ui";

/** Selo compacto com o status da cobrança Pix do pedido. */
export function PixStatusBadge({
  status,
  className,
}: {
  status: PagamentoStatus | null | undefined;
  className?: string;
}) {
  if (!status) return null;
  const meta = PAGAMENTO_STATUS_META[status];
  return (
    <span
      title={meta.descricao}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        meta.classe,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
