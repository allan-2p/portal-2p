import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import solarLogoAsset from "@/assets/2p-logo-black.png.asset.json";
import {
  getSalesforceVendas,
  getSalesforceVendidoMesAtual,
  OPP_DEFAULTS_VENDIDO_MES,
  OPP_DEFAULTS_GERADO_MES,
  OPP_DEFAULTS_VENDAS,
} from "@/lib/salesforce.functions";
import { getMonthGoalTotal } from "@/lib/admin.functions";
import { listGroupKpiGoals } from "@/lib/goals.functions";
import { businessDaysOfMonth, isBusinessDay } from "@/lib/business-days";

const solarLogo = solarLogoAsset.url;

export const Route = createFileRoute("/_authenticated/tv-geral")({
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
  bg0: "#232530",
  bg1: "#2E3039",
  bgTxt: "#F2F3F7",
  bgFaint: "#8A8FA0",
  card: "#F1F2F5",
  card2: "#FAFAFC",
  cardBorder: "#E1E3EA",
  ink: "#1B1D25",
  dim: "#5B5F6D",
  faint: "#9BA0AE",
  track: "#E2E4EB",
  barReal: "#3B3E4A",
  barProj: "#DDDFE7",
  orange: "#F07E2D",
  blue: "#4230FF",
  green: "#0FA958",
  amber: "#D98A06",
  red: "#DC3E32",
};

const grad = `linear-gradient(90deg, ${T.orange}, ${T.blue})`;

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

/** Semana atual: segunda até sábado (6 dias). */
function currentWeekDays(now: Date): Date[] {
  const dow = now.getDay(); // 0=Dom..6=Sáb
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + diffToMonday);
  const out: Date[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    out.push(d);
  }
  return out;
}

const AB_THRESHOLD = 15_000;

