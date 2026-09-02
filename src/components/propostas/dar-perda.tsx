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
import { faseDaProposta, propostaPerdida, siglaDaFase } from "@/lib/salesforce-stage";

/** Fase (StageName) da proposta, sem sigla. */
export function FaseTexto({ row, className }: { row: Record<string, any>; className?: string }) {
  return <span className={className}>{faseDaProposta(row)}</span>;
}

const FASE_BADGE_STYLE: Record<string, string> = {
  FIN: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  NÃO: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  SIM: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  EST: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  NEG: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  CAN: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  PER: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
};

/** Badge compacto com a sigla da fase (usado nas listagens). */
export function FaseBadge({
  row,
  className,
}: {
  row: Record<string, any>;
  className?: string;
}) {
  const sigla = siglaDaFase(row);
  const perdida = propostaPerdida(row);
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide tabular-nums",
        FASE_BADGE_STYLE[sigla] ?? "bg-muted text-muted-foreground",
        perdida && "opacity-90",
        className,
      )}
      title={faseDaProposta(row)}
    >
      {sigla}
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
