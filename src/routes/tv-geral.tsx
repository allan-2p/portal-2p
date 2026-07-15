import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import solarLogoAsset from "@/assets/2p-logo-black.png.asset.json";
import {
  getPublicSalesforceVendas,
  getPublicSalesforceVendidoTv,
  getPublicClientesNovosTv,
  getPublicRecorrenciaTv,
  getPublicRetencaoTv,
} from "@/lib/salesforce.functions";
import { getPublicMonthGoalTotal, getPublicGroupKpiGoals } from "@/lib/tv-public.functions";
import { businessDaysOfMonth, isBusinessDay } from "@/lib/business-days";

const solarLogo = solarLogoAsset.url;

export const Route = createFileRoute("/tv-geral")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "2P Group · Painel de Performance" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard2P,
});

/* ============================================================
   GRUPO 2P — PAINEL DE PERFORMANCE (TV 1920x1080) · v6 (dados reais)
   ============================================================ */

const T = {
  bg0: "#07080F",
  bg1: "#0E1120",
  bg2: "#141A2E",
  bgTxt: "#F2F3F7",
  bgFaint: "#8A8FA0",
  // Cards claros — cinza moderno / prateado com leve toque lavanda
  card: "#EEF0F7",
  card2: "#F6F7FB",
  cardBorder: "rgba(180,185,210,0.55)",
  ink: "#1B1D2B",
  dim: "#5A5F76",
  faint: "#9096AE",
  track: "#DDE1EE",
  barReal: "#3A3F5C",
  barProj: "#CFD4E4",
  orange: "#FF8A3D",
  blue: "#6B5BFF",
  cyan: "#5CC8FF",
  green: "#22B37A",
  amber: "#D9930A",
  red: "#E24A3E",
  chip: "#0A0D1A",
};

const grad = `linear-gradient(90deg, ${T.orange}, ${T.blue})`;
const gradGlow = `linear-gradient(120deg, ${T.orange} 0%, #FF3D9A 45%, ${T.blue} 100%)`;