function useTvData(): { data: TvData; loading: boolean } {
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

  const fetchVendido = useServerFn(getSalesforceVendidoMesAtual);
  const fetchVendas = useServerFn(getSalesforceVendas);
  const fetchMonthGoal = useServerFn(getMonthGoalTotal);
  const fetchKpiGoals = useServerFn(listGroupKpiGoals);

  const vendidoMesQ = useQuery({
    queryKey: ["tv-vendido-mes"],
    queryFn: () => fetchVendido({ data: { ...OPP_DEFAULTS_VENDIDO_MES, unscoped: true } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const geradoMesQ = useQuery({
    queryKey: ["tv-gerado-mes"],
    queryFn: () => fetchVendido({ data: { ...OPP_DEFAULTS_GERADO_MES, unscoped: true } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const faturamentoMesQ = useQuery({
    queryKey: ["tv-faturamento-mes"],
    queryFn: () => fetchVendido({ data: { ...OPP_DEFAULTS_VENDAS, unscoped: true } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const monthGoalQ = useQuery({
    queryKey: ["tv-month-goal", y, m + 1],
    queryFn: () => fetchMonthGoal({ data: { year: y, month: m + 1, ownerId: null } }),
    staleTime: 5 * 60_000,
  });
  const kpiGoalsQ = useQuery({
    queryKey: ["tv-group-kpi-goals"],
    queryFn: () => fetchKpiGoals(),
    staleTime: 60_000,
  });
  const vendasTriQ = useQuery({
    queryKey: ["tv-vendas-tri", curQStart, curQEnd],
    queryFn: () => fetchVendas({ data: { start: curQStart, end: curQEnd, unscoped: true } }),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
  const vendasTriPrevQ = useQuery({
    queryKey: ["tv-vendas-tri-prev", prevQStart, prevQEnd],
    queryFn: () => fetchVendas({ data: { start: prevQStart, end: prevQEnd, unscoped: true } }),
    staleTime: 10 * 60_000,
  });
  const vendas12mQ = useQuery({
    queryKey: ["tv-vendas-12m", yearBackStart, monthEnd],
    queryFn: () => fetchVendas({ data: { start: yearBackStart, end: monthEnd, unscoped: true } }),
    staleTime: 10 * 60_000,
  });

  const loading =
    vendidoMesQ.isLoading ||
    geradoMesQ.isLoading ||
    faturamentoMesQ.isLoading ||
    monthGoalQ.isLoading ||
    kpiGoalsQ.isLoading;

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

    const solarReal = sumTotal(vendasTriQ.data?.records ?? []);
    const solarMeta = solarReal;

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

    // NOVOS (mensal): contas com venda neste mês que nunca tinham comprado em 12 meses anteriores.
    // REATIVAÇÕES: já compraram, mas não nos últimos 3 meses.
    const currMonthAccts = new Set<string>();
    const historicalAccts = new Set<string>();
    const last3mAccts = new Set<string>();
    const monthStartT = new Date(y, m, 1).getTime();
    const threeMonthsAgoT = new Date(y, m - 3, 1).getTime();
    for (const r of vendas12mQ.data?.records ?? []) {
      if (!r.accountId || !r.closeDate) continue;
      const [yy, mm, dd] = r.closeDate.split("-").map(Number);
      const t = new Date(yy, mm - 1, dd).getTime();
      if (t >= monthStartT) {
        currMonthAccts.add(r.accountId);
      } else {
        historicalAccts.add(r.accountId);
        if (t >= threeMonthsAgoT) last3mAccts.add(r.accountId);
      }
    }
    let novosCount = 0;
    let reativCount = 0;
    for (const acc of currMonthAccts) {
      if (!historicalAccts.has(acc)) novosCount += 1;
      else if (!last3mAccts.has(acc)) reativCount += 1;
    }
    const novosReativCount = novosCount + reativCount;

    // RECORRÊNCIA (trimestral): contas com venda no tri atual e no tri anterior
    const curTriAccts = new Set<string>();
    for (const r of vendasTriQ.data?.records ?? []) {
      if (r.accountId) curTriAccts.add(r.accountId);
    }
    const prevTriAccts = new Set<string>();
    const prevAcctTotals = new Map<string, number>();
    for (const r of vendasTriPrevQ.data?.records ?? []) {
      if (!r.accountId) continue;
      prevTriAccts.add(r.accountId);
      prevAcctTotals.set(
        r.accountId,
        (prevAcctTotals.get(r.accountId) ?? 0) + (r.total ?? r.amount ?? 0),
      );
    }
    let recorrenciaCount = 0;
    for (const acc of curTriAccts) if (prevTriAccts.has(acc)) recorrenciaCount += 1;

    // RETENÇÃO (trimestral): contas A/B do tri anterior que seguem A/B no atual
    const prevAB = new Set<string>();
    for (const [acc, v] of prevAcctTotals) if (v >= AB_THRESHOLD) prevAB.add(acc);
    const curAcctTotals = new Map<string, number>();
    for (const r of vendasTriQ.data?.records ?? []) {
      if (!r.accountId) continue;
      curAcctTotals.set(
        r.accountId,
        (curAcctTotals.get(r.accountId) ?? 0) + (r.total ?? r.amount ?? 0),
      );
    }
    let retencaoCount = 0;
    for (const acc of prevAB) if ((curAcctTotals.get(acc) ?? 0) >= AB_THRESHOLD) retencaoCount += 1;

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
        carreg: { meta: 0, real: 0 },
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
          label: gNovosReat?.label ?? "Novos e reativações",
          periodo: "mensal",
          metaQtd: gNovosReat?.goal ?? 100,
          realQtd: novosReativCount,
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
    now,
    y,
    m,
    qStartMonth,
  ]);

  return { data, loading };
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
      background: T.card,
      border: `1px solid ${T.cardBorder}`,
      borderRadius: 22,
      padding: 22,
      boxShadow: "0 12px 40px -20px rgba(0,0,0,.6)",
      animation: `fadeUp .6s ease ${delay}s both`,
      ...style,
    }}
  >
    {children}
  </div>
);

const Eyebrow = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      fontSize: 11,
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
          background: T.ink,
          opacity: 0.55,
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
}: {
  label: string;
  dotColor: string;
  real: number;
  meta: number;
  invert?: boolean;
  gradientBar?: boolean;
}) => {
  const p = pct(real, meta);
  const bg = invert ? T.ink : T.card;
  const fg = invert ? T.bgTxt : T.ink;
  const dim = invert ? "#B7BAC7" : T.dim;
  const track = invert ? "rgba(255,255,255,.09)" : T.track;
  const barColor = gradientBar ? grad : invert ? T.bgTxt : T.ink;
  const v = useCountUp(real);
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${invert ? "rgba(255,255,255,.08)" : T.cardBorder}`,
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
            fontSize: 10,
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
            fontSize: 26,
            fontWeight: 900,
            fontStyle: "italic",
            color: fg,
            letterSpacing: -0.5,
            lineHeight: 1,
          }}
        >
          {fmtBRL(v, true)}
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: T.green }}>{p.toFixed(0)}%</span>
        <span style={{ fontSize: 12, color: dim }}>de {fmtBRL(meta, true)}</span>
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
    <Card delay={0.05} style={{ padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
        <Eyebrow>Vendas do mês</Eyebrow>
        <span style={{ fontSize: 11, color: T.dim }}>
          Meta {fmtBRL(mes.meta, true)} · {pMeta.toFixed(0)}% atingido
        </span>
      </div>
      <div style={{ maxWidth: 420, marginBottom: 14 }}>
        <ProgressBar value={pMeta} color={grad} height={4} shimmer />
      </div>

      <div
        style={{
          fontSize: 128,
          fontWeight: 900,
          fontStyle: "italic",
          color: T.ink,
          letterSpacing: -4,
          lineHeight: 0.95,
          margin: "4px 0 10px",
        }}
      >
        {fmtBRL(Math.round(vendas))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 15, color: T.dim }}>
          Projetado até hoje:{" "}
          <span style={{ color: T.ink, fontWeight: 700 }}>{fmtBRL(mes.projetadoDia, true)}</span>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 999,
            background: acima ? "rgba(15,169,88,.12)" : "rgba(220,62,50,.12)",
            color: acima ? T.green : T.red,
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          <span>{acima ? "▲" : "▼"}</span>
          {fmtBRL(Math.abs(delta), true)} {acima ? "acima" : "abaixo"}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          paddingTop: 14,
          borderTop: `1px solid ${T.cardBorder}`,
        }}
      >
        <Eyebrow>Faturamento do mês</Eyebrow>
        <span style={{ fontSize: 26, fontWeight: 800, color: T.dim, letterSpacing: -0.5 }}>
          {fmtBRL(Math.round(fat))}
        </span>
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
        <div style={{ fontSize: 13, color: T.dim }}>
          <span style={{ color: T.ink, fontWeight: 800 }}>R$ {fmtK(totalReal)}</span>
          <span> / R$ {fmtK(totalProj)} proj </span>
          <span style={{ color: T.green, fontWeight: 800, marginLeft: 4 }}>{p.toFixed(0)}%</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${dados.length}, 1fr)`, gap: 14, height: 150, alignItems: "end" }}>
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
                          top: -26,
                          background: T.ink,
                          color: T.bgTxt,
                          fontSize: 11,
                          fontWeight: 800,
                          padding: "3px 8px",
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
                          top: -18,
                          fontSize: 11,
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
                  fontSize: 11,
                  fontWeight: hoje ? 900 : 700,
                  color: hoje ? T.bgTxt : T.dim,
                  background: hoje ? T.ink : "transparent",
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

const Donut = ({ value, color, size = 60 }: { value: number; color: string; size?: number }) => {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(1, value / 100));
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={T.track} strokeWidth={6} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={6}
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
        fontSize={13}
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
    <Card delay={delay} style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 16 }}>
      <Donut value={p} color={cor} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{k.label}</span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: T.faint,
            }}
          >
            {k.periodo}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 30, fontWeight: 900, fontStyle: "italic", color: T.ink, letterSpacing: -1 }}>
            {k.realQtd}
          </span>
          <span style={{ fontSize: 14, color: T.faint }}>/ {k.metaQtd}</span>
          {k.metaPct != null && (
            <span style={{ fontSize: 10, color: T.dim, marginLeft: 6 }}>
              meta {k.metaPct}% · atual <b>{p.toFixed(0)}%</b>
            </span>
          )}
        </div>
        <ProgressBar value={p} color={cor} height={5} />
      </div>
    </Card>
  );
};

