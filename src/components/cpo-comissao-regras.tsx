import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCpoConfig } from "@/hooks/use-cpo";
import { CPO_CONFIG_FALLBACK } from "@/lib/cpo";
import { VALOR_INDICACAO, calcularComissao, ratearComissao, type Regime } from "@/lib/cpo-comissao";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export function CpoComissaoRegras() {
  const { data: cfgData } = useCpoConfig();
  const cfg = cfgData ?? CPO_CONFIG_FALLBACK;

  const [venda, setVenda] = useState(68750);
  const [custo, setCusto] = useState(34500);
  const [icms, setIcms] = useState(4);
  const [ipi, setIpi] = useState(5);
  const [pisCofins, setPisCofins] = useState(9.25);
  const [difal, setDifal] = useState(0);

  const r = useMemo(
    () =>
      calcularComissao({
        venda,
        custo,
        icms: icms / 100,
        ipi: ipi / 100,
        pisCofins: pisCofins / 100,
        difal,
      }),
    [venda, custo, icms, ipi, pisCofins, difal],
  );

  const params = {
    cmvMax: cfg.cmv_max,
    pctGerente: cfg.pct_gerente,
    pctRepresentante: cfg.pct_representante,
    valorIndicacao: VALOR_INDICACAO,
    fatorClt: cfg.fator_clt,
  };


  return (
    <div className="space-y-4">
      {/* Simulador */}
      <div className="glass rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold">Política comercial — cálculo da comissão</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              O vendedor altera apenas o valor da venda. O ICMS da NF é sempre {pct(icms / 100)}, o DIFAL entra como
              custo adicional no cabeçalho e o custo vem da lista de produtos.
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-[11px]">
            comissão % = (4 + 7,4 / (1 + e^(2,05·(CMV%−57,8)))) / 100
          </Badge>
        </div>

        <div className="grid sm:grid-cols-6 gap-3">
          <Campo label="Venda (R$)" value={venda} onChange={setVenda} step={100} />
          <Campo label="Custo (R$)" value={custo} onChange={setCusto} step={100} />
          <Campo label="DIFAL (R$)" value={difal} onChange={setDifal} step={100} />
          <Campo label="ICMS (%)" value={icms} onChange={setIcms} step={0.01} />
          <Campo label="IPI (%)" value={ipi} onChange={setIpi} step={0.01} />
          <Campo label="PIS/COFINS (%)" value={pisCofins} onChange={setPisCofins} step={0.01} />
        </div>

        <div className="rounded-xl border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              <Linha label="Venda (com IPI)" valor={brl(r.venda)} />
              <Linha label="Valor NF (sem IPI)" valor={brl(r.valorSemIpi)} />
              <Linha label="IPI" valor={brl(r.vIpi)} extra={pct(ipi / 100)} />
              <Linha label="ICMS na NF" valor={brl(r.vIcms)} extra={pct(icms / 100)} />
              <Linha label="PIS/COFINS" valor={brl(r.vPisCofins)} extra={pct(pisCofins / 100)} />
              {difal > 0 && <Linha label="DIFAL (custo no cabeçalho)" valor={brl(r.difal)} />}
              <Linha label="Receita líquida" valor={brl(r.rl)} destaque />
              <Linha label="Custo" valor={brl(custo)} extra={`CMV ${pct(r.cmv)} (custo ÷ receita líquida)`} />
              <Linha label="Margem bruta (MB)" valor={brl(r.mb)} extra={pct(r.mbPct)} destaque />
              <Linha
                label="Comissão total — custo da empresa"
                valor={brl(r.cmv > params.cmvMax ? 0 : r.comissaoTotal)}
                extra={pct(r.pctComissao)}
                destaque
              />
            </tbody>
          </table>
        </div>

        {r.cmv > params.cmvMax ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive">
            CMV de {pct(r.cmv)} acima do limite de {pct(params.cmvMax)}. O vendedor não consegue orçar nessa
            condição — é necessária aprovação especial da diretoria.
          </div>
        ) : null}
      </div>

      {/* Rateio CLT x PJ */}
      <Tabs defaultValue="CLT">
        <TabsList>
          <TabsTrigger value="CLT">CLT</TabsTrigger>
          <TabsTrigger value="PJ">PJ</TabsTrigger>
        </TabsList>
        {(["CLT", "PJ"] as Regime[]).map((regime) => {
          const rateio = ratearComissao({
            venda,
            comissaoTotal: r.comissaoTotal,
            cmv: r.cmv,
            regimeVendedor: regime,
            params,
          });
          const totalCusto = rateio.linhas.reduce((s, i) => s + i.custo, 0);
          const totalRem = rateio.linhas.reduce((s, i) => s + i.remuneracao, 0);
          return (
            <TabsContent key={regime} value={regime} className="mt-3">
              <div className="glass rounded-2xl p-5 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Os papéis seguem o <strong>Perfil de permissão do consultor dono do cliente</strong>. Gerente
                  ({pct(params.pctGerente)}) e Representante ({pct(params.pctRepresentante)}) são fixos sobre a
                  venda; o consultor recebe o saldo do custo total da comissão.
                  {regime === "CLT"
                    ? ` No CLT a remuneração é o custo dividido pelo fator de encargos ${params.fatorClt}.`
                    : " No PJ o custo da empresa é igual à remuneração paga."}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border/60">
                        <th className="text-left py-2">Perfil</th>
                        <th className="text-left py-2">Regime</th>
                        <th className="text-right py-2">% custo s/ venda</th>
                        <th className="text-right py-2">Custo empresa</th>
                        <th className="text-right py-2">Remuneração</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rateio.linhas.map((i) => (
                        <tr key={i.key} className="border-b border-border/40 last:border-0">
                          <td className="py-2 font-medium">
                            {i.papel}
                            {i.fixo ? (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                                fixo
                              </span>
                            ) : (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-primary">saldo</span>
                            )}
                          </td>
                          <td className="py-2 text-muted-foreground">{i.regime}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">{pct(i.pctCusto)}</td>
                          <td className="py-2 text-right tabular-nums">{brl(i.custo)}</td>
                          <td className="py-2 text-right tabular-nums font-semibold">{brl(i.remuneracao)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-border/60">
                        <td className="py-2 font-semibold">Total</td>
                        <td />
                        <td />
                        <td className="py-2 text-right tabular-nums font-semibold">{brl(totalCusto)}</td>
                        <td className="py-2 text-right tabular-nums font-semibold">{brl(totalRem)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-muted-foreground">
                  Comissão total permitida pela fórmula: <strong>{brl(rateio.comissaoTotal)}</strong> (
                  {pct(r.pctComissao)} da MB). Saldo do consultor:{" "}
                  <strong>{brl(rateio.custoVendedor)}</strong>
                  {rateio.bloqueado ? (
                    <span className="text-destructive"> · bloqueado por CMV acima de {pct(params.cmvMax)}</span>
                  ) : rateio.custoVendedor <= 0 ? (
                    <span className="text-destructive"> · sem saldo após os fixos e a indicação</span>
                  ) : (
                    <span className="text-emerald-500"> · dentro do limite</span>
                  )}
                </div>
              </div>

              {/* Indicação — tabela separada */}
              <div className="glass rounded-2xl p-5 space-y-3 mt-4">
                <div>
                  <h3 className="font-semibold text-sm">Indicação (padrinho)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    A indicação não é um perfil do time: é marcada na proposta e paga a um padrinho cadastrado.
                    Valor fixo em qualquer regime, deduzido do custo total da comissão.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border/60">
                        <th className="text-left py-2">Origem</th>
                        <th className="text-left py-2">Regime</th>
                        <th className="text-right py-2">% custo s/ venda</th>
                        <th className="text-right py-2">Custo empresa</th>
                        <th className="text-right py-2">Remuneração</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-2 font-medium">Padrinho da proposta</td>
                        <td className="py-2 text-muted-foreground">PJ / PF</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {pct(venda > 0 ? rateio.indicacao.valor / venda : 0)}
                        </td>
                        <td className="py-2 text-right tabular-nums">{brl(rateio.indicacao.valor)}</td>
                        <td className="py-2 text-right tabular-nums font-semibold">
                          {brl(rateio.indicacao.valor)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
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
    <label className="space-y-1 block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-9"
      />
    </label>
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
    <tr className="border-b border-border/40 last:border-0">
      <td className={`py-2 px-3 ${destaque ? "font-semibold" : "text-muted-foreground"}`}>{label}</td>
      <td className="py-2 px-3 text-right text-xs text-muted-foreground">{extra ?? ""}</td>
      <td className={`py-2 px-3 text-right tabular-nums ${destaque ? "font-semibold" : ""}`}>{valor}</td>
    </tr>
  );
}
