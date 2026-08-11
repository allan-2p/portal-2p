import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminActivityDashboard } from "@/lib/activity.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, LogIn, Plug, ShieldAlert, Users } from "lucide-react";

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 200 80% 55%))",
  "hsl(var(--chart-3, 45 90% 55%))",
  "hsl(var(--chart-4, 280 60% 60%))",
  "hsl(var(--chart-5, 340 70% 60%))",
];

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof LogIn;
  label: string;
  value: number;
  tone?: "danger" | "warn";
}) {
  return (
    <div className="glass rounded-xl p-4 flex items-center gap-3">
      <div
        className={
          tone === "danger"
            ? "h-9 w-9 rounded-lg bg-destructive/15 text-destructive grid place-items-center"
            : tone === "warn"
              ? "h-9 w-9 rounded-lg bg-amber-500/15 text-amber-500 grid place-items-center"
              : "h-9 w-9 rounded-lg bg-primary/15 text-primary grid place-items-center"
        }
      >
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xl font-bold leading-none">{value.toLocaleString("pt-BR")}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60 font-semibold text-sm">{title}</div>
      <div className="p-3">{children}</div>
    </div>
  );
}

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
} as const;

export function ActivityDashboard({ days }: { days: number }) {
  const run = useServerFn(adminActivityDashboard);
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-activity-dashboard", days, granularity],
    queryFn: () => run({ data: { days, granularity } }),
    staleTime: 60_000,
  });

  const trend = useMemo(
    () =>
      (data?.trend ?? []).map((t) => ({
        ...t,
        label:
          granularity === "month"
            ? t.bucket
            : new Date(`${t.bucket}T12:00:00Z`).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              }),
      })),
    [data, granularity],
  );

  if (isLoading) {
    return (
      <div className="glass rounded-xl p-10 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
      </div>
    );
  }

  const t = data?.totals ?? { logins: 0, failures: 0, integrations: 0, activeUsers: 0 };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={LogIn} label="Logins no período" value={t.logins} />
        <Kpi icon={Users} label="Usuários ativos" value={t.activeUsers} />
        <Kpi icon={ShieldAlert} label="Falhas de login" value={t.failures} tone="danger" />
        <Kpi icon={Plug} label="Chamadas de integração" value={t.integrations} tone="warn" />
      </div>

      <Panel title="Tendência por período">
        <div className="flex justify-end mb-2">
          <Select value={granularity} onValueChange={(v) => setGranularity(v as typeof granularity)}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Por dia</SelectItem>
              <SelectItem value="week">Por semana</SelectItem>
              <SelectItem value="month">Por mês</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={trend} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="gLogins" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area
              type="monotone"
              dataKey="logins"
              name="Logins"
              stroke="hsl(var(--primary))"
              fill="url(#gLogins)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="failures"
              name="Falhas"
              stroke="hsl(var(--destructive))"
              fill="transparent"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="integrations"
              name="Integrações"
              stroke="hsl(45 90% 55%)"
              fill="transparent"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Falhas de login por motivo">
          {(data?.failures ?? []).length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center">
              Nenhuma falha no período.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={data?.failures ?? []}
                layout="vertical"
                margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  type="category"
                  dataKey="reason"
                  width={150}
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" name="Falhas" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Uso por integração do Atlas">
          {(data?.integrations ?? []).length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center">
              Nenhuma chamada registrada no período.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={data?.integrations ?? []}
                  dataKey="count"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                  label={(e: any) => `${e.name} (${e.value})`}
                  labelLine={false}
                >
                  {(data?.integrations ?? []).map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      {(data?.topActions ?? []).length > 0 && (
        <Panel title="Ações mais usadas nas integrações">
          <ul className="divide-y divide-border/40">
            {(data?.topActions ?? []).map((a) => (
              <li key={a.action} className="px-1 py-2 flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{a.action}</span>
                <span className="text-muted-foreground tabular-nums">{a.count}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
