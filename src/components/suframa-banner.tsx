import { AlertTriangle, BadgeCheck, Info } from "lucide-react";
import { SUFRAMA_BENEFICIOS, SUFRAMA_LABEL, type StatusSuframa } from "@/lib/suframa";

/**
 * Destaque de venda para a Zona Franca de Manaus na primeira tela da proposta.
 *
 * - SUFRAMA aprovado → venda com benefício fiscal;
 * - inscrição com impedimento → proposta normal, com todos os impostos;
 * - faturando o cliente final → o benefício se perde (a nota sai contra outro
 *   destinatário) e o vendedor precisa ser avisado.
 */
export function SuframaBanner({
  status,
  inscricao,
  situacao,
  clienteFinal,
  className,
}: {
  status: StatusSuframa;
  inscricao?: string | null;
  situacao?: string | null;
  /** A nota sai contra o cliente final: o SUFRAMA avaliado é o dele. */
  clienteFinal?: boolean;
  className?: string;
}) {
  if (status === "sem") return null;

  const base = `rounded-lg border p-3 sm:p-4 ${className ?? ""}`;

  if (status === "bloqueado") {
    return (
      <div className={`${base} border-destructive/40 bg-destructive/10 text-destructive`}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">
              Inscrição SUFRAMA {clienteFinal ? "do cliente final " : ""}com impedimento
            </p>
            <p className="text-sm">
              {inscricao ? `Inscrição ${inscricao} — ` : ""}
              {situacao || "situação não aprovada"}. A proposta segue como venda normal, com todos
              os impostos.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${base} border-emerald-500/40 bg-emerald-500/10`}>
      <div className="flex items-start gap-3">
        <BadgeCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <div className="space-y-1">
          <p className="font-semibold text-emerald-700 dark:text-emerald-400">{SUFRAMA_LABEL}</p>
          <p className="text-sm text-muted-foreground">
            {inscricao ? `Inscrição ${inscricao}` : "Inscrição aprovada"}
            {situacao ? ` · ${situacao}` : ""}. {SUFRAMA_BENEFICIOS}
          </p>
          {clienteFinal ? (
            <p className="flex items-start gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
              <Info className="mt-0.5 size-4 shrink-0" />
              A nota sai direto para o cliente final: o benefício segue valendo porque a inscrição
              SUFRAMA avaliada é a dele. Trocar o destinatário refaz essa verificação.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
