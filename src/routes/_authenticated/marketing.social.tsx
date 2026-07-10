import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useMarketingUnit } from "@/components/instance-provider";
import { Users, Instagram, Linkedin, Youtube } from "lucide-react";
import { AtlasSoonCard } from "./marketing.index";

export const Route = createFileRoute("/_authenticated/marketing/social")({
  head: () => ({ meta: [{ title: "Social Media — Marketing — Portal 2P" }] }),
  component: SocialPage,
});

const DATA = {
  solar: {
    seguidoresTotal: { real: 12840, meta: 15000 },
    mqlTotal: { real: 187, meta: 250 },
    redes: [
      { nome: "Instagram", icon: Instagram, seguidores: 8420, meta: 10000, novos30d: 420, mql: 82, cor: "oklch(0.65 0.2 350)" },
      { nome: "LinkedIn", icon: Linkedin, seguidores: 2840, meta: 3500, novos30d: 180, mql: 68, cor: "oklch(0.5 0.15 250)" },
      { nome: "YouTube", icon: Youtube, seguidores: 1180, meta: 1200, novos30d: 62, mql: 22, cor: "oklch(0.55 0.22 25)" },
      { nome: "TikTok", icon: Users, seguidores: 400, meta: 300, novos30d: 32, mql: 15, cor: "oklch(0.4 0.05 250)" },
    ],
    posts: [
      { rede: "Instagram", titulo: "Antes/depois — usina 40kWp", eng: 4820, leads: 22 },
      { rede: "TikTok", titulo: "Como funciona a compensação", eng: 8210, leads: 12 },
      { rede: "LinkedIn", titulo: "Estudo de caso · Vertice", eng: 1240, leads: 32 },
    ],
  },
  carregadores: {
    seguidoresTotal: { real: 4820, meta: 6000 },
    mqlTotal: { real: 68, meta: 120 },
    redes: [
      { nome: "Instagram", icon: Instagram, seguidores: 2840, meta: 3500, novos30d: 180, mql: 32, cor: "oklch(0.65 0.2 350)" },
      { nome: "LinkedIn", icon: Linkedin, seguidores: 1420, meta: 1800, novos30d: 82, mql: 24, cor: "oklch(0.5 0.15 250)" },
      { nome: "YouTube", icon: Youtube, seguidores: 480, meta: 600, novos30d: 22, mql: 10, cor: "oklch(0.55 0.22 25)" },
      { nome: "TikTok", icon: Users, seguidores: 80, meta: 100, novos30d: 6, mql: 2, cor: "oklch(0.4 0.05 250)" },
    ],
    posts: [
      { rede: "YouTube", titulo: "Comparativo 7kW × 22kW", eng: 4820, leads: 18 },
      { rede: "Instagram", titulo: "Reels · instalação em 4h", eng: 3120, leads: 12 },
      { rede: "LinkedIn", titulo: "Guia · escolha do wallbox", eng: 1420, leads: 22 },
    ],
  },
};

const fmt = (n: number) => n.toLocaleString("pt-BR");
const UNIT_LABEL = { solar: "2P Solar", carregadores: "2P Carregadores" } as const;

function SocialPage() {
  const { marketingUnit } = useMarketingUnit();
  const d = DATA[marketingUnit];
  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Marketing · {UNIT_LABEL[marketingUnit]}</div>
          <h1 className="text-3xl font-bold mt-1">Social Media</h1>
          <p className="text-sm text-muted-foreground mt-1">Metas por rede, seguidores e leads qualificados.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <BigGoal label="Seguidores (total)" real={d.seguidoresTotal.real} meta={d.seguidoresTotal.meta} />
          <BigGoal label="Leads qualificados (MQL)" real={d.mqlTotal.real} meta={d.mqlTotal.meta} />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {d.redes.map((r) => {
            const pct = r.meta > 0 ? Math.min(100, (r.seguidores / r.meta) * 100) : 0;
            return (
              <div key={r.nome} className="glass rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <r.icon className="h-4 w-4" style={{ color: r.cor }} />
                    <span className="font-semibold">{r.nome}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{pct.toFixed(0)}% da meta</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <Stat label="Seguidores" value={fmt(r.seguidores)} />
                  <Stat label="Novos 30d" value={`+${fmt(r.novos30d)}`} />
                  <Stat label="MQL" value={fmt(r.mql)} />
                </div>
                <div className="mt-3 h-2 rounded-full bg-surface-2 overflow-hidden">
                  <div className="h-full" style={{ width: `${pct}%`, background: r.cor }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Posts recentes de destaque</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="text-left py-2 pr-3">Rede</th>
                <th className="text-left py-2 pr-3">Título</th>
                <th className="text-right py-2 px-3">Engajamento</th>
                <th className="text-right py-2 pl-3">Leads</th>
              </tr>
            </thead>
            <tbody>
              {d.posts.map((p) => (
                <tr key={p.titulo} className="border-b border-border/40">
                  <td className="py-2 pr-3">{p.rede}</td>
                  <td className="py-2 pr-3">{p.titulo}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(p.eng)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums font-semibold">{p.leads}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <AtlasSoonCard />
      </div>
    </AppLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-lg tabular-nums">{value}</div>
    </div>
  );
}

function BigGoal({ label, real, meta }: { label: string; real: number; meta: number }) {
  const pct = meta > 0 ? (real / meta) * 100 : 0;
  return (
    <div className="glass rounded-2xl p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="font-display font-bold text-3xl">{fmt(real)}</div>
        <div className="text-sm text-muted-foreground">/ {fmt(meta)}</div>
      </div>
      <div className="mt-2 h-2 bg-surface-2 rounded-full overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="mt-1 text-xs font-semibold text-primary">{pct.toFixed(1)}%</div>
    </div>
  );
}
