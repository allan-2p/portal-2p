import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Save, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { adminListarDedicadas, adminSalvarDedicadas, type DedicadaRow } from "@/lib/frete.functions";

const mascaraCnpj = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};

/**
 * Cadastro das transportadoras usadas no frete dedicado: ordem de exibição,
 * ativo, CNPJ (vai para a OV como parceiro ZT) e o ID do Fretefy usado no
 * direcionamento da oferta de carga.
 */
export function FreteDedicadasEditor() {
  const listar = useServerFn(adminListarDedicadas);
  const salvarFn = useServerFn(adminSalvarDedicadas);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["frete-dedicadas-admin"],
    queryFn: () => listar(),
  });

  const [linhas, setLinhas] = useState<DedicadaRow[]>([]);
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (data) {
      setLinhas(data as DedicadaRow[]);
      setRemovidos([]);
    }
  }, [data]);

  const patch = (i: number, p: Partial<DedicadaRow>) =>
    setLinhas((l) => l.map((row, idx) => (idx === i ? { ...row, ...p } : row)));

  const mover = (i: number, dir: -1 | 1) =>
    setLinhas((l) => {
      const j = i + dir;
      if (j < 0 || j >= l.length) return l;
      const copia = [...l];
      const a = copia[i]!;
      const b = copia[j]!;
      copia[i] = b;
      copia[j] = a;
      return copia.map((row, idx) => ({ ...row, ordem: idx + 1 }));
    });

  const remover = (i: number) =>
    setLinhas((l) => {
      const alvo = l[i];
      if (alvo?.id) setRemovidos((r) => [...r, alvo.id!]);
      return l.filter((_, idx) => idx !== i).map((row, idx) => ({ ...row, ordem: idx + 1 }));
    });

  const adicionar = () =>
    setLinhas((l) => [
      ...l,
      { nome: "", fretefy_transportadora_id: "", cnpj: "", ativo: true, ordem: l.length + 1 },
    ]);

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarFn({
        data: { linhas: linhas.map((l, i) => ({ ...l, ordem: i + 1 })), removidos },
      });
      toast.success("Transportadoras dedicadas salvas.");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.", { duration: 12000 });
    } finally {
      setSalvando(false);
    }
  };

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" /> Transportadoras de frete dedicado
          </p>
          <p className="text-xs text-muted-foreground">
            Aparecem na proposta quando a modalidade é <b>Dedicado</b>. O CNPJ vai para a ordem de venda no SAP
            (parceiro ZT) e o ID Fretefy direciona a oferta de carga.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={adicionar} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </Button>
          <Button size="sm" onClick={() => void salvar()} disabled={salvando} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="text-xs text-muted-foreground text-left">
              <th className="py-2 w-16">Ordem</th>
              <th className="py-2">Nome</th>
              <th className="py-2 w-[190px]">CNPJ</th>
              <th className="py-2 w-[300px]">ID Fretefy</th>
              <th className="py-2 w-20">Ativo</th>
              <th className="py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={l.id ?? `novo-${i}`} className="border-t border-border/60">
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-1">
                    <span className="tabular-nums text-xs text-muted-foreground w-4">{i + 1}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => mover(i, -1)}>
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => mover(i, 1)}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
                <td className="py-2 pr-2">
                  <Input value={l.nome} onChange={(e) => patch(i, { nome: e.target.value })} placeholder="Nome da transportadora" />
                </td>
                <td className="py-2 pr-2">
                  <Input
                    value={mascaraCnpj(l.cnpj)}
                    onChange={(e) => patch(i, { cnpj: e.target.value.replace(/\D/g, "").slice(0, 14) })}
                    placeholder="00.000.000/0000-00"
                  />
                </td>
                <td className="py-2 pr-2">
                  <Input
                    value={l.fretefy_transportadora_id}
                    onChange={(e) => patch(i, { fretefy_transportadora_id: e.target.value.trim() })}
                    placeholder="ID no Fretefy"
                    className="font-mono text-xs"
                  />
                </td>
                <td className="py-2 pr-2">
                  <Switch checked={l.ativo} onCheckedChange={(v) => patch(i, { ativo: v })} />
                </td>
                <td className="py-2">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remover(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {!linhas.length ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                  Nenhuma transportadora dedicada cadastrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
