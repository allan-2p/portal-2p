import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";

type Props = {
  unidade: string;
  titulo: string;
  descricao: string;
  children?: ReactNode;
};

/**
 * Página de moderação de uma unidade cuja configuração ainda não foi
 * modelada. Mantém a estrutura por instância (2P Solar / 2P Carregadores)
 * visível e explica onde a regra é definida hoje.
 */
export function ModeracaoPlaceholder({ unidade, titulo, descricao, children }: Props) {
  return (
    <div className="max-w-[1100px] mx-auto space-y-5">
      <div>
        <div className="text-xs uppercase tracking-wider text-primary font-semibold">
          Moderação • {unidade}
        </div>
        <h1 className="text-3xl font-bold mt-1">{titulo}</h1>
        <p className="text-sm text-muted-foreground mt-1">{descricao}</p>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-6 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          Ainda não há configurações específicas cadastradas para esta unidade.
        </div>
        {children}
      </div>
    </div>
  );
}

export function PlaceholderLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-primary underline underline-offset-4">
      {children}
    </Link>
  );
}