const fmtBRL = (v: number, compact = false) => {
  if (compact) {
    if (v >= 1_000_000)
      return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mi`;
    if (v >= 1_000)
      return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  }
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
};

const fmtK = (v: number) =>
  v >= 1000
    ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
    : `${Math.round(v)} mil`;

const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

const semaforo = (atingidoPct: number, pacePct = 100) => {
  const r = pacePct > 0 ? (atingidoPct / pacePct) * 100 : atingidoPct;
  if (r >= 100) return T.green;
  if (r >= 80) return T.amber;
  return T.red;
};

/* ---------- count-up ---------- */
function useCountUp(target: number, dur = 900) {
  const [val, setVal] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    if (from === target) return;
    prev.current = target;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return val;
}

/* ---------- tipos ---------- */
type WeekDay = { dia: string; proj: number; real: number };
type Kpi = {
  label: string;
  periodo: string;
  metaQtd: number;
  realQtd: number;
  pace: number;
  metaPct?: number;
};
type TvData = {
  mes: { vendas: number; meta: number; projetadoDia: number; faturamento: number };
  tri: {
    solar: { meta: number; real: number };
    carreg: { meta: number; real: number };
    paceEsperado: number;
  };
  semanaOrc: WeekDay[];
  semanaVen: WeekDay[];
  diaAtual: string;
  kpis: {
    clientesNovos: Kpi;
    novosReativ: Kpi;
    recorrencia: Kpi;
    retencao: Kpi;
  };
};

const DIA_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function fmtKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Semana atual: segunda até sexta (5 dias). */
function currentWeekDays(now: Date): Date[] {
  const dow = now.getDay(); // 0=Dom..6=Sáb
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + diffToMonday);
  const out: Date[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    out.push(d);
  }
  return out;
}

const AB_THRESHOLD = 15_000;

function useTvData(): { data: TvData; loading: boolean; isFetching: boolean; lastUpdated: number } {
  const now = useMemo(() => new Date(), []);
  const y = now.getFullYear();
  const m = now.getMonth();
  const monthEnd = fmtKey(new Date(y, m + 1, 0));

  const qStartMonth = Math.floor(m / 3) * 3;
  const curQStart = fmtKey(new Date(y, qStartMonth, 1));
  const curQEnd = fmtKey(new Date(y, qStartMonth + 3, 0));
  const prevQStart = fmtKey(new Date(y, qStartMonth - 3, 1));
  const prevQEnd = fmtKey(new Date(y, qStartMonth, 0));
  const yearBackStart = fmtKey(new Date(y, m - 12, 1));

  const fetchVendido = useServerFn(getPublicSalesforceVendidoTv);
  const fetchVendas = useServerFn(getPublicSalesforceVendas);
  const fetchMonthGoal = useServerFn(getPublicMonthGoalTotal);
  const fetchKpiGoals = useServerFn(getPublicGroupKpiGoals);
  const fetchClientesNovos = useServerFn(getPublicClientesNovosTv);
  const fetchRecorrencia = useServerFn(getPublicRecorrenciaTv);
  const fetchRetencao = useServerFn(getPublicRetencaoTv);

  // Polling agressivo para "tempo real" em TV — mantém refetch mesmo com aba em background.
  const FAST = 30_000;
  const MED = 2 * 60_000;
  const SLOW = 10 * 60_000;
  const commonFast = {
    refetchInterval: FAST,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 15_000,
  } as const;

  const vendidoMesQ = useQuery({
    queryKey: ["tv-vendido-mes"],
    queryFn: () => fetchVendido({ data: { variant: "vendido_mes" } }),
    ...commonFast,
  });
  const geradoMesQ = useQuery({
    queryKey: ["tv-gerado-mes"],
    queryFn: () => fetchVendido({ data: { variant: "gerado_mes" } }),
    ...commonFast,
  });
  const faturamentoMesQ = useQuery({
    queryKey: ["tv-faturamento-mes"],
    queryFn: () => fetchVendido({ data: { variant: "faturamento_mes" } }),
    ...commonFast,
  });
  const carregTriQ = useQuery({
    queryKey: ["tv-carregadores-tri"],
    queryFn: () => fetchVendido({ data: { variant: "carregadores_tri" } }),
    ...commonFast,
  });
  const vendidoTriQ = useQuery({
    queryKey: ["tv-vendido-tri"],
    queryFn: () => fetchVendido({ data: { variant: "vendido_tri" } }),
    ...commonFast,
  });
  const monthGoalQ = useQuery({
    queryKey: ["tv-month-goal", y, m + 1],
    queryFn: () => fetchMonthGoal({ data: { year: y, month: m + 1 } }),
    refetchInterval: MED,
    refetchIntervalInBackground: true,
    staleTime: 60_000,
  });
  const kpiGoalsQ = useQuery({
    queryKey: ["tv-group-kpi-goals"],
    queryFn: () => fetchKpiGoals(),
    refetchInterval: MED,
    refetchIntervalInBackground: true,
    staleTime: 60_000,
  });
  const vendasTriQ = useQuery({
    queryKey: ["tv-vendas-tri", curQStart, curQEnd],
    queryFn: () => fetchVendas({ data: { start: curQStart, end: curQEnd } }),
    refetchInterval: MED,
    refetchIntervalInBackground: true,
    staleTime: 60_000,
  });
  const vendasTriPrevQ = useQuery({
    queryKey: ["tv-vendas-tri-prev", prevQStart, prevQEnd],
    queryFn: () => fetchVendas({ data: { start: prevQStart, end: prevQEnd } }),
    refetchInterval: SLOW,
    refetchIntervalInBackground: true,
    staleTime: 5 * 60_000,
  });
  const vendas12mQ = useQuery({
    queryKey: ["tv-vendas-12m", yearBackStart, monthEnd],
    queryFn: () => fetchVendas({ data: { start: yearBackStart, end: monthEnd } }),
    refetchInterval: SLOW,
    refetchIntervalInBackground: true,
    staleTime: 5 * 60_000,
  });
  const clientesNovosQ = useQuery({
    queryKey: ["tv-clientes-novos"],
    queryFn: () => fetchClientesNovos(),
    refetchInterval: MED,
    refetchIntervalInBackground: true,
    staleTime: 60_000,
  });
  const recorrenciaQ = useQuery({
    queryKey: ["tv-recorrencia"],
    queryFn: () => fetchRecorrencia(),
    refetchInterval: MED,
    refetchIntervalInBackground: true,
    staleTime: 60_000,
  });
  const retencaoQ = useQuery({
    queryKey: ["tv-retencao"],
    queryFn: () => fetchRetencao(),
    refetchInterval: MED,
    refetchIntervalInBackground: true,
    staleTime: 60_000,
  });

  const loading =
    vendidoMesQ.isLoading ||
    geradoMesQ.isLoading ||
    faturamentoMesQ.isLoading ||
    monthGoalQ.isLoading ||
    kpiGoalsQ.isLoading;

  const isFetching =
    vendidoMesQ.isFetching ||
    geradoMesQ.isFetching ||
    faturamentoMesQ.isFetching ||
    monthGoalQ.isFetching ||
    kpiGoalsQ.isFetching ||
    vendasTriQ.isFetching ||
    vendasTriPrevQ.isFetching ||
    vendas12mQ.isFetching;

  const lastUpdated = Math.max(
    vendidoMesQ.dataUpdatedAt,
    geradoMesQ.dataUpdatedAt,
    faturamentoMesQ.dataUpdatedAt,
    monthGoalQ.dataUpdatedAt,
    kpiGoalsQ.dataUpdatedAt,
    vendasTriQ.dataUpdatedAt,
    vendasTriPrevQ.dataUpdatedAt,
    vendas12mQ.dataUpdatedAt,
  );

  const data = useMemo<TvData>(() => {
    const sumTotal = (recs: Array<{ total: number | null; amount: number | null }>) =>
      recs.reduce((a, r) => a + (r.total ?? r.amount ?? 0), 0);

    const vendas = sumTotal(vendidoMesQ.data?.records ?? []);
    const faturamento = sumTotal(faturamentoMesQ.data?.records ?? []);
    const meta = monthGoalQ.data?.total ?? 0;

    const bizDays = businessDaysOfMonth(y, m);
    const dailyGoal = bizDays.length > 0 ? meta / bizDays.length : 0;
    const todayDay = now.getDate();
    const elapsed = bizDays.filter((d) => d <= todayDay).length;
    const projetadoDia = Math.round(dailyGoal * elapsed);

    const solarReal = sumTotal(vendidoTriQ.data?.records ?? []);
    const solarMeta = 14_000_000;
    const carregMeta = 1_800_000;

    const week = currentWeekDays(now);
    const dayKeys = week.map((d) => fmtKey(d));

    const soldByDay = new Map<string, number>();
    for (const r of vendidoMesQ.data?.records ?? []) {
      if (!r.closeDate) continue;
      soldByDay.set(r.closeDate, (soldByDay.get(r.closeDate) ?? 0) + (r.total ?? r.amount ?? 0));
    }
    const genByDay = new Map<string, number>();
    for (const r of geradoMesQ.data?.records ?? []) {
      if (!r.createdDate) continue;
      genByDay.set(r.createdDate, (genByDay.get(r.createdDate) ?? 0) + (r.total ?? r.amount ?? 0));
    }
    const totalGen = sumTotal(geradoMesQ.data?.records ?? []);
    const convRate = totalGen > 0 ? vendas / totalGen : 0;
    const dailyGoalGen = convRate > 0 ? dailyGoal / convRate : dailyGoal * 1.5;

    const semanaVen: WeekDay[] = week.map((d, i) => {
      const key = dayKeys[i];
      const biz = isBusinessDay(d);
      const projK = biz ? Math.round(dailyGoal / 1000) : 0;
      const realK = Math.round((soldByDay.get(key) ?? 0) / 1000);
      return { dia: DIA_LABEL[d.getDay()], proj: projK, real: realK };
    });
    const semanaOrc: WeekDay[] = week.map((d, i) => {
      const key = dayKeys[i];
      const biz = isBusinessDay(d);
      const projK = biz ? Math.round(dailyGoalGen / 1000) : 0;
      const realK = Math.round((genByDay.get(key) ?? 0) / 1000);
      return { dia: DIA_LABEL[d.getDay()], proj: projK, real: realK };
    });

    const diaAtual = DIA_LABEL[now.getDay()];

    const kpiMap = new Map(
      (kpiGoalsQ.data?.records ?? []).map((r) => [r.kpi_key, r]),
    );
    const gNovos = kpiMap.get("novos");
    const gNovosReat = kpiMap.get("novos_reativacoes");
    const gRec = kpiMap.get("recorrencia");
    const gRet = kpiMap.get("retencao");

    // NOVOS / REATIVAÇÕES vêm da tabela Clientes Novos (mesmos filtros).
    const novosCount = clientesNovosQ.data?.novos ?? 0;
    const reativCount = clientesNovosQ.data?.reativacoes ?? 0;

    // RECORRÊNCIA vem da tabela de Recorrência (trimestre atual, contas > R$ 15k).
    const recorrenciaCount = recorrenciaQ.data?.count ?? 0;

    // RETENÇÃO vem da tabela de Retenção (trimestre atual vs anterior).
    const retencaoCount = retencaoQ.data?.count ?? 0;

    const paceMensal = bizDays.length > 0 ? Math.round((elapsed / bizDays.length) * 100) : 0;
    const triStart = new Date(y, qStartMonth, 1);
    const triEnd = new Date(y, qStartMonth + 3, 0);
    const paceTri = Math.round(
      ((now.getTime() - triStart.getTime()) /
        (triEnd.getTime() - triStart.getTime() + 24 * 3600_000)) *
        100,
    );

    return {
      mes: { vendas, meta, projetadoDia, faturamento },
      tri: {
        solar: { meta: solarMeta, real: solarReal },
        carreg: { meta: carregMeta, real: sumTotal(carregTriQ.data?.records ?? []) },
        paceEsperado: paceTri,
      },
      semanaOrc,
      semanaVen,
      diaAtual,
      kpis: {
        clientesNovos: {
          label: gNovos?.label ?? "Clientes novos",
          periodo: "mensal",
          metaQtd: gNovos?.goal ?? 40,
          realQtd: novosCount,
          pace: paceMensal,
        },
        novosReativ: {
          label: gNovosReat?.label ?? "Reativações",
          periodo: "mensal",
          metaQtd: gNovosReat?.goal ?? 100,
          realQtd: reativCount,
          pace: paceMensal,
        },
        recorrencia: {
          label: gRec?.label ?? "Recorrência",
          periodo: "trimestral",
          metaQtd: gRec?.goal ?? 115,
          realQtd: recorrenciaCount,
          pace: paceTri,
        },
        retencao: {
          label: gRet?.label ?? "Retenção",
          periodo: "trimestral",
          metaQtd: gRet?.goal ?? 87,
          realQtd: retencaoCount,
          pace: paceTri,
        },
      },
    };
  }, [
    vendidoMesQ.data,
    geradoMesQ.data,
    faturamentoMesQ.data,
    monthGoalQ.data,
    kpiGoalsQ.data,
    vendasTriQ.data,
    vendasTriPrevQ.data,
    vendas12mQ.data,
    clientesNovosQ.data,
    recorrenciaQ.data,
    retencaoQ.data,
    carregTriQ.data,
    vendidoTriQ.data,
    now,
    y,
    m,
    qStartMonth,
  ]);

  return { data, loading, isFetching, lastUpdated };
}

/* ---------- base ---------- */
const Card = ({
  children,
  style,
  delay = 0,
}: {
  children: ReactNode;
  style?: CSSProperties;
  delay?: number;
}) => (
  <div
    style={{
      background:
        "linear-gradient(140deg, #F7F8FC 0%, #ECEEF6 45%, #E4E5F1 100%)",
      border: `1px solid ${T.cardBorder}`,
      borderRadius: 22,
      padding: 22,
      boxShadow:
        "0 30px 60px -30px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.6) inset, 0 1px 0 rgba(255,255,255,.9) inset",
      color: T.ink,
      animation: `fadeUp .6s ease ${delay}s both`,
      position: "relative",
      overflow: "hidden",
      ...style,
    }}
  >
    {children}
  </div>
);

const Eyebrow = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      fontSize: 21,
      fontWeight: 700,
      letterSpacing: 2,
      textTransform: "uppercase",
      color: T.dim,
      ...style,
    }}
  >
    {children}
  </div>
);

const ProgressBar = ({
  value,
  color,
  marker,
  height = 8,
  shimmer = false,
  track = T.track,
}: {
  value: number;
  color: string;
  marker?: number;
  height?: number;
  shimmer?: boolean;
  track?: string;
}) => (
  <div style={{ position: "relative", width: "100%" }}>
    <div style={{ width: "100%", height, background: track, borderRadius: height, overflow: "hidden" }}>
      <div
        style={{
          width: `${Math.min(100, value)}%`,
          height: "100%",
          background: color,
          borderRadius: height,
          position: "relative",
          transition: "width .8s ease",
        }}
      >
        {shimmer && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent)",
              backgroundSize: "220% 100%",
              animation: "shimmer 2.4s linear infinite",
            }}
          />
        )}
      </div>
    </div>
    {marker != null && (
      <div
        style={{
          position: "absolute",
          top: -3,
          left: `${Math.min(100, marker)}%`,
          width: 2,
          height: height + 6,
          background: "#fff",
          opacity: 0.7,
          borderRadius: 2,
        }}
      />
    )}
  </div>
);

const BrandStat = ({
  label,
  dotColor,
  real,
  meta,
  invert = false,
  gradientBar = false,
  embedded = false,
}: {
  label: string;
  dotColor: string;
  real: number;
  meta: number;
  invert?: boolean;
  gradientBar?: boolean;
  embedded?: boolean;
}) => {
  const p = pct(real, meta);
  const bg = invert
    ? "linear-gradient(135deg, #1B1F3A 0%, #2A1F55 60%, #3B2A7A 100%)"
    : embedded
      ? "transparent"
      : "linear-gradient(140deg, #F7F8FC 0%, #ECEEF6 55%, #E4E5F1 100%)";
  const fg = invert ? "#FFFFFF" : T.ink;
  const dim = invert ? "rgba(255,255,255,.72)" : T.dim;
  const track = invert ? "rgba(255,255,255,.14)" : T.track;
  const barColor = gradientBar ? gradGlow : invert ? "#FFFFFF" : T.ink;
  const v = useCountUp(real);
  return (
    <div
      style={{
        background: bg,
        border: invert
          ? "1px solid rgba(255,255,255,.08)"
          : embedded
            ? "none"
            : `1px solid ${T.cardBorder}`,
        borderRadius: 16,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: dotColor,
            boxShadow: `0 0 0 3px ${dotColor}22`,
          }}
        />
        <span
          style={{
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: dim,
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 45,
            fontWeight: 900,
            fontStyle: "italic",
            color: fg,
            letterSpacing: -0.5,
            lineHeight: 1,
          }}
        >
          {fmtBRL(v, true)}
        </span>
        <span style={{ fontSize: 24, fontWeight: 800, color: T.green }}>{p.toFixed(0)}%</span>
        <span style={{ fontSize: 21, color: dim }}>de {fmtBRL(meta, true)}</span>
      </div>
      <ProgressBar value={p} color={barColor} height={5} track={track} shimmer={gradientBar} />
    </div>
  );
};

const VendasDestaque = ({ mes }: { mes: TvData["mes"] }) => {
  const vendas = useCountUp(mes.vendas);
  const fat = useCountUp(mes.faturamento);
  const delta = mes.vendas - mes.projetadoDia;
  const acima = delta >= 0;
  const pMeta = pct(mes.vendas, mes.meta);

  return (
    <Card delay={0.05} style={{ padding: "24px 44px 26px" }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
        <Eyebrow>Vendas do mês</Eyebrow>
        <span style={{ fontSize: 22, color: T.dim }}>
          {pMeta.toFixed(0)}% da meta atingido
        </span>
      </div>

      {/* Hero: vendas gigante + faturamento discreto ao lado */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 28, flexWrap: "wrap", marginBottom: 16 }}>
        <div
          style={{
            fontSize: 130,
            fontWeight: 900,
            fontStyle: "italic",
            color: T.ink,
            letterSpacing: -3,
            lineHeight: 0.9,
          }}
        >
          {fmtBRL(Math.round(vendas))}
        </div>
        <div style={{ paddingBottom: 12 }}>
          <div
            style={{
              fontSize: 13,
              color: T.faint,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 2,
            }}
          >
            Faturamento do mês
          </div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 700,
              fontStyle: "italic",
              color: T.dim,
              letterSpacing: -0.5,
              lineHeight: 1,
            }}
          >
            {fmtBRL(Math.round(fat))}
          </div>
        </div>
      </div>

      {/* Barra de progresso */}
      <div style={{ marginBottom: 18 }}>
        <ProgressBar value={pMeta} color={grad} height={5} shimmer />
      </div>

      {/* Linha de métricas: Meta • Projetado • Saldo */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 0,
          alignItems: "center",
        }}
      >
        <div style={{ padding: "4px 20px 4px 0" }}>
          <Eyebrow style={{ fontSize: 14 }}>Meta do mês</Eyebrow>
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              fontStyle: "italic",
              color: T.ink,
              letterSpacing: -0.5,
              lineHeight: 1.1,
              marginTop: 4,
            }}
          >
            {fmtBRL(mes.meta, true)}
          </div>
        </div>

        <div style={{ padding: "4px 20px", borderLeft: `1px solid ${T.cardBorder}` }}>
          <Eyebrow style={{ fontSize: 14 }}>Projetado até hoje</Eyebrow>
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              fontStyle: "italic",
              color: T.ink,
              letterSpacing: -0.5,
              lineHeight: 1.1,
              marginTop: 4,
            }}
          >
            {fmtBRL(mes.projetadoDia, true)}
          </div>
        </div>

        <div style={{ padding: "4px 0 4px 20px", borderLeft: `1px solid ${T.cardBorder}` }}>
          <Eyebrow style={{ fontSize: 14 }}>
            Saldo — {acima ? "acima do projetado" : "abaixo do projetado"}
          </Eyebrow>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginTop: 4,
              color: acima ? T.green : T.red,
              fontWeight: 900,
              fontStyle: "italic",
              fontSize: 30,
              letterSpacing: -0.5,
              lineHeight: 1.1,
            }}
          >
            <span style={{ fontSize: 24 }}>{acima ? "▲" : "▼"}</span>
            {fmtBRL(Math.abs(delta), true)}
          </div>
        </div>
      </div>
    </Card>
  );
};

const GraficoSemanal = ({
  titulo,
  dot,
  dados,
  diaAtual,
  delay,
}: {
  titulo: string;
  dot: string;
  dados: WeekDay[];
  diaAtual: string;
  delay: number;
}) => {
  const totalProj = dados.reduce((s, d) => s + d.proj, 0);
  const totalReal = dados.reduce((s, d) => s + d.real, 0);
  const p = pct(totalReal, totalProj);
  const max = Math.max(...dados.map((d) => Math.max(d.proj, d.real)), 1) * 1.18;

  return (
    <Card delay={delay} style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: dot }} />
          <Eyebrow>{titulo}</Eyebrow>
        </div>
        <div style={{ fontSize: 22, color: T.dim }}>
          <span style={{ color: T.ink, fontWeight: 800 }}>R$ {fmtK(totalReal)}</span>
          <span> / R$ {fmtK(totalProj)} proj </span>
          <span style={{ color: T.green, fontWeight: 800, marginLeft: 4 }}>{p.toFixed(0)}%</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${dados.length}, minmax(0, 110px))`, gap: 24, height: 150, alignItems: "end", justifyContent: "center", margin: "0 auto", width: "100%" }}>
        {dados.map((d, i) => {
          const hoje = d.dia === diaAtual;
          const hProj = (d.proj / max) * 100;
          const hReal = (d.real / max) * 100;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%" }}>
              <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "end", justifyContent: "center" }}>
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "70%",
                    height: `${hProj}%`,
                    background: T.barProj,
                    borderRadius: "10px 10px 4px 4px",
                    animation: `growUp .8s ease ${delay + i * 0.05}s both`,
                    transformOrigin: "bottom",
                  }}
                />
                <div
                  style={{
                    position: "relative",
                    width: "46%",
                    height: `${hReal}%`,
                    background: T.barReal,
                    borderRadius: "8px 8px 3px 3px",
                    animation: `growUp .9s ease ${delay + 0.15 + i * 0.05}s both`,
                    transformOrigin: "bottom",
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  {d.real > 0 &&
                    (hoje ? (
                      <div
                        style={{
                          position: "absolute",
                          top: -34,
                          background: `linear-gradient(135deg, ${T.orange}, ${T.blue})`,
                          color: "#fff",
                          boxShadow: "0 6px 18px -6px rgba(107,91,255,.7)",
                          fontSize: 19,
                          fontWeight: 800,
                          padding: "3px 10px",
                          borderRadius: 999,
                          whiteSpace: "nowrap",
                        }}
                      >
                        R$ {d.real}k
                      </div>
                    ) : (
                      <div
                        style={{
                          position: "absolute",
                          top: -26,
                          fontSize: 19,
                          fontWeight: 700,
                          color: T.dim,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {d.real}k
                      </div>
                    ))}
                </div>
              </div>
              <div
                style={{
                  fontSize: 19,
                  fontWeight: hoje ? 900 : 700,
                  color: hoje ? "#fff" : T.dim,
                  background: hoje ? `linear-gradient(135deg, ${T.orange}, ${T.blue})` : "transparent",
                  padding: hoje ? "2px 8px" : 0,
                  borderRadius: 999,
                  letterSpacing: 0.5,
                }}
              >
                {d.dia}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

const Donut = ({ value, color, size = 112 }: { value: number; color: string; size?: number }) => {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(1, value / 100));
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={T.track} strokeWidth={7} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={7}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={off}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset .8s ease" }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(90 ${size / 2} ${size / 2})`}
        fontSize={25}
        fontWeight={800}
        fill={T.ink}
      >
        {Math.round(value)}%
      </text>
    </svg>
  );
};

const KpiCard = ({ k, delay }: { k: Kpi; delay: number }) => {
  const p = pct(k.realQtd, k.metaQtd);
  const cor = semaforo(p, k.pace);
  return (
    <Card delay={delay} style={{ padding: "22px 26px", display: "flex", alignItems: "center", gap: 20 }}>
      <Donut value={p} color={cor} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: T.ink }}>{k.label}</span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: T.faint,
            }}
          >
            {k.periodo === "mensal" ? "MÊS" : k.periodo === "trimestral" ? "TRI" : k.periodo}
          </span>

        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 63, fontWeight: 900, fontStyle: "italic", color: T.ink, letterSpacing: -1, lineHeight: 1 }}>
            {k.realQtd}
          </span>
          <span style={{ fontSize: 28, color: T.faint }}>/ {k.metaQtd}</span>
          {k.metaPct != null && (
            <span style={{ fontSize: 18, color: T.dim, marginLeft: 6 }}>
              meta {k.metaPct}%
            </span>
          )}
        </div>
        <ProgressBar value={p} color={cor} height={6} />
      </div>
    </Card>
  );
};

