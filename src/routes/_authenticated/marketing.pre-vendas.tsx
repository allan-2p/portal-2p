import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import {
  ClipboardList,
  Filter as FilterIcon,
  Loader2,
  Calendar,
  TrendingDown,
  Users,
  DollarSign,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPreVendasFunilData, MARKETING_OWNER_NAMES } from "@/lib/salesforce.functions";
import { cn } from "@/lib/utils";

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const Route = createFileRoute("/_authenticated/marketing/pre-vendas")({
  head: () => ({
    meta: [
      { title: "Pré-Vendas — Portal 2P" },
      { name: "description", content: "Funil de leads e motivos de perda do time de Pré-Vendas do 2P." },
    ],
  }),
  component: PreVendasHome,
});

const fmt = (n: number) => n.toLocaleString("pt-BR");

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

type Preset = "7d" | "30d" | "mtd" | "qtd" | "ytd" | "custom";
function computeRange(preset: Preset): { start: string; end: string } {
  const now = new Date();
  const end = ymd(now);
  const start = new Date(now);
  switch (preset) {
    case "7d": start.setDate(now.getDate() - 6); break;
    case "30d": start.setDate(now.getDate() - 29); break;
    case "mtd": start.setDate(1); break;
    case "qtd": { const q = Math.floor(now.getMonth() / 3); start.setMonth(q * 3, 1); break; }
    case "ytd": start.setMonth(0, 1); break;
    default: start.setDate(1);
  }
  return { start: ymd(start), end };
}

function PreVendasHome() {
  const [preset, setPreset] = useState<Preset>("mtd");
  const [customStart, setCustomStart] = useState(() => computeRange("mtd").start);
  const [customEnd, setCustomEnd] = useState(() => computeRange("mtd").end);
  const range = preset === "custom"
    ? { start: customStart, end: customEnd }
    : computeRange(preset);

  const fetchData = useServerFn(getPreVendasFunilData);
  const q = useQuery({
    queryKey: ["pre-vendas-funil", range.start, range.end],
    queryFn: () => fetchData({ data: range }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Marketing · Pré-Vendas</div>
            <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary" /> Pré-Vendas
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Funil de leads e motivos de perda do time de pré-vendas — dados do Salesforce.
            </p>
          </div>
          <DateFilter
            preset={preset} setPreset={setPreset}
            customStart={customStart} customEnd={customEnd}
            setCustomStart={setCustomStart} setCustomEnd={setCustomEnd}
            range={range}
          />
        </div>

        <OwnersBadge />

        {q.isLoading ? (
          <div className="glass rounded-2xl p-10 flex items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando dados do Salesforce…
          </div>
        ) : q.isError ? (
          <div className="glass rounded-2xl p-6 text-sm text-destructive">
            Erro ao carregar Salesforce: {q.error instanceof Error ? q.error.message : "desconhecido"}
          </div>
        ) : q.data ? (
          <FunilDashboard data={q.data} />
        ) : null}
      </div>
    </AppLayout>
  );
}

function OwnersBadge() {
  const names = Object.values(MARKETING_OWNER_NAMES);
  return (
    <div className="glass rounded-xl px-4 py-2.5 flex items-center gap-2 flex-wrap text-xs">
      <Users className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground uppercase tracking-wider">Owners:</span>
      {names.map((n) => (
        <span key={n} className="px-2 py-0.5 rounded-md bg-surface-2 border border-border">
          {n}
        </span>
      ))}
    </div>
  );
}

function DateFilter({
  preset, setPreset, customStart, customEnd, setCustomStart, setCustomEnd, range,
}: {
  preset: Preset; setPreset: (p: Preset) => void;
  customStart: string; customEnd: string;
  setCustomStart: (s: string) => void; setCustomEnd: (s: string) => void;
  range: { start: string; end: string };
}) {
  const presets: { id: Preset; label: string }[] = [
    { id: "7d", label: "7d" },
    { id: "30d", label: "30d" },
    { id: "mtd", label: "Mês" },
    { id: "qtd", label: "Trim." },
    { id: "ytd", label: "Ano" },
    { id: "custom", label: "Personalizado" },
  ];
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-1.5 bg-surface-2 rounded-lg p-0.5 border border-border">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            className={cn(
              "px-2.5 h-8 rounded-md text-xs font-medium transition-colors",
              preset === p.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" ? (
        <div className="flex items-center gap-2 text-xs">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
            className="bg-surface-2 border border-border rounded-md px-2 h-8" />
          <span className="text-muted-foreground">até</span>
          <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
            className="bg-surface-2 border border-border rounded-md px-2 h-8" />
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {range.start} → {range.end}
        </div>
      )}
    </div>
  );
}

