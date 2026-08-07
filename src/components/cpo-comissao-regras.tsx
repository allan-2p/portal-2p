import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  REGRAS_PADRAO,
  calcularComissao,
  calcularRegra,
  type Regime,
  type RegraComissao,
} from "@/lib/cpo-comissao";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export function CpoComissaoRegras() {
  const [venda, setVenda] = useState(72000);
  const [custo, setCusto] = useState(34500);
  const [icms, setIcms] = useState(4);
  const [ipi, setIpi] = useState(5);
  const [pisCofins, setPisCofins] = useState(9.25);
  const [regras, setRegras] = useState<RegraComissao[]>(REGRAS_PADRAO);

  const r = useMemo(
    () => calcularComissao({ venda, custo, icms: icms / 100, ipi: ipi / 100, pisCofins: pisCofins / 100 }),
    [venda, custo, icms, ipi, pisCofins],
  );

  const linhas = useMemo(() => regras.map((g) => calcularRegra(g, venda)), [regras, venda]);

  const setPctRegra = (key: string, v: string) =>
    setRegras((prev) =>
      prev.map((g) => (g.key === key ? { ...g, pctRemuneracao: (Number(v) || 0) / 100 } : g)),
    );

  return (
    <div className="space-y-4">
      {/* Simulador */}
      <div className="glass rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold">Política comercial — cálculo da comissão</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              O vendedor altera apenas o valor da venda. O ICMS muda conforme o Estado e o custo vem da lista de
              produtos.
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-[11px]">
            comissão % = (2361·CMV² − 2896,4·CMV + 892,41) / 100
          </Badge>
        </div>

        <div className="grid sm:grid-cols-5 gap-3">
          <Campo label="Venda (R$)" value={venda} onChange={setVenda} step={100} />
          <Campo label="Custo / CMV (R$)" value={custo} onChange={setCusto} step={100} />
          <Campo label="ICMS (%)" value={icms} onChange={setIcms} step={0.01} />
          <Campo label="IPI (%)" value={ipi} onChange={setIpi} step={0.01} />
          <Campo label="PIS/COFINS (%)" value={pisCofins} onChange={setPisCofins} step={0.01} />
        </div>

        <div className="rounded-xl border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              <Linha label="Venda" valor={brl(r.venda)} />
              <Linha label="ICMS" valor={brl(r.vIcms)} extra={pct(icms / 100)} />
              <Linha label="IPI" valor={brl(r.vIpi)} extra={pct(ipi / 100)} />
              <Linha label="PIS/COFINS" valor={brl(r.vPisCofins)} extra={pct(pisCofins / 100)} />
              <Linha label="Custo" valor={brl(custo)} extra={`CMV ${pct(r.cmv)}`} />
              <Linha label="Margem bruta (MB)" valor={brl(r.mb)} extra={pct(r.mbPct)} destaque />
              <Linha
                label="Comissão total (sobre MB)"
                valor={brl(r.comissaoTotal)}
                extra={pct(r.pctComissao)}
                destaque
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* Regras CLT x PJ */}
      <Tabs defaultValue="CLT">
        <TabsList>
          <TabsTrigger value="CLT">CLT</TabsTrigger>
          <TabsTrigger value="PJ">PJ</TabsTrigger>
        </TabsList>
        {(["CLT", "PJ"] as Regime[]).map((regime) => {
          const itens = linhas.filter((l) => l.regime === regime);
          const totalCusto = itens.reduce((s, i) => s + i.custo, 0);
          const totalRem = itens.reduce((s, i) => s + i.remuneracao, 0);
          return (
            <TabsContent key={regime} value={regime} className="mt-3">
              <div className="glass rounded-2xl p-5 space-y-3">
                <p className="text-xs text-muted-foreground">
                  {regime === "CLT"
                    ? "No CLT o custo da empresa é a remuneração acrescida dos encargos (fator 1,66)."
                    : "No PJ o custo da empresa é igual à remuneração paga (sem encargos)."}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border/60">
                        <th className="text-left py-2">Papel</th>
                        <th className="text-right py-2">% remuneração</th>
                        <th className="text-right py-2">Remuneração</th>
                        <th className="text-right py-2">% custo</th>
                        <th className="text-right py-2">Custo empresa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((i) => (
                        <tr key={i.key} className="border-b border-border/40 last:border-0">
                          <td className="py-2 font-medium">{i.papel}</td>
                          <td className="py-2 text-right">
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 w-24 ml-auto text-right"
                              value={(i.pctRemuneracao * 100).toFixed(2)}
                              onChange={(e) => setPctRegra(i.key, e.target.value)}
                            />
                          </td>
                          <td className="py-2 text-right tabular-nums">{brl(i.remuneracao)}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">{pct(i.pctCusto)}</td>
                          <td className="py-2 text-right tabular-nums font-semibold">{brl(i.custo)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-border/60">
                        <td className="py-2 font-semibold">Total</td>
                        <td />
                        <td className="py-2 text-right tabular-nums font-semibold">{brl(totalRem)}</td>
                        <td />
                        <td className="py-2 text-right tabular-nums font-semibold">{brl(totalCusto)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-muted-foreground">
                  Comissão total permitida pela fórmula: <strong>{brl(r.comissaoTotal)}</strong> ({pct(r.pctComissao)}{" "}
                  da MB) — custo do time {regime}: <strong>{brl(totalCusto)}</strong>
                  {totalCusto > r.comissaoTotal ? (
                    <span className="text-destructive"> · acima do limite</span>
                  ) : (
                    <span className="text-emerald-500"> · dentro do limite</span>
                  )}
                </div>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  );
}

function Linha({
  label,
  valor,
  extra,
  destaque,
}: {
  label: string;
  valor: string;
  extra?: string;
  destaque?: boolean;
}) {
  return (
    <tr className={destaque ? "bg-primary/5 font-semibold" : ""}>
      <td className="py-2 px-3 border-b border-border/40">{label}</td>
      <td className="py-2 px-3 border-b border-border/40 text-right tabular-nums">{valor}</td>
      <td className="py-2 px-3 border-b border-border/40 text-right text-xs text-muted-foreground w-28">
        {extra ?? ""}
      </td>
    </tr>
  );
}