const HeaderMetas = ({ tri }: { tri: TvData["tri"] }) => {
  const totalMeta = tri.solar.meta + tri.carreg.meta;
  const totalReal = tri.solar.real + tri.carreg.real;
  return (
    <Card style={{ flex: 1, padding: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.15fr", gap: 12 }}>
        <BrandStat label="2P Solar" dotColor={T.orange} real={tri.solar.real} meta={tri.solar.meta} embedded />
        <BrandStat label="2P Carregadores" dotColor={T.blue} real={tri.carreg.real} meta={tri.carreg.meta} embedded />
        <BrandStat label="Total Grupo" dotColor="#fff" real={totalReal} meta={totalMeta} invert gradientBar />
      </div>
    </Card>
  );
};

export function Dashboard2P({
  canvasPadding = 32,
  fill = false,
  overscan = 0,
  stretchTolerance = 0,
}: {
  canvasPadding?: number;
  fill?: boolean;
  overscan?: number;
  /** 0 = escala uniforme estrita (letterbox). 0.08 = permite até 8% de distorção
   *  no eixo menor para preencher mais tela sem visível deformação. */
  stretchTolerance?: number;
} = {}) {
  const { data, loading, isFetching, lastUpdated } = useTvData();
  const [scale, setScale] = useState<{ x: number; y: number; offsetX: number; offsetY: number }>({
    x: 1,
    y: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const [now, setNow] = useState(() => Date.now());
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const fit = () => {
      // Safe area (overscan) igual nos 4 lados.
      const availW = Math.max(1, window.innerWidth - overscan * 2);
      const availH = Math.max(1, window.innerHeight - overscan * 2);
      const sx = availW / 1920;
      const sy = availH / 1080;
      const base = Math.min(sx, sy);
      // Responsividade: cards crescem junto com a viewport. Quando `fill` está
      // ativo, cada eixo pode crescer até `base * (1 + stretchTolerance)` para
      // preencher mais tela sem distorção visível.
      const maxAxis = base * (1 + Math.max(0, stretchTolerance));
      const finalX = fill ? Math.min(sx, maxAxis) : base;
      const finalY = fill ? Math.min(sy, maxAxis) : base;
      const offsetX = overscan + (availW - 1920 * finalX) / 2;
      const offsetY = overscan + (availH - 1080 * finalY) / 2;
      setScale({ x: finalX, y: finalY, offsetX, offsetY });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fill, overscan, stretchTolerance]);





  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Recarrega a página (F5) automaticamente às 00h, 05h, 12h e 19h.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const RELOAD_HOURS = [0, 5, 12, 19];
    function msUntilNextReload() {
      const now = new Date();
      let next: Date | null = null;
      for (const h of RELOAD_HOURS) {
        const cand = new Date(now);
        cand.setHours(h, 0, 0, 0);
        if (cand.getTime() <= now.getTime() + 500) cand.setDate(cand.getDate() + 1);
        if (!next || cand < next) next = cand;
      }
      return Math.max(1000, next!.getTime() - now.getTime());
    }
    const t = setTimeout(() => window.location.reload(), msUntilNextReload());
    return () => clearTimeout(t);
  }, []);


  // Wake Lock: mantém a tela acesa enquanto o painel está aberto.
  useEffect(() => {
    let lock: any = null;
    let cancelled = false;
    const nav: any = navigator;
    async function acquire() {
      try {
        if (nav.wakeLock?.request) {
          lock = await nav.wakeLock.request("screen");
        }
      } catch {
        /* ignore */
      }
    }
    void acquire();
    const onVis = () => {
      if (document.visibilityState === "visible" && !lock && !cancelled) void acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      try {
        lock?.release?.();
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };

  const secsSinceUpdate = lastUpdated ? Math.max(0, Math.floor((now - lastUpdated) / 1000)) : null;
  const updateLabel =
    secsSinceUpdate == null
      ? "Aguardando dados…"
      : secsSinceUpdate < 5
        ? "atualizado agora"
        : secsSinceUpdate < 60
          ? `atualizado há ${secsSinceUpdate}s`
          : `atualizado há ${Math.floor(secsSinceUpdate / 60)}min`;



  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: `radial-gradient(1400px 900px at 15% -10%, ${T.bg2} 0%, ${T.bg1} 45%, ${T.bg0} 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: T.bgTxt,
        position: "relative",
      }}
    >
      <style>{`
        * { box-sizing: border-box; margin: 0; }
        @keyframes shimmer { 0%{background-position:220% 0} 100%{background-position:-40% 0} }
        @keyframes fadeUp { from{opacity:0; transform:translateY(14px)} to{opacity:1; transform:translateY(0)} }
        @keyframes growUp { from{transform:scaleY(0)} to{transform:scaleY(1)} }
        @keyframes sweep { 0%{transform:translateX(-40%) rotate(12deg); opacity:0} 15%{opacity:1} 85%{opacity:1} 100%{transform:translateX(140%) rotate(12deg); opacity:0} }
        @keyframes sweepBack { 0%{transform:translateX(140%) rotate(-14deg); opacity:0} 20%{opacity:.9} 80%{opacity:.9} 100%{transform:translateX(-40%) rotate(-14deg); opacity:0} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes floatOrb1 { 0%{transform:translate3d(0,0,0) scale(1)} 33%{transform:translate3d(180px,-120px,0) scale(1.25)} 66%{transform:translate3d(-90px,80px,0) scale(0.9)} 100%{transform:translate3d(0,0,0) scale(1)} }
        @keyframes floatOrb2 { 0%{transform:translate3d(0,0,0) scale(1)} 40%{transform:translate3d(-220px,140px,0) scale(1.3)} 75%{transform:translate3d(120px,-60px,0) scale(0.85)} 100%{transform:translate3d(0,0,0) scale(1)} }
        @keyframes floatOrb3 { 0%{transform:translate3d(0,0,0) scale(1) rotate(0deg)} 50%{transform:translate3d(140px,180px,0) scale(1.2) rotate(180deg)} 100%{transform:translate3d(0,0,0) scale(1) rotate(360deg)} }
        @keyframes floatOrb4 { 0%,100%{transform:translate3d(0,0,0) scale(1); opacity:.35} 50%{transform:translate3d(-180px,-100px,0) scale(1.4); opacity:.9} }
        @keyframes gridDrift { from{background-position:0 0, 0 0} to{background-position:120px 120px, 120px 120px} }
        @keyframes scanline { 0%{transform:translateY(-10%); opacity:0} 8%{opacity:1} 92%{opacity:1} 100%{transform:translateY(110%); opacity:0} }
        @keyframes scanlineH { 0%{transform:translateX(-10%); opacity:0} 10%{opacity:.8} 90%{opacity:.8} 100%{transform:translateX(110%); opacity:0} }
        @keyframes hueShift { 0%{filter:hue-rotate(0deg)} 50%{filter:hue-rotate(50deg)} 100%{filter:hue-rotate(0deg)} }
        @keyframes ringSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes twinkle { 0%,100%{opacity:.15} 50%{opacity:.7} }
      `}</style>

      {/* ---------- FUTURISTIC BACKDROP (fills the entire screen) ---------- */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", animation: "hueShift 14s ease-in-out infinite" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(107,91,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(107,91,255,.16) 1px, transparent 1px)", backgroundSize: "60px 60px, 60px 60px", maskImage: "radial-gradient(ellipse at 50% 40%, black 40%, transparent 85%)", WebkitMaskImage: "radial-gradient(ellipse at 50% 40%, black 40%, transparent 85%)", animation: "gridDrift 10s linear infinite", opacity: 0.85 }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.08) 1px, transparent 1px)", backgroundSize: "26px 26px", opacity: 0.6, animation: "twinkle 4s ease-in-out infinite" }} />
        <div style={{ position: "absolute", top: "-14%", left: "-8%", width: 900, height: 900, borderRadius: "50%", background: "radial-gradient(circle at 30% 30%, rgba(255,138,61,.75), rgba(255,138,61,0) 60%)", filter: "blur(50px)", animation: "floatOrb1 12s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "-18%", right: "-10%", width: 1000, height: 1000, borderRadius: "50%", background: "radial-gradient(circle at 50% 50%, rgba(107,91,255,.75), rgba(107,91,255,0) 65%)", filter: "blur(60px)", animation: "floatOrb2 15s ease-in-out infinite" }} />
        <div style={{ position: "absolute", top: "35%", left: "40%", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle at 50% 50%, rgba(92,200,255,.5), rgba(92,200,255,0) 70%)", filter: "blur(70px)", animation: "floatOrb3 18s ease-in-out infinite" }} />
        <div style={{ position: "absolute", top: "20%", right: "20%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle at 50% 50%, rgba(236,72,153,.55), rgba(236,72,153,0) 70%)", filter: "blur(80px)", animation: "floatOrb4 20s ease-in-out infinite" }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", width: 1200, height: 1200, marginLeft: -600, marginTop: -600, borderRadius: "50%", background: "conic-gradient(from 0deg, transparent 0deg, rgba(107,91,255,.18) 60deg, transparent 120deg, transparent 240deg, rgba(92,200,255,.18) 300deg, transparent 360deg)", filter: "blur(40px)", animation: "ringSpin 30s linear infinite", opacity: 0.7 }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: 280, height: "160%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,.14), transparent)", animation: "sweep 8s linear infinite" }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: 220, height: "160%", background: "linear-gradient(90deg, transparent, rgba(107,91,255,.18), transparent)", animation: "sweepBack 11s linear infinite" }} />
        <div style={{ position: "absolute", left: 0, right: 0, height: 3, background: "linear-gradient(90deg, transparent, rgba(92,200,255,.9), transparent)", boxShadow: "0 0 32px rgba(92,200,255,.9)", animation: "scanline 6s linear infinite" }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, width: 3, background: "linear-gradient(180deg, transparent, rgba(255,138,61,.75), transparent)", boxShadow: "0 0 28px rgba(255,138,61,.75)", animation: "scanlineH 13s linear infinite" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,.55) 100%)" }} />
      </div>


      <div
        style={{
          width: 1920,
          height: 1080,
          transform: `translate(-50%, -50%) scale(${scale.x}, ${scale.y})`,
          transformOrigin: "center center",
          padding: canvasPadding,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          position: "absolute",
          top: "50%",
          left: "50%",
          zIndex: 1,
        }}
      >
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 62,
                height: 62,
                borderRadius: 14,
                background: "linear-gradient(140deg, #F7F8FC, #E4E5F1)",
                border: `1px solid ${T.cardBorder}`,
                boxShadow: "0 10px 24px -14px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.9)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 8,
              }}
            >
              <img src={solarLogo} alt="2P" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />

            </div>
            <div>
              <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>Grupo 2P</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, fontSize: 15, color: T.bgFaint }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: loading ? T.amber : isFetching ? T.blue : T.green,
                    boxShadow: `0 0 8px ${loading ? T.amber : isFetching ? T.blue : T.green}`,
                    animation: isFetching ? "pulse 1.2s ease-in-out infinite" : undefined,
                  }}
                />
                <span>
                  {loading
                    ? "Carregando dados…"
                    : isFetching
                      ? "Sincronizando ao vivo…"
                      : `Ao vivo · ${updateLabel}`}
                </span>
              </div>
            </div>


          </div>
          <HeaderMetas tri={data.tri} />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 18, position: "relative", minHeight: 0 }}>
          <VendasDestaque mes={data.mes} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, position: "relative" }}>
            <GraficoSemanal
              titulo="Geração de orçamentos · semana"
              dot={T.orange}
              dados={data.semanaOrc}
              diaAtual={data.diaAtual}
              delay={0.15}
            />
            <GraficoSemanal
              titulo="Vendas · semana"
              dot={T.blue}
              dados={data.semanaVen}
              diaAtual={data.diaAtual}
              delay={0.2}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, position: "relative" }}>
            <KpiCard k={data.kpis.clientesNovos} delay={0.25} />
            <KpiCard k={data.kpis.novosReativ} delay={0.3} />
            <KpiCard k={data.kpis.recorrencia} delay={0.35} />
            <KpiCard k={data.kpis.retencao} delay={0.4} />
          </div>
        </div>




      </div>
    </div>
  );
}
