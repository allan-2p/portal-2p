import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useMarketingUnit } from "@/components/instance-provider";
import {
  Megaphone, Users, Target, TrendingUp, DollarSign, Facebook, Search,
  Globe, Instagram, Clock, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/marketing/")({
  head: () => ({ meta: [{ title: "Marketing — Portal 2P" }] }),
  component: MarketingHome,
});

const UNIT_LABEL = { solar: "2P Solar", carregadores: "2P Carregadores" } as const;
const UNIT_ACCENT = { solar: "oklch(0.68 0.2 47)", carregadores: "oklch(0.5 0.19 265)" } as const;

// Mocks por unidade — valores realistas de exemplo, trocáveis quando ligarmos APIs.
const DATA = {
  solar: {
    goalNovos: { real: 28, meta: 40 },
    goalMql: { real: 187, meta: 250 },
    goalSeg: { real: 12840, meta: 15000 },
    funnel: [
      { label: "Visitas", value: 18420 },
      { label: "Leads", value: 942 },
      { label: "MQL", value: 187 },
      { label: "SQL", value: 88 },
      { label: "Novos", value: 28 },
    ],
    origensNovos: [
      { label: "Google Ads", value: 12 }, { label: "Meta Ads", value: 8 },
      { label: "Orgânico", value: 5 }, { label: "Indicação", value: 3 },
    ],
    origensLeads: [
      { label: "Google Ads", value: 412 }, { label: "Meta Ads", value: 258 },
      { label: "Instagram", value: 138 }, { label: "Site orgânico", value: 92 }, { label: "Outros", value: 42 },
    ],
    faturado: 1_284_500,
    topNovos: [
      { name: "Cipriani Engenharia", value: 184_000 },
      { name: "Vertice Construtora", value: 142_500 },
      { name: "Solaron Franquias", value: 128_900 },
      { name: "JN Construções", value: 96_400 },
      { name: "Economy Solar", value: 82_100 },
    ],
    criativos: [
      { platform: "Meta", name: "Vídeo · Depoimento Cliente A", ctr: 4.8, cpa: 82, vendas: 6 },
      { platform: "Google", name: "Search · Kit Solar Residencial", ctr: 6.1, cpa: 128, vendas: 5 },
      { platform: "Meta", name: "Carrossel · Economia 90%", ctr: 3.9, cpa: 74, vendas: 4 },
      { platform: "Google", name: "PMax · Financiamento", ctr: 5.4, cpa: 155, vendas: 3 },
    ],
    site: { visitas: 18420, top: [
      { path: "/kit-residencial", views: 4820 },
      { path: "/simulador", views: 3910 },
      { path: "/", views: 3180 },
      { path: "/carregadores", views: 1240 },
    ], vendas: 8 },
    organico: {
      leadsPorRede: [
        { rede: "Instagram", leads: 82 }, { rede: "LinkedIn", leads: 34 },
        { rede: "TikTok", leads: 18 }, { rede: "YouTube", leads: 4 },
      ],
      topPosts: [
        { rede: "Instagram", titulo: "Antes/depois — usina 40kWp", eng: 4820 },
        { rede: "LinkedIn", titulo: "Estudo de caso · Vertice", eng: 1240 },
        { rede: "TikTok", titulo: "Como funciona a compensação", eng: 8210 },
      ],
    },
  },
  carregadores: {
    goalNovos: { real: 9, meta: 20 },
    goalMql: { real: 68, meta: 120 },
    goalSeg: { real: 4820, meta: 6000 },
    funnel: [
      { label: "Visitas", value: 6840 },
      { label: "Leads", value: 412 },
      { label: "MQL", value: 68 },
      { label: "SQL", value: 24 },
      { label: "Novos", value: 9 },
    ],
    origensNovos: [
      { label: "Google Ads", value: 4 }, { label: "Meta Ads", value: 2 },
      { label: "Orgânico", value: 2 }, { label: "Indicação", value: 1 },
    ],
    origensLeads: [
      { label: "Google Ads", value: 182 }, { label: "Meta Ads", value: 98 },
      { label: "Instagram", value: 62 }, { label: "Site orgânico", value: 48 }, { label: "Outros", value: 22 },
    ],
    faturado: 328_400,
    topNovos: [
      { name: "Frota Log SP", value: 84_200 },
      { name: "Condomínio Alphaville", value: 62_400 },
      { name: "Rede Auto Posto", value: 48_900 },
      { name: "Grupo Movida", value: 36_100 },
      { name: "EcoDrive", value: 21_800 },
    ],
    criativos: [
      { platform: "Google", name: "Search · Carregador Wallbox", ctr: 5.8, cpa: 210, vendas: 3 },
      { platform: "Meta", name: "Vídeo · Instalação frota", ctr: 4.1, cpa: 168, vendas: 2 },
      { platform: "Google", name: "PMax · Comercial", ctr: 4.9, cpa: 245, vendas: 2 },
      { platform: "Meta", name: "Carrossel · Modelos 11kW/22kW", ctr: 3.2, cpa: 142, vendas: 1 },
    ],
    site: { visitas: 6840, top: [
      { path: "/carregadores", views: 2410 },
      { path: "/wallbox", views: 1820 },
      { path: "/", views: 1240 },
      { path: "/orcamento", views: 640 },
    ], vendas: 3 },
    organico: {
      leadsPorRede: [
        { rede: "Instagram", leads: 38 }, { rede: "LinkedIn", leads: 22 },
        { rede: "YouTube", leads: 8 }, { rede: "TikTok", leads: 2 },
      ],
      topPosts: [
        { rede: "LinkedIn", titulo: "Guia · escolha do wallbox", eng: 1420 },
        { rede: "Instagram", titulo: "Reels · instalação em 4h", eng: 3120 },
        { rede: "YouTube", titulo: "Comparativo 7kW × 22kW", eng: 4820 },
      ],
    },
  },
};

