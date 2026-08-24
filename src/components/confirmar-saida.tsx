import { useEffect, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { Loader2, Save, TriangleAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Confirmação universal de saída com alterações não salvas.
 *
 * Bloqueia a navegação interna (TanStack Router) e o fechamento da aba
 * enquanto houver alterações pendentes, oferecendo "Salvar e sair",
 * "Sair sem salvar" e "Continuar editando".
 */
export function useConfirmarSaida({
  sujo,
  salvar,
  podeSalvar = true,
  titulo = "Sair sem salvar?",
  descricao = "Existem alterações que ainda não foram salvas. O que você quer fazer?",
}: {
  /** Há alterações pendentes? */
  sujo: boolean;
  /** Salva e resolve quando a gravação terminou (lança em caso de erro). */
  salvar?: (() => Promise<unknown>) | undefined;
  /** Quando falso, apenas oferece sair sem salvar. */
  podeSalvar?: boolean;
  titulo?: string;
  descricao?: string;
}) {
  const [salvandoSaida, setSalvandoSaida] = useState(false);
  const { status, proceed, reset } = useBlocker({
    shouldBlockFn: () => sujo,
    withResolver: true,
    enableBeforeUnload: () => sujo,
  });

  const bloqueado = status === "blocked";

  // Não deixa o diálogo "preso" caso as alterações sejam salvas por outro caminho.
  useEffect(() => {
    if (bloqueado && !sujo) proceed();
  }, [bloqueado, sujo, proceed]);

  const dialog = (
    <AlertDialog open={bloqueado} onOpenChange={(o) => !o && !salvandoSaida && reset()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <TriangleAlert className="h-5 w-5 text-amber-500" />
            {titulo}
          </AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={salvandoSaida}>Continuar editando</AlertDialogCancel>
          <Button variant="outline" disabled={salvandoSaida} onClick={() => proceed()}>
            Sair sem salvar
          </Button>
          {salvar && podeSalvar ? (
            <AlertDialogAction
              disabled={salvandoSaida}
              onClick={async (e) => {
                e.preventDefault();
                setSalvandoSaida(true);
                try {
                  await salvar();
                  proceed();
                } catch {
                  reset();
                } finally {
                  setSalvandoSaida(false);
                }
              }}
              className="gap-2"
            >
              {salvandoSaida ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar e sair
            </AlertDialogAction>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { dialog };
}

/**
 * Confirmação de fechamento para modais (não envolve navegação de rota).
 * Use com `Dialog onOpenChange` para nunca perder o que foi digitado.
 */
export function ConfirmarFechamentoDialog({
  aberto,
  onCancelar,
  onDescartar,
  titulo = "Descartar alterações?",
  descricao = "Você preencheu informações que ainda não foram salvas. Se fechar agora, elas serão perdidas.",
}: {
  aberto: boolean;
  onCancelar: () => void;
  onDescartar: () => void;
  titulo?: string;
  descricao?: string;
}) {
  return (
    <AlertDialog open={aberto} onOpenChange={(o) => !o && onCancelar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <TriangleAlert className="h-5 w-5 text-amber-500" />
            {titulo}
          </AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel onClick={onCancelar}>Continuar editando</AlertDialogCancel>
          <AlertDialogAction onClick={onDescartar}>Descartar e fechar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
