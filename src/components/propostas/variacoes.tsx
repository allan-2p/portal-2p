/**
 * Variações da mesma proposta na listagem: a favorita ocupa a linha principal
 * e as alternativas aparecem recolhidas embaixo dela.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, GitBranch, Loader2, Pencil, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtBRL } from "@/lib/carregadores";
import { StatusDot } from "@/components/proposta-status-ui";
import { podeEditarProposta } from "@/lib/proposta-status";
import { numeroExibicao, resumoItens } from "@/lib/proposta-variacoes";
import {
  criarVariacaoPropostaFn,
  listarVariacoesFn,
  marcarVariacaoFavoritaFn,
} from "@/lib/proposta-variacoes.functions";

export type LinhaComVariacao = {
  id: string;
  numero: string | null;
  status?: string | null;
  variacao_grupo?: string | null;
  variacao_sufixo?: string | null;
  variacao_favorita?: boolean | null;
  variacoes_total?: number | null;
};

/** Número exibido na listagem (com sufixo da variação). */
export function numeroDaLinha(r: LinhaComVariacao): string {
  return numeroExibicao(r as any) || "—";
}

export function ToggleVariacoes({
  total,
  aberto,
  onToggle,
}: {
  total: number;
  aberto: boolean;
  onToggle: () => void;
}) {
  if (total < 2) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-1 inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-surface-2"
      aria-label={aberto ? "Ocultar variações" : "Ver variações"}
    >
      {aberto ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      {total} variações
    </button>
  );
}

/** Botão de ação "Criar variação" (só faz sentido em proposta "Salvo"). */
export function BotaoCriarVariacao({
  propostaId,
  status,
  onCriada,
}: {
  propostaId: string;
  status?: string | null;
  onCriada?: () => void;
}) {
  const [criando, setCriando] = useState(false);
  const qc = useQueryClient();
  if (!podeEditarProposta(status ?? "")) return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      aria-label="Criar variação"
      title="Criar variação desta proposta"
      disabled={criando}
      onClick={async () => {
        setCriando(true);
        try {
          const r = await criarVariacaoPropostaFn({ data: { id: propostaId } });
          toast.success(`Variação ${numeroExibicao({ id: "", numero: r.numero, variacao_sufixo: r.sufixo })} criada.`);
          qc.invalidateQueries({ queryKey: ["variacoes"] });
          onCriada?.();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setCriando(false);
        }
      }}
    >
      {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitBranch className="h-4 w-4" />}
    </Button>
  );
}

/** Sub-linhas com as variações do grupo. */
export function LinhasVariacoes({
  propostaId,
  colSpan,
  rotaEdicao,
  onDetalhe,
  onAtualizar,
}: {
  propostaId: string;
  colSpan: number;
  rotaEdicao: "/solar/propostas/nova" | "/carregadores/propostas/nova";
  onDetalhe?: (id: string) => void;
  onAtualizar?: () => void;
}) {
  const qc = useQueryClient();
  const [trocando, setTrocando] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["variacoes", propostaId],
    queryFn: () => listarVariacoesFn({ data: { id: propostaId } }),
    staleTime: 15_000,
  });

  if (q.isLoading) {
    return (
      <tr className="border-b border-border/50 bg-surface-2/40">
        <td colSpan={colSpan} className="px-10 py-3 text-xs text-muted-foreground">
          Carregando variações…
        </td>
      </tr>
    );
  }

  const irmas = q.data ?? [];
  if (irmas.length < 2) return null;

  return (
    <>
      {irmas.map((v) => (
        <tr key={v.id} className="border-b border-border/40 bg-surface-2/40 text-[12px]">
          <td className="px-3 py-2 text-center">
            <StatusDot status={v.status} />
          </td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-1.5 pl-4">
              <span className="font-semibold tabular-nums">{numeroExibicao(v as any)}</span>
              {v.variacao_favorita && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  <Star className="h-3 w-3 fill-current" /> favorita
                </span>
              )}
            </div>
            <div className="truncate pl-4 text-[11px] text-muted-foreground">{v.nome || resumoItens(v as any)}</div>
          </td>
          <td className="px-3 py-2 text-muted-foreground" colSpan={Math.max(colSpan - 4, 1)}>
            <span className="truncate">{resumoItens(v as any)}</span>
          </td>
          <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
            {fmtBRL(Number((v.totais as any)?.["valorTotal"] ?? 0))}
          </td>
          <td className="px-3 py-2">
            <div className="flex items-center justify-end gap-0.5">
              {onDetalhe && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onDetalhe(v.id)}>
                  Ver
                </Button>
              )}
              {podeEditarProposta(v.status) && (
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Editar variação" asChild>
                  <Link to={rotaEdicao} search={{ id: v.id }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
              {!v.variacao_favorita && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Definir como favorita"
                  title="Definir como favorita (vai para o Salesforce)"
                  disabled={trocando === v.id}
                  onClick={async () => {
                    setTrocando(v.id);
                    try {
                      await marcarVariacaoFavoritaFn({ data: { id: v.id } });
                      toast.success(`${numeroExibicao(v as any)} agora é a variação favorita.`);
                      await qc.invalidateQueries({ queryKey: ["variacoes", propostaId] });
                      onAtualizar?.();
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setTrocando(null);
                    }
                  }}
                >
                  {trocando === v.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Star className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

/**
 * Painel da etapa de finalização: mostra as variações do projeto e deixa
 * escolher qual delas será concluída (a escolhida vira a favorita).
 */
export function PainelVariacoes({
  propostaId,
  rotaEdicao,
}: {
  propostaId: string;
  rotaEdicao: "/solar/propostas/nova" | "/carregadores/propostas/nova";
}) {
  const qc = useQueryClient();
  const [trocando, setTrocando] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["variacoes", propostaId],
    queryFn: () => listarVariacoesFn({ data: { id: propostaId } }),
    staleTime: 10_000,
  });
  const irmas = q.data ?? [];
  if (irmas.length < 2) return null;

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold">Variações deste projeto</div>
        <p className="text-xs text-muted-foreground">
          Todas compartilham o mesmo número. Só a variação escolhida vira pedido e vai para o Salesforce.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {irmas.map((v) => {
          const atual = v.id === propostaId;
          return (
            <div
              key={v.id}
              className={`rounded-xl border p-3 text-sm ${atual ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold tabular-nums">{numeroExibicao(v as any)}</span>
                {v.variacao_favorita && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-primary">
                    <Star className="h-3 w-3 fill-current" /> favorita
                  </span>
                )}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">{resumoItens(v as any)}</div>
              <div className="mt-1 font-semibold tabular-nums">
                {fmtBRL(Number((v.totais as any)?.["valorTotal"] ?? 0))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                {!atual && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                    <Link to={rotaEdicao} search={{ id: v.id }}>Abrir</Link>
                  </Button>
                )}
                {!v.variacao_favorita && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={trocando === v.id}
                    onClick={async () => {
                      setTrocando(v.id);
                      try {
                        await marcarVariacaoFavoritaFn({ data: { id: v.id } });
                        toast.success(`${numeroExibicao(v as any)} agora é a favorita.`);
                        await qc.invalidateQueries({ queryKey: ["variacoes", propostaId] });
                      } catch (e) {
                        toast.error((e as Error).message);
                      } finally {
                        setTrocando(null);
                      }
                    }}
                  >
                    {trocando === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Usar esta"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
