import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  Tooltip,
} from "recharts";
import { TrendingUp, TrendingDown, Wifi, WifiOff, Zap, Sun } from "lucide-react";
import solarLogo from "@/assets/2p-logo-black.png";

export const Route = createFileRoute("/_authenticated/2p-group")({
  head: () => ({
    meta: [
      { title: "2P Group · Painel de Performance" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TvDashboardPage,
});

/* ----------------------------- Design tokens ----------------------------- */

const COLORS = {
  bg: "#0D0D12",
  bgAlt: "#101018",
  solar: "#F28A3C",
  solarDeep: "#EF8434",
  carreg: "#1A00B0",
  carregSoft: "#2100B8",
  neutral: "#3A3A3C",
  green: "#22C55E",
  amber: "#F59E0B",
  red: "#EF4444",
};

/* ----------------------------- Mock payload ------------------------------ */

type DashboardPayload = {
  atualizadoEm: string;
  mes: { vendas: number; metaVendas: number; projetadoDia: number; faturamento: number };
  trimestre: {
    solar: { meta: number; realizado: number };
    carregadores: { meta: number; realizado: number };
    paceEsperadoPct: number;
  };
  semana: {
    orcamentos: { dia: string; projetado: number; realizado: number }[];
    vendas: { dia: string; projetado: number; realizado: number }[];
  };
  indicadores: {
    clientesNovos: { metaQtd: number; realizadoQtd: number };
    novosReativacoes: { metaQtd: number; realizadoQtd: number };
    recorrencia: { metaQtd: number; realizadoQtd: number; pct: number };
    retencao: { metaQtd: number; metaPct: number; realizadoQtd: number; pct: number };
  };
};

const MOCK: DashboardPayload = {
  atualizadoEm: new Date().toISOString(),
  mes: {
    vendas: 2_845_000,
    metaVendas: 5_200_000,
    projetadoDia: 2_600_000,
    faturamento: 3_120_000,
  },
  trimestre: {
    solar: { meta: 14_000_000, realizado: 9_450_000 },
    carregadores: { meta: 1_800_000, realizado: 1_020_000 },
    paceEsperadoPct: 68,
  },
  semana: {
    orcamentos: [
      { dia: "Seg", projetado: 42, realizado: 48 },
      { dia: "Ter", projetado: 42, realizado: 39 },
      { dia: "Qua", projetado: 42, realizado: 51 },
      { dia: "Qui", projetado: 42, realizado: 44 },
      { dia: "Sex", projetado: 42, realizado: 22 },
    ],
    vendas: [
      { dia: "Seg", projetado: 180_000, realizado: 210_000 },
      { dia: "Ter", projetado: 180_000, realizado: 145_000 },
      { dia: "Qua", projetado: 180_000, realizado: 240_000 },
      { dia: "Qui", projetado: 180_000, realizado: 195_000 },
      { dia: "Sex", projetado: 180_000, realizado: 80_000 },
    ],
  },
  indicadores: {
    clientesNovos: { metaQtd: 60, realizadoQtd: 47 },
    novosReativacoes: { metaQtd: 90, realizadoQtd: 92 },
    recorrencia: { metaQtd: 140, realizadoQtd: 108, pct: 77 },
    retencao: { metaQtd: 200, metaPct: 90, realizadoQtd: 178, pct: 89 },
  },
};

/** Stub: substitua por WebSocket ou react-query polling. */
function useDashboardData() {
  const [data, setData] = useState<DashboardPayload>(MOCK);
  const [online, setOnline] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date>(new Date());

  useEffect(() => {
    // Polling stub a cada 30s — troque por fetch real.
    const id = setInterval(() => {
      setData((prev) => ({
        ...prev,
        mes: {
          ...prev.mes,
          vendas: prev.mes.vendas + Math.round((Math.random() - 0.3) * 8000),
          faturamento: prev.mes.faturamento + Math.round((Math.random() - 0.3) * 10000),
        },
        atualizadoEm: new Date().toISOString(),
      }));
      setUpdatedAt(new Date());
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  return { data, online, setOnline, updatedAt };
}

/* -------------------------------- Helpers -------------------------------- */

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function fmtBRL(v: number) {
  return brl.format(v);
}
function fmtBRLShort(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)} k`;
  return brl.format(v);
}
function pct(realized: number, goal: number) {
  if (goal <= 0) return 0;
  return (realized / goal) * 100;
}
function semaphore(pctVal: number) {
  if (pctVal >= 100) return COLORS.green;
  if (pctVal >= 80) return COLORS.amber;
  return COLORS.red;
}

/* ----------------------------- Count-up number --------------------------- */

function CountUp({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const mv = useMotionValue(value);
  const rounded = useTransform(mv, (v) => format(Math.round(v)));
  useEffect(() => {
    const ctrl = animate(mv, value, { duration: 0.9, ease: "easeOut" });
    return () => ctrl.stop();
  }, [value, mv]);
  return <motion.span className={className}>{rounded as unknown as string}</motion.span>;
}

/* -------------------------------- Page ----------------------------------- */

function TvDashboardPage() {
  const { data, online, updatedAt } = useDashboardData();
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - updatedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [updatedAt]);

  return (
    <div
      className="fixed inset-0 overflow-hidden text-white font-sans"
      style={{
        background: `radial-gradient(1200px 700px at 15% -10%, rgba(242,138,60,0.10), transparent 60%), radial-gradient(1000px 600px at 100% 110%, rgba(26,0,176,0.16), transparent 60%), ${COLORS.bg}`,
        fontFamily:
          "Inter, Manrope, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {/* Fit-to-screen: força 1920x1080 e escala para qualquer TV */}
      <ScaleTo1080>
        <div className="w-[1920px] h-[1080px] p-8 flex flex-col gap-6">
          <Header data={data} />

          <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
            {/* Centro esquerdo — protagonista */}
            <div className="col-span-7 flex flex-col gap-6 min-h-0">
              <VendasHero mes={data.mes} />
              <div className="grid grid-cols-2 gap-6 flex-1 min-h-0">
                <ChartCard
                  title="Orçamentos da Semana"
                  data={data.semana.orcamentos}
                  formatValue={(v) => String(v)}
                  color={COLORS.solar}
                />
                <ChartCard
                  title="Vendas da Semana"
                  data={data.semana.vendas}
                  formatValue={fmtBRLShort}
                  color={COLORS.carregSoft}
                />
              </div>
            </div>

            {/* Direita — meta trimestral em destaque */}
            <div className="col-span-5 flex flex-col gap-6 min-h-0">
              <QuarterGoals trimestre={data.trimestre} />
              <IndicadoresGrid indicadores={data.indicadores} />
            </div>
          </div>

          <StatusFooter online={online} secondsAgo={secondsAgo} />
        </div>
      </ScaleTo1080>
    </div>
  );
}

/* --------------------------- Auto-scale to 1080p ------------------------- */

function ScaleTo1080({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    function compute() {
      const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      setScale(s);
    }
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          width: 1920,
          height: 1080,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* --------------------------------- Header -------------------------------- */

function Header({ data }: { data: DashboardPayload }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  return (
    <header className="flex items-center gap-6 h-[90px]">
      <div
        className="flex items-center gap-4 px-5 h-full rounded-2xl"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <img src={solarLogo} alt="2P" className="h-11 w-auto object-contain invert" />
        <div className="leading-tight">
          <div className="text-[11px] uppercase tracking-[0.25em] text-white/50">
            Grupo 2P
          </div>
          <div className="text-2xl font-black italic">Painel de Performance</div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/50 text-lg capitalize">{dateStr}</div>
      </div>

      <div className="text-right">
        <div className="text-[11px] uppercase tracking-[0.25em] text-white/50">
          Atualizado em tempo real
        </div>
        <div className="text-3xl font-black">
          {new Date(data.atualizadoEm).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </header>
  );
}

/* ---------------------------- Vendas do Mês HERO ------------------------- */

function VendasHero({ mes }: { mes: DashboardPayload["mes"] }) {
  const delta = mes.vendas - mes.projetadoDia;
  const positive = delta >= 0;
  const metaPct = pct(mes.vendas, mes.metaVendas);
  const clampedMeta = Math.min(100, Math.max(0, metaPct));

  return (
    <div
      className="rounded-3xl p-8 relative overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* faixa diagonal de marca */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{
          background: `linear-gradient(90deg, ${COLORS.solar}, ${COLORS.carreg})`,
        }}
      />
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">
            Vendas do Mês
          </div>
          <div className="text-white/60 text-sm mt-1">
            Meta:{" "}
            <span className="text-white/80 font-semibold">{fmtBRLShort(mes.metaVendas)}</span>{" "}
            · <span style={{ color: semaphore(metaPct) }}>{metaPct.toFixed(0)}%</span> atingido
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">
            Faturamento do Mês
          </div>
          <div className="text-3xl font-extrabold mt-1">{fmtBRLShort(mes.faturamento)}</div>
        </div>
      </div>

      <div className="mt-3 leading-none">
        <CountUp
          value={mes.vendas}
          format={fmtBRL}
          className="block font-black text-[150px] leading-[1] bg-clip-text text-transparent"
        />
        <style>{`
          .block.font-black.text-\\[150px\\] {
            background-image: linear-gradient(180deg, #ffffff 0%, #cfcfd6 100%);
            -webkit-background-clip: text;
            background-clip: text;
          }
        `}</style>
      </div>

      {/* progress bar */}
      <div className="mt-6 h-2 rounded-full bg-white/8 overflow-hidden relative">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${clampedMeta}%`,
            background: `linear-gradient(90deg, ${COLORS.solar}, ${COLORS.carregSoft})`,
          }}
        />
      </div>

      <div className="mt-5 flex items-center gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">
            Projetado do dia
          </div>
          <div className="text-2xl font-bold mt-1">{fmtBRLShort(mes.projetadoDia)}</div>
        </div>
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-xl"
          style={{
            background: positive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            color: positive ? COLORS.green : COLORS.red,
          }}
        >
          {positive ? (
            <TrendingUp className="w-5 h-5" />
          ) : (
            <TrendingDown className="w-5 h-5" />
          )}
          <span className="font-extrabold text-xl">
            {positive ? "+" : "-"}
            {fmtBRLShort(Math.abs(delta))}
          </span>
          <span className="text-xs uppercase tracking-wider opacity-80">
            {positive ? "acima do pace" : "abaixo do pace"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Meta Trimestral ---------------------------- */

function QuarterGoals({ trimestre }: { trimestre: DashboardPayload["trimestre"] }) {
  const totalMeta = trimestre.solar.meta + trimestre.carregadores.meta;
  const totalReal = trimestre.solar.realizado + trimestre.carregadores.realizado;
  const rows = [
    {
      key: "solar",
      label: "2P Solar",
      icon: Sun,
      meta: trimestre.solar.meta,
      real: trimestre.solar.realizado,
      color: COLORS.solar,
      bar: `linear-gradient(90deg, ${COLORS.solarDeep}, ${COLORS.solar})`,
    },
    {
      key: "carreg",
      label: "2P Carregadores",
      icon: Zap,
      meta: trimestre.carregadores.meta,
      real: trimestre.carregadores.realizado,
      color: COLORS.carregSoft,
      bar: `linear-gradient(90deg, ${COLORS.carreg}, #4a2ce8)`,
    },
  ];

  return (
    <div
      className="rounded-3xl p-6 relative overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{
          background: `linear-gradient(90deg, ${COLORS.solar}, ${COLORS.carreg})`,
        }}
      />
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">
            Meta Trimestral
          </div>
          <div className="text-xl font-extrabold italic">Trimestre em curso</div>
        </div>
        <div
          className="text-[11px] px-2 py-1 rounded-md"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)" }}
        >
          Pace ideal: {trimestre.paceEsperadoPct.toFixed(0)}%
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {rows.map((r) => {
          const p = pct(r.real, r.meta);
          const clamped = Math.min(100, p);
          const Icon = r.icon;
          return (
            <div key={r.key}>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color: r.color }} />
                  <span className="text-white/80 font-semibold">{r.label}</span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="font-black text-xl">{fmtBRLShort(r.real)}</span>
                  <span className="text-white/50">/ {fmtBRLShort(r.meta)}</span>
                  <span style={{ color: semaphore(p) }} className="font-bold w-14 text-right">
                    {p.toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white/8 overflow-hidden">
                <div
                  className="h-full transition-all duration-700"
                  style={{ width: `${clamped}%`, background: r.bar }}
                />
              </div>
            </div>
          );
        })}

        {/* Total */}
        <div className="pt-4 mt-4 border-t border-white/8">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60 uppercase tracking-[0.2em] text-[11px]">
              Total Grupo 2P
            </span>
            <div className="flex items-baseline gap-3">
              <span className="font-black text-2xl">{fmtBRLShort(totalReal)}</span>
              <span className="text-white/50">/ {fmtBRLShort(totalMeta)}</span>
              <span
                className="font-bold w-14 text-right"
                style={{ color: semaphore(pct(totalReal, totalMeta)) }}
              >
                {pct(totalReal, totalMeta).toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="mt-2 h-3 rounded-full bg-white/8 overflow-hidden relative">
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${Math.min(100, pct(totalReal, totalMeta))}%`,
                background: `linear-gradient(90deg, ${COLORS.solar}, ${COLORS.carreg})`,
              }}
            />
            {/* Marcador de pace ideal */}
            <div
              className="absolute top-[-4px] bottom-[-4px] w-[3px] rounded-full"
              style={{
                left: `${trimestre.paceEsperadoPct}%`,
                background: "rgba(255,255,255,0.85)",
                boxShadow: "0 0 8px rgba(255,255,255,0.6)",
              }}
              title="Pace ideal"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Charts --------------------------------- */

function ChartCard({
  title,
  data,
  formatValue,
  color,
}: {
  title: string;
  data: { dia: string; projetado: number; realizado: number }[];
  formatValue: (v: number) => string;
  color: string;
}) {
  const totalReal = data.reduce((a, b) => a + b.realizado, 0);
  const totalProj = data.reduce((a, b) => a + b.projetado, 0);
  const p = pct(totalReal, totalProj);
  const todayIdx = useMemo(() => {
    const dow = new Date().getDay(); // 0 dom, 1 seg…
    return Math.min(Math.max(dow - 1, 0), data.length - 1);
  }, [data.length]);

  return (
    <div
      className="rounded-3xl p-5 flex flex-col relative overflow-hidden min-h-0"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: color, opacity: 0.7 }}
      />
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">
            Semana
          </div>
          <div className="text-lg font-extrabold">{title}</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-black">{formatValue(totalReal)}</div>
          <div className="text-[11px] text-white/50">
            de {formatValue(totalProj)} ·{" "}
            <span style={{ color: semaphore(p) }} className="font-bold">
              {p.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4}>
            <XAxis
              dataKey="dia"
              stroke="rgba(255,255,255,0.5)"
              tickLine={false}
              axisLine={false}
              fontSize={13}
            />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
              contentStyle={{
                background: "rgba(15,15,20,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
              }}
              formatter={(v: number) => formatValue(v)}
            />
            <ReferenceLine
              y={data[0]?.projetado ?? 0}
              stroke="rgba(255,255,255,0.35)"
              strokeDasharray="4 4"
              label={{
                value: "Projetado",
                position: "insideTopRight",
                fill: "rgba(255,255,255,0.5)",
                fontSize: 10,
              }}
            />
            <Bar dataKey="realizado" radius={[8, 8, 0, 0]}>
              {data.map((entry, i) => {
                const dayPct = pct(entry.realizado, entry.projetado);
                const barColor = semaphore(dayPct);
                return (
                  <Cell
                    key={i}
                    fill={barColor}
                    stroke={i === todayIdx ? "#fff" : "transparent"}
                    strokeWidth={i === todayIdx ? 2 : 0}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------ Indicadores ------------------------------ */

function IndicadoresGrid({
  indicadores,
}: {
  indicadores: DashboardPayload["indicadores"];
}) {
  const cards = [
    {
      title: "Clientes Novos",
      subtitle: "mensal",
      real: indicadores.clientesNovos.realizadoQtd,
      meta: indicadores.clientesNovos.metaQtd,
    },
    {
      title: "Novos e Reativações",
      subtitle: "mensal",
      real: indicadores.novosReativacoes.realizadoQtd,
      meta: indicadores.novosReativacoes.metaQtd,
    },
    {
      title: "Recorrência",
      subtitle: "trimestral",
      real: indicadores.recorrencia.realizadoQtd,
      meta: indicadores.recorrencia.metaQtd,
    },
    {
      title: "Retenção",
      subtitle: `trimestral · meta ${indicadores.retencao.metaPct}%`,
      real: indicadores.retencao.realizadoQtd,
      meta: indicadores.retencao.metaQtd,
      overridePct: indicadores.retencao.pct,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
      {cards.map((c) => {
        const p = c.overridePct ?? pct(c.real, c.meta);
        const color = semaphore(p);
        const clamped = Math.min(100, p);
        return (
          <div
            key={c.title}
            className="rounded-2xl p-4 relative overflow-hidden flex flex-col justify-between"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-[2px]"
              style={{ background: color, opacity: 0.6 }}
            />
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">
                {c.subtitle}
              </div>
              <div className="text-sm font-bold">{c.title}</div>
            </div>

            <div className="flex items-end justify-between mt-2">
              <div>
                <div className="font-black text-4xl leading-none">
                  <CountUp value={c.real} format={(v) => String(v)} />
                </div>
                <div className="text-[11px] text-white/50 mt-1">meta {c.meta}</div>
              </div>
              <Donut pct={p} color={color} />
            </div>

            <div className="mt-2 h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div
                className="h-full transition-all duration-700"
                style={{ width: `${clamped}%`, background: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Donut({ pct: p, color }: { pct: number; color: string }) {
  const size = 54;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, p));
  const offset = c - (clamped / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.7s ease" }}
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center font-bold text-[11px]"
        style={{ color }}
      >
        {p.toFixed(0)}%
      </div>
    </div>
  );
}

/* -------------------------------- Footer --------------------------------- */

function StatusFooter({ online, secondsAgo }: { online: boolean; secondsAgo: number }) {
  return (
    <footer className="flex items-center justify-between text-[11px] uppercase tracking-[0.25em] text-white/40">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2 h-2 rounded-full ${online ? "animate-pulse" : ""}`}
          style={{ background: online ? COLORS.green : COLORS.red }}
        />
        {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
        <span>
          {online ? "Conectado" : "Offline"} · atualizado há {secondsAgo}s
        </span>
      </div>
      <div>Grupo 2P · Painel de TV</div>
    </footer>
  );
}
