import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Truck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/money-input";

import { listarTransportadorasDedicadas } from "@/lib/frete.functions";
import { fmtBRL, type CarregadoresTransportadora } from "@/lib/carregadores";

type Dedicada = { id: string; nome: string; documento: string };

type Props = {
  /** Transportadora escolhida (com o valor manual já aplicado). */
  selecionada: CarregadoresTransportadora | null;
  onSelect: (t: CarregadoresTransportadora | null) => void;
  /**
   * Valor do frete controlado por fora (quando o formulário já tem o campo
   * "Valor do frete (manual)"). Nesse caso o campo interno não é exibido.
   */
  valor?: number;
  /**
   * Prazo de entrega em dias úteis, informado manualmente (não há cotação no
   * frete dedicado). Quando `onPrazoChange` é passado, o campo é exibido.
   */
  prazo?: number | null;
  onPrazoChange?: (n: number | null) => void;
};

/**
 * Frete dedicado: o vendedor informa o valor manualmente e escolhe uma das
 * transportadoras dedicadas cadastradas. O prazo de entrega (dias úteis)
 * também é manual. O CNPJ segue para a ordem de venda (parceiro ZT) e para a
 * oferta de carga.
 */
export function FreteDedicado({
  selecionada,
  onSelect,
  valor: valorExterno,
  prazo,
  onPrazoChange,
}: Props) {
  const controlado = valorExterno !== undefined;
  const listar = useServerFn(listarTransportadorasDedicadas);
  const [lista, setLista] = useState<Dedicada[]>([]);
  const [valorInterno, setValorInterno] = useState<number>(selecionada?.total ?? 0);
  const valor = controlado ? (valorExterno ?? 0) : valorInterno;
  const prazoAtual = onPrazoChange ? (prazo ?? null) : (selecionada?.prazo ?? 2);



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

  // Ao reabrir a proposta, o valor salvo chega depois da montagem: sincroniza o
  // campo para não zerar o frete dedicado já persistido.
  useEffect(() => {
    if (controlado) return;
    const t = selecionada?.total ?? 0;
    if (t > 0) setValorInterno((v) => (v === t ? v : t));
  }, [selecionada?.total, controlado]);

  const aplicar = (id: string, total: number, prazoDias = prazoAtual) => {
    const t = lista.find((x) => x.id === id);
    if (!t) return onSelect(null);
    onSelect({ id: t.id, nome: t.nome, documento: t.documento, total, prazo: Number(prazoDias ?? 0) });
  };


  // Valor vindo do formulário: mantém o total da transportadora em sincronia.
  useEffect(() => {
    if (!controlado || !selecionada) return;
    if (selecionada.total === valor) return;
    onSelect({ ...selecionada, total: valor });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlado, valor, selecionada?.id, selecionada?.total]);


  return (
    <div className="glass rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Truck className="size-4" /> Frete dedicado
      </div>
      <div className={controlado && !onPrazoChange ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>
        {!controlado && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Valor do frete (manual) *</label>
            <MoneyInput
              value={valor}
              placeholder="R$ 0,00"
              maxValue={1000000}
              onValueChange={(n: number) => {
                setValorInterno(n);
                if (selecionada) aplicar(selecionada.id, n);
              }}
            />
          </div>
        )}
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
        {onPrazoChange && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Prazo de entrega (dias úteis)</label>
            <Input
              type="number"
              min={0}
              max={365}
              inputMode="numeric"
              placeholder="Ex.: 5"
              value={prazoAtual === null || prazoAtual === undefined ? "" : String(prazoAtual)}
              onChange={(e) => {
                const bruto = e.target.value.trim();
                const n = bruto === "" ? null : Math.max(0, Math.min(365, Math.round(Number(bruto) || 0)));
                onPrazoChange(n);
                if (selecionada) aplicar(selecionada.id, valor, n);
              }}
            />
          </div>
        )}
      </div>

      {selecionada && (
        <p className="text-xs text-muted-foreground">
          {selecionada.nome} · CNPJ {selecionada.documento}
          {Number(selecionada.prazo ?? 0) > 0 ? ` · prazo ${selecionada.prazo} dias úteis` : " · prazo a definir"}
          {" · "}
          {fmtBRL(selecionada.total)}
        </p>
      )}

      {!(valor > 0) && (
        <p className="text-xs text-amber-600">Informe o valor do frete dedicado.</p>
      )}
    </div>
  );
}
