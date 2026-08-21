import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Truck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/ui/money-input";
import { listarTransportadorasDedicadas } from "@/lib/frete.functions";
import { fmtBRL, type CarregadoresTransportadora } from "@/lib/carregadores";

type Dedicada = { id: string; nome: string; documento: string };

type Props = {
  /** Transportadora escolhida (com o valor manual já aplicado). */
  selecionada: CarregadoresTransportadora | null;
  onSelect: (t: CarregadoresTransportadora | null) => void;
};

/**
 * Frete dedicado: o vendedor informa o valor manualmente e escolhe uma das
 * transportadoras dedicadas cadastradas (prazo fixo de 2 dias). O CNPJ segue
 * para a ordem de venda (parceiro ZT) e para a oferta de carga.
 */
export function FreteDedicado({ selecionada, onSelect }: Props) {
  const listar = useServerFn(listarTransportadorasDedicadas);
  const [lista, setLista] = useState<Dedicada[]>([]);
  const [valor, setValor] = useState<number>(selecionada?.total ?? 0);

  useEffect(() => {
    let vivo = true;
    listar()
      .then((r) => vivo && setLista(r as Dedicada[]))
      .catch(() => vivo && setLista([]));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aplicar = (id: string, total: number) => {
    const t = lista.find((x) => x.id === id);
    if (!t) return onSelect(null);
    onSelect({ id: t.id, nome: t.nome, documento: t.documento, total, prazo: 2 });
  };

  return (
    <div className="glass rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Truck className="size-4" /> Frete dedicado
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Valor do frete (manual) *</label>
          <MoneyInput
            value={valor}
            placeholder="R$ 0,00"
            maxValue={1000000}
            onValueChange={(n: number) => {
              setValor(n);
              if (selecionada) aplicar(selecionada.id, n);
            }}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Transportadora dedicada *</label>
          <Select value={selecionada?.id ?? ""} onValueChange={(v) => aplicar(v, valor)}>
            <SelectTrigger><SelectValue placeholder="Selecione a transportadora" /></SelectTrigger>
            <SelectContent>
              {lista.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {selecionada && (
        <p className="text-xs text-muted-foreground">
          {selecionada.nome} · CNPJ {selecionada.documento} · prazo 2 dias · {fmtBRL(selecionada.total)}
        </p>
      )}
      {!(valor > 0) && (
        <p className="text-xs text-amber-600">Informe o valor do frete dedicado.</p>
      )}
    </div>
  );
}