function FunilDashboard({ data }: { data: Awaited<ReturnType<typeof getPreVendasFunilData>> }) {
  const l = data.leads;
  const convRate = l.total > 0 ? (l.convertidos / l.total) * 100 : 0;
  const perdaRate = l.total > 0 ? (l.naoConvertidos / l.total) * 100 : 0;

  const funil = useMemo(() => ([
    { etapa: "Leads Recebidos", qtd: l.total, pct: 100, cor: "oklch(0.32 0.09 260)" },
    { etapa: "Novos", qtd: l.novos, pct: pct(l.novos, l.total), cor: "oklch(0.6 0.18 240)" },
    { etapa: "Amadurecimento", qtd: l.amadurecimento, pct: pct(l.amadurecimento, l.total), cor: "oklch(0.75 0.15 80)" },
    { etapa: "Convertidos", qtd: l.convertidos, pct: pct(l.convertidos, l.total), cor: "oklch(0.7 0.16 145)" },
    { etapa: "Não Convertidos", qtd: l.naoConvertidos, pct: pct(l.naoConvertidos, l.total), cor: "oklch(0.6 0.24 25)" },
  ]), [l]);

  const totalMotivosOpp = data.motivosPerdaOpp.reduce((a, b) => a + b.value, 0);
  const totalMotivosLead = data.motivosNaoConvertido.reduce((a, b) => a + b.value, 0);

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI label="Leads recebidos" value={fmt(l.total)} accent="oklch(0.32 0.09 260)" />
        <KPI label="Novos" value={fmt(l.novos)} accent="oklch(0.6 0.18 240)" />
        <KPI label="Amadurecimento" value={fmt(l.amadurecimento)} accent="oklch(0.75 0.15 80)" />
        <KPI label="Convertidos" value={fmt(l.convertidos)} sub={`${convRate.toFixed(1)}% do total`} accent="oklch(0.7 0.16 145)" />
        <KPI label="Não convertidos" value={fmt(l.naoConvertidos)} sub={`${perdaRate.toFixed(1)}% do total`} accent="oklch(0.6 0.24 25)" />
      </div>

      {/* Funil */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-semibold flex items-center gap-2">
            <FilterIcon className="h-4 w-4 text-primary" /> Funil de Leads
          </h2>
          <span className="text-[11px] text-muted-foreground">{data.range.start} → {data.range.end}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
              <th className="text-left px-5 py-2.5">Etapa</th>
              <th className="text-right px-5 py-2.5">Qtd</th>
              <th className="text-right px-5 py-2.5 w-40">% do total</th>
              <th className="text-left px-5 py-2.5 w-[45%]">Distribuição</th>
            </tr>
          </thead>
          <tbody>
            {funil.map((f) => (
              <tr key={f.etapa} className="border-b border-border/40 hover:bg-surface-2/50">
                <td className="px-5 py-3 font-medium flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: f.cor }} />
                  {f.etapa}
                </td>
                <td className="px-5 py-3 text-right tabular-nums font-semibold">{fmt(f.qtd)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{f.pct.toFixed(1)}%</td>
                <td className="px-5 py-3">
                  <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${f.pct}%`, background: f.cor }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Faturamento por owner (dados reais Salesforce) */}
      <FaturamentoOwnerCard data={data.faturamentoPorOwner} total={data.faturamentoTotal} />

      {/* Motivos de perda */}
      <div className="grid lg:grid-cols-2 gap-4">
        <MotivosCard
          title="Motivos de Perda — Oportunidades"
          subtitle="Projeto Não Fechado (por CloseDate)"
          buckets={data.motivosPerdaOpp}
          total={totalMotivosOpp}
        />
        <MotivosCard
          title="Motivos — Leads Não Convertidos"
          subtitle="Lead status = Não Convertido"
          buckets={data.motivosNaoConvertido}
          total={totalMotivosLead}
        />
      </div>
    </>
  );
}

function FaturamentoOwnerCard({
  data, total,
}: { data: { owner: string; leadsConvertidos: number; contas: number; faturado: number }[]; total: number }) {
  const max = data.reduce((m, d) => Math.max(m, d.faturado), 0);
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-display font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" /> Faturamento por Owner
          </h2>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Total faturado nas contas convertidas pelos owners no período
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">Total: {fmtBRL(total)}</span>
      </div>
      {data.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground text-center">Sem conversões no período.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
              <th className="text-left px-5 py-2.5">Owner</th>
              <th className="text-right px-5 py-2.5">Leads Convertidos</th>
              <th className="text-right px-5 py-2.5">Contas</th>
              <th className="text-right px-5 py-2.5">Faturado</th>
              <th className="text-left px-5 py-2.5 w-[35%]">Distribuição</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => {
              const w = max > 0 ? (r.faturado / max) * 100 : 0;
              return (
                <tr key={r.owner} className="border-b border-border/40 last:border-0 hover:bg-surface-2/50">
                  <td className="px-5 py-3 font-medium">{r.owner}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{fmt(r.leadsConvertidos)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{fmt(r.contas)}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold" style={{ color: "oklch(0.68 0.2 47)" }}>
                    {fmtBRL(r.faturado)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${w}%`, background: "oklch(0.68 0.2 47)" }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function pct(a: number, b: number) { return b > 0 ? (a / b) * 100 : 0; }

function KPI({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="glass rounded-xl p-3.5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-2xl tabular-nums mt-1" style={{ color: accent }}>{value}</div>
      {sub ? <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div> : null}
    </div>
  );
}

function MotivosCard({
  title, subtitle, buckets, total,
}: { title: string; subtitle: string; buckets: { label: string; value: number }[]; total: number }) {
  const max = buckets.reduce((m, b) => Math.max(m, b.value), 0);
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-display font-semibold flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-destructive" /> {title}
          </h2>
          <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">Total: {fmt(total)}</span>
      </div>
      {buckets.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground text-center">Sem registros no período.</div>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {buckets.map((m) => {
              const p = total > 0 ? (m.value / total) * 100 : 0;
              const w = max > 0 ? (m.value / max) * 100 : 0;
              return (
                <tr key={m.label} className="border-b border-border/40 last:border-0 hover:bg-surface-2/50">
                  <td className="px-5 py-2.5 truncate max-w-[240px]">{m.label}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold w-16">{fmt(m.value)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground w-16">{p.toFixed(1)}%</td>
                  <td className="px-5 py-2.5 w-[45%]">
                    <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full rounded-full bg-destructive/70" style={{ width: `${w}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
