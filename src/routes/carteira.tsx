import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { portfolio, monthSeries } from "@/lib/mock-data";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Info, Target, DollarSign, ArrowDownRight, Sparkles } from "lucide-react";

export const Route = createFileRoute("/carteira")({
  head: () => ({
    meta: [
      { title: "Carteira — Portal 2P" },
      { name: "description", content: "Visão geral da carteira: projeção, vendas, conversão e fechamentos da semana." },
    ],
  }),
  component: CarteiraPage,
});

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function CarteiraPage() {
  const goalPct = (portfolio.achieved / portfolio.goal) * 100;
  const todayPct = (portfolio.sold / portfolio.projected) * 100;

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Carteira</div>
            <h1 className="text-3xl font-bold mt-1">Visão Geral</h1>
          </div>
          <select className="bg-surface border border-border rounded-lg px-3 py-2 text-sm">
            <option>Todos consultores</option>
            <option>Bruno Amaral</option>
          </select>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Kpi label="Projeção × Vendido" value={fmt(portfolio.sold)} sub={`Projetado/Hoje ${fmt(portfolio.projected)}`} alert />
          <Kpi label="Ticket Médio" value="R$ 18,27 mil" sub="Média 3M: R$ 20,68 mil" alert />
          <Kpi label="Conversão R$" value="25,63%" sub="Média 3M: 31,44%" alert />
          <Kpi label="Conversão Qtd" value="21,21%" sub="Média 3M: 33,52%" alert />
          <Kpi label="Sem Cotar +30d" value="1.628" sub="clientes" />
          <Kpi label="Sem Pedido +30d" value="1.778" sub="clientes" />
        </div>

        {/* Goal bar */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div className="font-display font-semibold">Meta do mês</div>
                <div className="text-sm">
                  <span className="text-primary font-bold">{fmt(portfolio.achieved)}</span>
                  <span className="text-muted-foreground"> / {fmt(portfolio.goal)}</span>
                </div>
              </div>
              <div className="h-2 mt-2 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-[oklch(0.82_0.17_60)]" style={{ width: `${goalPct}%` }} />
              </div>
              <div className="text-xs text-muted-foreground mt-1.5">{goalPct.toFixed(2)}% alcançado · {todayPct.toFixed(0)}% do dia</div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-4">
          <ChartCard title="Geração" subtitle="Projetado vs Gerado" amount={fmt(portfolio.generationMonth)} amountLabel="Valor Gerado (Mês)" stroke="oklch(0.72 0.17 155)" data={monthSeries} keyName="generated" />
          <ChartCard title="Vendas" subtitle="Projetado · Vendido · Faturado" amount={fmt(portfolio.sold)} amountLabel="Valor Vendido (Mês)" stroke="oklch(0.72 0.19 47)" data={monthSeries} keyName="sold" />
        </div>

        {/* Forecast tables */}
        <div className="grid md:grid-cols-3 gap-4">
          <ForecastCard title="Projeto Fechado" value={fmt(100744)} qty={28} tone="success" />
          <ForecastCard title="Projeto Não Fechado" value={fmt(14717)} qty={8} tone="warning" />
          <ForecastCard title="Estoque" value={fmt(89361)} qty={3} tone="muted" />
        </div>

        {/* Atlas note */}
        <div className="glass rounded-2xl p-5 border-primary/30">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-[oklch(0.7_0.18_280)] flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <div className="font-display font-semibold text-sm">Atlas — análise da carteira</div>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Você está <span className="text-destructive font-medium">9,3% abaixo</span> do projetado para hoje. O gap está concentrado em 3 clientes A (ALC Solar, Economy Solar, Enertrend).
                Acelerando os pedidos em separação, você fecha mais R$ 35,4k até sexta — isso te coloca em <span className="text-success font-medium">98% da meta semanal</span>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Kpi({ label, value, sub, alert }: { label: string; value: string; sub: string; alert?: boolean }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="text-[11px] text-muted-foreground flex items-center gap-1">{label} <Info className="h-3 w-3 opacity-50" /></div>
      <div className={`font-display font-bold text-xl mt-1 ${alert ? "text-destructive" : ""}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</div>
    </div>
  );
}

function ChartCard({ title, subtitle, amount, amountLabel, stroke, data, keyName }: any) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-display font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-muted-foreground">{amountLabel}</div>
          <div className="font-display font-bold">{amount}</div>
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id={`cg-${keyName}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={stroke} stopOpacity={0.4} />
                <stop offset="95%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" stroke="oklch(0.55 0.015 250)" fontSize={11} tickLine={false} axisLine={false} interval={4} />
            <YAxis hide />
            <Tooltip contentStyle={{ background: "oklch(0.22 0.013 250)", border: "1px solid oklch(0.3 0.012 250)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => fmt(v)} />
            <Area type="monotone" dataKey="projected" stroke="oklch(0.55 0.015 250)" strokeDasharray="3 3" fill="none" />
            <Area type="monotone" dataKey={keyName} stroke={stroke} fill={`url(#cg-${keyName})`} strokeWidth={2.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ForecastCard({ title, value, qty, tone }: { title: string; value: string; qty: number; tone: "success" | "warning" | "muted" }) {
  const dot = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-muted-foreground";
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <div className="font-display font-semibold text-sm">{title}</div>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] text-muted-foreground">Fechamento previsto | Semana</div>
          <div className="font-display font-bold text-2xl mt-1">{value}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-muted-foreground">Qtd.</div>
          <div className="font-display font-bold text-2xl">{qty}</div>
        </div>
      </div>
    </div>
  );
}