const HeaderMetas = ({ tri }: { tri: TvData["tri"] }) => {
  const totalMeta = tri.solar.meta + tri.carreg.meta;
  const totalReal = tri.solar.real + tri.carreg.real;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.15fr", gap: 12, flex: 1 }}>
      <BrandStat label="2P Solar" dotColor={T.orange} real={tri.solar.real} meta={tri.solar.meta} />
      <BrandStat label="2P Carregadores" dotColor={T.blue} real={tri.carreg.real} meta={tri.carreg.meta} />
      <BrandStat label="Total Grupo" dotColor="#fff" real={totalReal} meta={totalMeta} invert gradientBar />
    </div>
  );
};

function Dashboard2P() {
  const { data, loading } = useTvData();
  const [scale, setScale] = useState(1);
  const [ago, setAgo] = useState(0);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setAgo(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: `radial-gradient(1200px 800px at 20% 0%, ${T.bg1}, ${T.bg0} 70%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: T.bgTxt,
      }}
    >
      <style>{`
        * { box-sizing: border-box; margin: 0; }
        @keyframes shimmer { 0%{background-position:220% 0} 100%{background-position:-40% 0} }
        @keyframes fadeUp { from{opacity:0; transform:translateY(14px)} to{opacity:1; transform:translateY(0)} }
        @keyframes growUp { from{transform:scaleY(0)} to{transform:scaleY(1)} }
        @keyframes sweep { 0%{transform:translateX(-30%) rotate(12deg)} 100%{transform:translateX(130%) rotate(12deg)} }
      `}</style>

      <div
        style={{
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: "center",
          padding: 32,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -100,
            right: -200,
            width: 900,
            height: 600,
            background: "linear-gradient(120deg, rgba(255,255,255,.05), transparent 60%)",
            borderRadius: 40,
            transform: "rotate(12deg)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -80,
            left: -120,
            width: 500,
            height: 400,
            background: "linear-gradient(60deg, rgba(240,126,45,.06), transparent 70%)",
            borderRadius: 40,
            transform: "rotate(-8deg)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 180,
            height: "160%",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent)",
            animation: "sweep 12s linear infinite",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 62,
                height: 62,
                borderRadius: 14,
                background: T.card,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 8,
              }}
            >
              <img src={solarLogo} alt="2P" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}>Grupo 2P</div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: T.bgFaint }}>
                PAINEL DE PERFORMANCE
              </div>
            </div>
          </div>
          <HeaderMetas tri={data.tri} />
        </div>

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

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 11,
            color: T.bgFaint,
            marginTop: "auto",
            position: "relative",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: loading ? T.amber : T.green,
                boxShadow: `0 0 10px ${loading ? T.amber : T.green}`,
              }}
            />
            {loading ? "Carregando…" : `Conectado · em tela há ${ago}s`}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <span><span style={{ color: T.orange }}>●</span> 2P Solar</span>
            <span><span style={{ color: T.blue }}>●</span> 2P Carregadores</span>
            <span style={{ opacity: 0.6 }}>┆ barra clara = projetado · barra grafite = realizado</span>
          </div>
        </div>
      </div>
    </div>
  );
}
