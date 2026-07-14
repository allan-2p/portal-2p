import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const fmtShort = (n: number) => `R$ ${(n / 1000).toFixed(0)}k`;

export type HomeAreaChartProps = {
  series: Array<Record<string, number | string | null>>;
  valueKey: string;
  valueColor: string;
  valueLabel: string;
  axisColor: string;
  gridColor: string;
  projectedColor: string;
};

// Isolated so the ~90KB recharts bundle can be lazy-loaded only on the home dashboard.
export default function HomeAreaChart({
  series,
  valueKey,
  valueColor,
  valueLabel,
  axisColor,
  gridColor,
  projectedColor,
}: HomeAreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={series} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
        <defs>
          <linearGradient id={`g-${valueKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={valueColor} stopOpacity={0.3} />
            <stop offset="95%" stopColor={valueColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" stroke={axisColor} fontSize={10} tickLine={false} axisLine={false} interval={4} />
        <YAxis stroke={axisColor} fontSize={10} tickLine={false} axisLine={false} width={50} tickFormatter={(v) => fmtShort(v as number)} />
        <Tooltip
          contentStyle={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--chart-tooltip-border)", borderRadius: 10, fontSize: 12, color: "var(--foreground)" }}
          formatter={(v: number) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }))}
        />
        <Area type="monotone" dataKey="projected" name="Projetado" stroke={projectedColor} strokeDasharray="4 4" fill="none" strokeWidth={1.5} />
        <Area type="monotone" dataKey={valueKey} name={valueLabel} stroke={valueColor} fill={`url(#g-${valueKey})`} strokeWidth={2.5} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
