import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useInstance } from "@/components/instance-provider";
import { invalidarCachePropostas } from "@/lib/propostas-cache";
import { marcarPerdaPropostaFn } from "@/lib/propostas.functions";
import {
  OBS_PERDA_MAX,
  OBS_PERDA_MIN,
  motivosPerdaPara,
  podeDarPerda,
} from "@/lib/perda-motivos";
import { cn } from "@/lib/utils";
import { faseDaProposta, linhasDaFase, propostaPerdida, siglaDaFase } from "@/lib/salesforce-stage";

/** Fase (StageName) da proposta, sem sigla. */
export function FaseTexto({ row, className }: { row: Record<string, any>; className?: string }) {
  return <span className={className}>{faseDaProposta(row)}</span>;
}

/**
 * Cor por significado da fase: pedido concluído = verde (receita realizada),
 * projeto fechado = azul (venda ganha, ainda em execução), estoque = violeta
 * (compra para giro), não fechado / negociação = âmbar (em aberto),
 * cancelado = vermelho, perdida = cinza (encerrada sem venda).
 */
const FASE_BADGE_STYLE: Record<string, string> = {
  FIN: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  SIM: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  EST: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  NÃO: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  NEG: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  CAN: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  PER: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

/** Badge compacto com o nome da fase em até duas linhas (usado nas listagens). */
export function FaseBadge({
  row,
  className,
}: {
  row: Record<string, any>;
  className?: string;
}) {
  const sigla = siglaDaFase(row);
  const linhas = linhasDaFase(row);
  const perdida = propostaPerdida(row);
  return (
    <span
      className={cn(
        "inline-flex w-full max-w-full flex-col items-center justify-center rounded px-1 py-0.5 text-[10px] font-semibold leading-[1.15] tracking-tight",
        FASE_BADGE_STYLE[sigla] ?? "bg-muted text-muted-foreground",
        perdida && "opacity-90",
        className,
      )}
      title={faseDaProposta(row)}
    >
      {linhas.map((l) => (
        <span key={l} className="block max-w-full truncate">{l}</span>
      ))}
    </span>
  );
}

/**
 * Botão "polegar para baixo" com o diálogo de perda. Só aparece enquanto a
 * proposta é rascunho ("Salvo") e ainda não foi perdida. A gravação é rápida:
 * o envio ao Salesforce acontece em segundo plano no servidor.
 */
export function BotaoDarPerda({
  proposta,
  onFeito,
  className,
}: {
  proposta: Record<string, any>;
  onFeito?: () => void;
  className?: string;
}) {
  const { isAdmin } = useInstance();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  const perdida = !!(proposta["motivo_perda"] || proposta["perdida_em"]);
  if (!podeDarPerda(proposta["status"], perdida)) return null;

  const invalido = !motivo || obs.trim().length < OBS_PERDA_MIN;

  async function confirmar() {
    if (invalido || salvando) return;
    setSalvando(true);
    try {
      await marcarPerdaPropostaFn({
        data: { id: String(proposta["id"]), motivo, observacao: obs },
      });
      setAberto(false);
      setMotivo("");
      setObs("");
      toast.success("Oportunidade marcada como perdida.");
      invalidarCachePropostas(qc);
      onFeito?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={className ?? "h-8 w-8 text-muted-foreground hover:text-destructive"}
              aria-label="Dar perda na oportunidade"
              onClick={(e) => {
                e.stopPropagation();
                setAberto(true);
              }}
            >
              <ThumbsDown className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Dar perda na oportunidade</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <AlertDialog
        open={aberto}
        onOpenChange={(o) => {
          setAberto(o);
          if (!o) {
            setMotivo("");
            setObs("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dar perda na oportunidade?</AlertDialogTitle>
            <AlertDialogDescription>
              A fase passa a ser “Oportunidade Perdida” e o motivo é enviado ao Salesforce.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Motivo da perda <span className="text-destructive">*</span>
              </label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger><SelectValue placeholder="Selecione o motivo…" /></SelectTrigger>
                <SelectContent>
                  {motivosPerdaPara(isAdmin).map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Descrição da perda <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={obs}
                onChange={(e) => setObs(e.target.value.slice(0, OBS_PERDA_MAX))}
                rows={3}
                placeholder="Explique o que aconteceu (o que o cliente decidiu, concorrente, preço…)"
              />
              <p className="text-xs text-muted-foreground">
                Mínimo de {OBS_PERDA_MIN} caracteres • {obs.trim().length}/{OBS_PERDA_MAX}
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Voltar</AlertDialogCancel>
            <Button
              onClick={confirmar}
              disabled={invalido || salvando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {salvando ? "Salvando…" : "Confirmar perda"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
