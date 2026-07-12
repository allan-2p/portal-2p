import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import solarLogoAsset from "@/assets/2p-logo-black.png.asset.json";

const solarLogo = solarLogoAsset.url;

export const Route = createFileRoute("/tv-geral")({
  head: () => ({
    meta: [
      { title: "2P Group · Painel de Performance" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard2P,
});

/* ============================================================
   GRUPO 2P — PAINEL DE PERFORMANCE (TV 1920x1080) · v5
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

/* ---------- dados mockados ---------- */
type WeekDay = { dia: string; proj: number; real: number };
type Kpi = {
  label: string;
  periodo: string;
  metaQtd: number;
  realQtd: number;
  pace: number;
  metaPct?: number;
};

const seed = {
  mes: { vendas: 2_943_800, meta: 4_600_000, projetadoDia: 2_671_000, faturamento: 2_318_400 },
  tri: {
    solar: { meta: 14_000_000, real: 8_426_300 },
    carreg: { meta: 1_800_000, real: 1_027_900 },
    paceEsperado: 55,
  },
  semanaOrc: [
    { dia: "Seg", proj: 320, real: 291 },
    { dia: "Ter", proj: 320, real: 384 },
    { dia: "Qua", proj: 360, real: 402 },
    { dia: "Qui", proj: 360, real: 297 },
    { dia: "Sex", proj: 330, real: 254 },
    { dia: "Sáb", proj: 180, real: 0 },
  ] as WeekDay[],
  semanaVen: [
    { dia: "Seg", proj: 180, real: 152 },
    { dia: "Ter", proj: 180, real: 214 },
    { dia: "Qua", proj: 200, real: 231 },
    { dia: "Qui", proj: 200, real: 168 },
    { dia: "Sex", proj: 190, real: 198 },
    { dia: "Sáb", proj: 110, real: 0 },
  ] as WeekDay[],
  diaAtual: "Sex",
  kpis: {
    clientesNovos: { label: "Clientes novos", periodo: "mensal", metaQtd: 40, realQtd: 27, pace: 68 } as Kpi,
    novosReativ: { label: "Novos e reativações", periodo: "mensal", metaQtd: 60, realQtd: 43, pace: 68 } as Kpi,
    recorrencia: { label: "Recorrência", periodo: "trimestral", metaQtd: 90, realQtd: 61, pace: 55 } as Kpi,
    retencao: { label: "Retenção", periodo: "trimestral", metaQtd: 120, metaPct: 85, realQtd: 96, pace: 55 } as Kpi,
  },
};

function useLiveData() {
  const [data, setData] = useState(seed);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [ago, setAgo] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => {
      setData((d) => {
        const bump = Math.random() < 0.6 ? Math.round(1500 + Math.random() * 22000) : 0;
        const orcBump = Math.random() < 0.35 ? Math.round(2 + Math.random() * 9) : 0;
        const idx = 4;
        return {
          ...d,
          mes: {
            ...d.mes,
            vendas: d.mes.vendas + bump,
            faturamento: d.mes.faturamento + Math.round(bump * 0.72),
          },
          tri: {
            ...d.tri,
            solar: { ...d.tri.solar, real: d.tri.solar.real + Math.round(bump * 0.85) },
            carreg: { ...d.tri.carreg, real: d.tri.carreg.real + Math.round(bump * 0.15) },
          },
          semanaOrc: d.semanaOrc.map((x, i) => (i === idx ? { ...x, real: x.real + orcBump } : x)),
          semanaVen: d.semanaVen.map((x, i) =>
            i === idx ? { ...x, real: x.real + Math.round(bump / 1000) } : x,
          ),
        };
      });
      setLastUpdate(Date.now());
    }, 8000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setAgo(Math.floor((Date.now() - lastUpdate) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [lastUpdate]);

  return { data, ago };
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

/* --- header brand cards (Solar / Carregadores / Total) --- */
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
      <ProgressBar
        value={p}
        color={barColor}
        height={5}
        track={track}
        shimmer={gradientBar}
      />
    </div>
  );
};

/* --- Vendas do mês (bloco protagonista) --- */
const VendasDestaque = ({ mes }: { mes: typeof seed.mes }) => {
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

/* --- Gráfico semanal --- */
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
  const max = Math.max(...dados.map((d) => Math.max(d.proj, d.real))) * 1.18;

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
                {/* projetado */}
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
                {/* realizado */}
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

/* --- KPI donut + card --- */
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

/* ---------- Header meta trimestral ---------- */
const HeaderMetas = ({ tri }: { tri: typeof seed.tri }) => {
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

/* ---------- app ---------- */
function Dashboard2P() {
  const { data, ago } = useLiveData();
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
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
        @import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,600;0,700;0,800;0,900;1,800;1,900&display=swap');
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
        {/* textura pontilhada */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            pointerEvents: "none",
          }}
        />
        {/* painéis de vidro */}
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
        {/* feixe de luz */}
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

        {/* ===== HEADER ===== */}
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

        {/* ===== VENDAS DO MÊS ===== */}
        <VendasDestaque mes={data.mes} />

        {/* ===== GRÁFICOS SEMANAIS ===== */}
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

        {/* ===== KPIs ===== */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, position: "relative" }}>
          <KpiCard k={data.kpis.clientesNovos} delay={0.25} />
          <KpiCard k={data.kpis.novosReativ} delay={0.3} />
          <KpiCard k={data.kpis.recorrencia} delay={0.35} />
          <KpiCard k={data.kpis.retencao} delay={0.4} />
        </div>

        {/* ===== RODAPÉ ===== */}
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
                background: T.green,
                boxShadow: `0 0 10px ${T.green}`,
              }}
            />
            Conectado · atualizado há {ago}s
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <span>
              <span style={{ color: T.orange }}>●</span> 2P Solar
            </span>
            <span>
              <span style={{ color: T.blue }}>●</span> 2P Carregadores
            </span>
            <span style={{ opacity: 0.6 }}>┆ barra clara = projetado · barra grafite = realizado</span>
          </div>
        </div>
      </div>
    </div>
  );
}