const fmt = (n: number) => n.toLocaleString("pt-BR");
const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function MarketingHome() {
  const { marketingUnit } = useMarketingUnit();
  const d = DATA[marketingUnit];
  const accent = UNIT_ACCENT[marketingUnit];

  const funnelMax = d.funnel[0].value;
  const funnelWithRates = d.funnel.map((s, i, arr) => ({
    ...s,
    rate: i === 0 ? null : (s.value / arr[i - 1].value) * 100,
  }));

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              Marketing
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
              <span style={{ color: accent }}>{UNIT_LABEL[marketingUnit]}</span>
            </div>
            <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
              <Megaphone className="h-6 w-6" style={{ color: accent }} /> Home
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Resumo semanal — trocar entre 2P Solar e 2P Carregadores no topo.
            </p>
          </div>
        </div>

        {/* KPIs de meta */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <GoalCard label="Novos clientes (mês)" icon={Target} accent={accent} real={d.goalNovos.real} meta={d.goalNovos.meta} unit="" />
          <GoalCard label="Leads qualificados (MQL)" icon={Users} accent={accent} real={d.goalMql.real} meta={d.goalMql.meta} unit="" />
          <GoalCard label="Seguidores (rede social)" icon={TrendingUp} accent={accent} real={d.goalSeg.real} meta={d.goalSeg.meta} unit="" />
        </div>

        {/* Funil */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Funil</div>
              <h2 className="font-display font-semibold text-lg">Visitas → Novos</h2>
            </div>
            <div className="text-xs text-muted-foreground">Últimos 30 dias</div>
          </div>
          <div className="space-y-2">
            {funnelWithRates.map((s) => {
              const pct = (s.value / funnelMax) * 100;
              return (
                <div key={s.label} className="flex items-center gap-3">
                  <div className="w-24 text-xs text-muted-foreground uppercase tracking-wider shrink-0">{s.label}</div>
                  <div className="flex-1 h-8 bg-surface-2 rounded-md overflow-hidden relative">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}, ${accent}80)` }}
                    />
                    <div className="absolute inset-0 px-3 flex items-center justify-between text-xs font-semibold">
                      <span>{fmt(s.value)}</span>
                      {s.rate !== null && (
                        <span className="text-muted-foreground">
                          {s.rate.toFixed(1)}% conv.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Origens */}
        <div className="grid md:grid-cols-2 gap-4">
          <OriginBlock title="Origem dos novos clientes" data={d.origensNovos} accent={accent} suffix=" clientes" />
          <OriginBlock title="Origem dos leads" data={d.origensLeads} accent={accent} suffix=" leads" />
        </div>

        {/* Faturado + top novos */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="glass rounded-2xl p-5 md:col-span-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Faturado (novos clientes)</div>
            <div className="mt-3 font-display font-bold text-3xl">{fmtBRL(d.faturado)}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3 text-success" /> +18% vs mês anterior
            </div>
          </div>
          <div className="glass rounded-2xl p-5 md:col-span-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Top 5 novos por valor</div>
            <div className="space-y-1.5">
              {d.topNovos.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="tabular-nums font-semibold">{fmtBRL(c.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Criativos */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Tráfego pago</div>
              <h2 className="font-display font-semibold text-lg">Top criativos (Google + Meta)</h2>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="text-left py-2 pr-3">Plataforma</th>
                  <th className="text-left py-2 pr-3">Criativo</th>
                  <th className="text-right py-2 px-3">CTR</th>
                  <th className="text-right py-2 px-3">CPA</th>
                  <th className="text-right py-2 pl-3">Vendas</th>
                </tr>
              </thead>
              <tbody>
                {d.criativos.map((c) => (
                  <tr key={c.name} className="border-b border-border/40">
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        {c.platform === "Meta" ? <Facebook className="h-3 w-3" /> : <Search className="h-3 w-3" />}
                        {c.platform}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{c.name}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{c.ctr}%</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmtBRL(c.cpa)}</td>
                    <td className="py-2 pl-3 text-right tabular-nums font-semibold">{c.vendas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Site + Orgânico */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="glass rounded-2xl p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Globe className="h-3.5 w-3.5" /> Site
            </div>
            <h2 className="font-display font-semibold text-lg mt-1">Visitas & vendas</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-muted-foreground">Visitas</div>
                <div className="font-display font-bold text-2xl">{fmt(d.site.visitas)}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Vendas do site</div>
                <div className="font-display font-bold text-2xl">{d.site.vendas}</div>
              </div>
            </div>
            <div className="mt-4 text-[11px] uppercase tracking-wider text-muted-foreground">Páginas de entrada</div>
            <div className="mt-2 space-y-1">
              {d.site.top.map((p) => (
                <div key={p.path} className="flex justify-between text-sm">
                  <span className="text-muted-foreground truncate">{p.path}</span>
                  <span className="tabular-nums">{fmt(p.views)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="glass rounded-2xl p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Instagram className="h-3.5 w-3.5" /> Orgânico
            </div>
            <h2 className="font-display font-semibold text-lg mt-1">Leads por rede social</h2>
            <div className="mt-3 space-y-1.5">
              {d.organico.leadsPorRede.map((r) => (
                <div key={r.rede} className="flex justify-between text-sm">
                  <span>{r.rede}</span>
                  <span className="tabular-nums font-semibold">{r.leads}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 text-[11px] uppercase tracking-wider text-muted-foreground">Melhores posts</div>
            <div className="mt-2 space-y-1">
              {d.organico.topPosts.map((p) => (
                <div key={p.titulo} className="flex justify-between text-sm">
                  <span className="text-muted-foreground truncate">{p.rede} · {p.titulo}</span>
                  <span className="tabular-nums">{fmt(p.eng)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <AtlasSoonCard />
      </div>
    </AppLayout>
  );
}

function GoalCard({ label, icon: Icon, real, meta, accent, unit }: { label: string; icon: typeof Target; real: number; meta: number; accent: string; unit: string }) {
  const pct = meta > 0 ? (real / meta) * 100 : 0;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4" style={{ color: accent }} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="font-display font-bold text-3xl tabular-nums">{fmt(real)}{unit}</div>
        <div className="text-sm text-muted-foreground">/ {fmt(meta)}{unit}</div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-surface-2 overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${clamped}%`, background: accent }} />
      </div>
      <div className="mt-2 text-xs font-semibold" style={{ color: accent }}>
        {pct.toFixed(1)}%
      </div>
    </div>
  );
}

function OriginBlock({ title, data, accent, suffix }: { title: string; data: { label: string; value: number }[]; accent: string; suffix: string }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="glass rounded-2xl p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{title}</div>
      <div className="space-y-2">
        {data.map((o) => {
          const pct = total > 0 ? (o.value / total) * 100 : 0;
          return (
            <div key={o.label}>
              <div className="flex justify-between text-sm">
                <span>{o.label}</span>
                <span className="tabular-nums text-muted-foreground">{fmt(o.value)}{suffix} · {pct.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden mt-1">
                <div className="h-full" style={{ width: `${pct}%`, background: accent }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AtlasSoonCard() {
  return (
    <div className="relative glass rounded-2xl p-5 overflow-hidden">
      <div aria-hidden className="absolute inset-0 blur-sm pointer-events-none select-none opacity-50 p-5">
        <div className="text-xs uppercase tracking-wider text-primary">Insights do Atlas</div>
        <div className="mt-2 space-y-1 text-sm">
          <div>• Aumentar 15% do budget em criativos com CPA &lt; R$ 150</div>
          <div>• Retomar 3 leads MQL sem resposta há mais de 7 dias</div>
          <div>• Publicar case do cliente Vertice — historicamente melhor CTR</div>
        </div>
      </div>
      <div className="relative flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-[oklch(0.65_0.2_30)] flex items-center justify-center">
          <Clock className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-primary font-semibold">Em breve</div>
          <div className="font-medium">Insights automáticos do Atlas para Marketing</div>
        </div>
      </div>
    </div>
  );
}
