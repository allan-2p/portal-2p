import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarDays, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { adminListarLotes, adminSalvarLotes, type LoteRow } from "@/lib/carregadores-lotes.functions";

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Cadastro dos lotes de chegada de mercadoria. O consultor escolhe um deles ao
 * fechar o pedido; só lotes ativos aparecem para escolha.
 */
export function CarregadoresLotesEditor() {
  const listar = useServerFn(adminListarLotes);
  const salvarFn = useServerFn(adminSalvarLotes);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["carregadores-lotes-admin"],
    queryFn: () => listar(),
  });

  const [linhas, setLinhas] = useState<LoteRow[]>([]);
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (data) {
      setLinhas(data as LoteRow[]);
      setRemovidos([]);
    }
  }, [data]);

  const patch = (i: number, p: Partial<LoteRow>) =>
    setLinhas((l) => l.map((row, idx) => (idx === i ? { ...row, ...p } : row)));

  const remover = (i: number) =>
    setLinhas((l) => {
      const alvo = l[i];
      if (alvo?.id) setRemovidos((r) => [...r, alvo.id!]);
      return l.filter((_, idx) => idx !== i);
    });

  const adicionar = () =>
    setLinhas((l) => [
      ...l,
      {
        mes_referencia: l[l.length - 1]?.mes_referencia ?? mesAtual(),
        lote: "",
        previsao_chegada: null,
        ativo: true,
        ordem: l.length + 1,
        observacao: null,
      },
    ]);

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarFn({ data: { linhas: linhas.map((l, i) => ({ ...l, ordem: i + 1 })), removidos } });
      toast.success("Lotes salvos.");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar os lotes.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Lotes de chegada
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Mês de referência e lote em que a mercadoria chega. Ao fechar um pedido o consultor é obrigado a
            escolher um destes lotes; desative os que já não aceitam pedidos.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={adicionar} className="gap-1">
          <Plus className="h-4 w-4" /> Lote
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum lote cadastrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Mês ref.</th>
                <th className="py-2 pr-3">Lote</th>
                <th className="py-2 pr-3">Previsão de chegada</th>
                <th className="py-2 pr-3">Observação</th>
                <th className="py-2 pr-3">Ativo</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={l.id ?? `novo-${i}`} className="border-t border-border">
                  <td className="py-2 pr-3">
                    <Input
                      type="month"
                      value={l.mes_referencia}
                      onChange={(e) => patch(i, { mes_referencia: e.target.value })}
                      className="w-40"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      value={l.lote}
                      placeholder="Ex.: Lote 1"
                      onChange={(e) => patch(i, { lote: e.target.value })}
                      className="w-40"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      type="date"
                      value={l.previsao_chegada ?? ""}
                      onChange={(e) => patch(i, { previsao_chegada: e.target.value || null })}
                      className="w-40"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      value={l.observacao ?? ""}
                      placeholder="Opcional"
                      onChange={(e) => patch(i, { observacao: e.target.value || null })}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Switch checked={l.ativo} onCheckedChange={(v) => patch(i, { ativo: v })} />
                  </td>
                  <td className="py-2 text-right">
                    <Button size="icon" variant="ghost" onClick={() => remover(i)} aria-label="Remover lote">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={salvando} className="gap-2">
          <Save className="h-4 w-4" /> {salvando ? "Salvando..." : "Salvar lotes"}
        </Button>
      </div>
    </div>
  );
}
