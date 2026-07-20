import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import {
  ClipboardList,
  Target,
  DollarSign,
  TrendingUp,
  Filter as FilterIcon,
  Tag,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Bell,
  Users,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/marketing/pre-vendas")({
  head: () => ({
    meta: [
      { title: "Pré-Vendas — Portal 2P" },
      { name: "description", content: "Painel do Gerente de Pré-Vendas: funil, saúde comercial, tarefas, motivos de perda e alertas." },
    ],
  }),
  component: PreVendasHome,
});

const fmt = (n: number) => n.toLocaleString("pt-BR");
const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// ============ MOCK DATA (baseado nos prints) ============

const kpis = [
  { label: "Meta do mês", value: 3_500_000, sub: "100% da meta", icon: Target, accent: "oklch(0.68 0.2 47)", isMoney: true },
  { label: "Vendido", value: 2_180_000, sub: "62% da meta", icon: DollarSign, accent: "oklch(0.7 0.16 145)", isMoney: true },
  { label: "Projeção final", value: 3_820_000, sub: "109% da meta", icon: TrendingUp, accent: "oklch(0.6 0.18 240)", isMoney: true },
  { label: "Conversão geral", value: 28, sub: "Média do mês", icon: FilterIcon, accent: "oklch(0.55 0.22 290)", isPct: true },
  { label: "Ticket médio", value: 47_500, sub: "Média do mês", icon: Tag, accent: "oklch(0.75 0.15 80)", isMoney: true },
];

const funil = [
  { etapa: "Leads Recebidos", qtd: 560, pct: 100, cor: "oklch(0.32 0.09 260)" },
  { etapa: "Leads Qualificados", qtd: 420, pct: 75, cor: "oklch(0.6 0.18 240)" },
  { etapa: "Propostas Enviadas", qtd: 180, pct: 32, cor: "oklch(0.7 0.16 145)" },
  { etapa: "Negociações", qtd: 70, pct: 12, cor: "oklch(0.75 0.15 80)" },
  { etapa: "Fechados", qtd: 42, pct: 7, cor: "oklch(0.68 0.2 47)" },
];

const saude = { score: 87, label: "Muito Bom", detalhes: [
  { item: "Velocidade de resposta a leads", valor: "94%", status: "ok" },
  { item: "Cobertura de tarefas", valor: "88%", status: "ok" },
  { item: "Follow-ups em atraso", valor: "12", status: "warn" },
  { item: "Propostas sem retorno >7d", valor: "18", status: "risk" },
  { item: "Taxa de conversão", valor: "28%", status: "ok" },
] };

const tarefas = { total: 48, concluidas: 32, pendentes: 12, atrasadas: 4 };

const motivosPerda = [
  { motivo: "Preço", pct: 31, cor: "oklch(0.32 0.09 260)" },
  { motivo: "Sem retorno", pct: 24, cor: "oklch(0.6 0.18 240)" },
  { motivo: "Concorrência", pct: 18, cor: "oklch(0.7 0.16 145)" },
  { motivo: "Projeto cancelado", pct: 12, cor: "oklch(0.75 0.15 80)" },
  { motivo: "Sem orçamento", pct: 8, cor: "oklch(0.68 0.2 47)" },
  { motivo: "Outros", pct: 7, cor: "oklch(0.65 0.05 280)" },
];

const alertas = [
  { tipo: "risk", msg: "João possui 8 oportunidades sem interação há mais de 3 dias.", quando: "5 min atrás" },
  { tipo: "warn", msg: "Carlos está com 5 tarefas atrasadas.", quando: "12 min atrás" },
  { tipo: "ok", msg: "Pedro já atingiu 92% da meta.", quando: "25 min atrás" },
  { tipo: "risk", msg: "Existem 18 propostas enviadas há mais de 7 dias sem retorno.", quando: "32 min atrás" },
  { tipo: "warn", msg: "12 oportunidades estão sem próxima tarefa cadastrada.", quando: "45 min atrás" },
  { tipo: "risk", msg: "Existem clientes sem nenhuma interação registrada.", quando: "1 h atrás" },
];

const vendedores = [
  { nome: "Pedro Alves",    leads: 88, qualif: 71, prop: 34, fech: 12, meta: 92, ticket: 52_300 },
  { nome: "João Ribeiro",   leads: 74, qualif: 55, prop: 24, fech: 8,  meta: 71, ticket: 48_900 },
  { nome: "Carlos Souza",   leads: 69, qualif: 48, prop: 19, fech: 6,  meta: 58, ticket: 41_200 },
  { nome: "Marina Duarte",  leads: 92, qualif: 78, prop: 41, fech: 11, meta: 84, ticket: 49_800 },
  { nome: "Ana Torres",     leads: 61, qualif: 44, prop: 21, fech: 5,  meta: 47, ticket: 39_500 },
];

const origens = [
  { origem: "Meta Ads",       leads: 180, qualif: 132, conv: 22, cac: 187 },
  { origem: "Google Ads",     leads: 140, qualif: 108, conv: 19, cac: 214 },
  { origem: "Indicação",      leads:  95, qualif:  86, conv: 41, cac:  32 },
  { origem: "Orgânico",       leads:  78, qualif:  55, conv: 15, cac:   0 },
  { origem: "Eventos",        leads:  40, qualif:  28, conv: 12, cac: 410 },
  { origem: "Outbound",       leads:  27, qualif:  11, conv:  4, cac: 520 },
];

// ============ COMPONENT ============

function PreVendasHome() {
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
              Visão consolidada de marketing e vendas — funil, saúde comercial, produtividade e alertas do time.
            </p>
          </div>
          <div className="text-[11px] text-muted-foreground bg-surface-2 border border-border rounded-lg px-3 py-1.5">
            Dados demonstrativos · atualizado agora
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map((k) => {
            const Icon = k.icon;
            const val = k.isMoney ? fmtBRL(k.value) : k.isPct ? `${k.value}%` : fmt(k.value);
            return (
              <div key={k.label} className="glass rounded-xl p-4 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k.label}</div>
                  <Icon className="h-4 w-4" style={{ color: k.accent }} />
                </div>
                <div className="font-display font-bold text-2xl tabular-nums mt-1" style={{ color: k.accent }}>
                  {val}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</div>
              </div>
            );
          })}
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Funil */}
          <div className="glass rounded-2xl overflow-hidden lg:col-span-2">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-semibold flex items-center gap-2">
                <FilterIcon className="h-4 w-4 text-primary" /> Funil Comercial
              </h2>
              <span className="text-[11px] text-muted-foreground">Este mês</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="text-left px-5 py-2.5">Etapa</th>
                  <th className="text-right px-5 py-2.5">Qtd</th>
                  <th className="text-right px-5 py-2.5 w-40">% do topo</th>
                  <th className="text-left px-5 py-2.5 w-[38%]">Distribuição</th>
                </tr>
              </thead>
              <tbody>
                {funil.map((f, i) => (
                  <tr key={f.etapa} className="border-b border-border/40 hover:bg-surface-2/50">
                    <td className="px-5 py-3 font-medium flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: f.cor }} />
                      {f.etapa}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold">{fmt(f.qtd)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{f.pct}%</td>
                    <td className="px-5 py-3">
                      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${f.pct}%`, background: f.cor }} />
                      </div>
                      {i < funil.length - 1 && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          → {Math.round((funil[i + 1].qtd / f.qtd) * 100)}% avançam para {funil[i + 1].etapa}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Saúde Comercial */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Saúde Comercial
              </h2>
              <span className="text-[11px] text-muted-foreground">/100</span>
            </div>
            <div className="p-5 flex items-center gap-4">
              <ScoreRing score={saude.score} />
              <div>
                <div className="text-lg font-display font-semibold text-[oklch(0.7_0.16_145)] flex items-center gap-1.5">
                  {saude.label} <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Sua operação está saudável. Mantenha o ritmo!
                </div>
              </div>
            </div>
            <table className="w-full text-sm border-t border-border">
              <tbody>
                {saude.detalhes.map((d) => (
                  <tr key={d.item} className="border-b border-border/40 last:border-0">
                    <td className="px-5 py-2 text-muted-foreground">{d.item}</td>
                    <td className="px-5 py-2 text-right">
                      <span className={cn(
                        "tabular-nums font-semibold px-2 py-0.5 rounded-md text-[11px]",
                        d.status === "ok" && "bg-[oklch(0.7_0.16_145)]/15 text-[oklch(0.55_0.16_145)]",
                        d.status === "warn" && "bg-[oklch(0.75_0.15_80)]/20 text-[oklch(0.55_0.17_60)]",
                        d.status === "risk" && "bg-destructive/15 text-destructive",
                      )}>
                        {d.valor}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Tarefas */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" /> Tarefas
              </h2>
              <span className="text-[11px] text-muted-foreground">Hoje</span>
            </div>
            <table className="w-full text-sm">
              <tbody>
                <TarefaRow icon={ClipboardList} color="oklch(0.6 0.18 240)" label="Total" value={tarefas.total} />
                <TarefaRow icon={CheckCircle2} color="oklch(0.7 0.16 145)" label="Concluídas" value={tarefas.concluidas} />
                <TarefaRow icon={Clock} color="oklch(0.68 0.2 47)" label="Pendentes" value={tarefas.pendentes} />
                <TarefaRow icon={AlertTriangle} color="oklch(0.6 0.24 25)" label="Atrasadas" value={tarefas.atrasadas} highlight />
              </tbody>
            </table>
          </div>

          {/* Motivos de Perda */}
          <div className="glass rounded-2xl overflow-hidden lg:col-span-2">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-semibold">Motivos de Perda</h2>
              <span className="text-[11px] text-muted-foreground">Este mês</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="text-left px-5 py-2.5">Motivo</th>
                  <th className="text-right px-5 py-2.5 w-24">%</th>
                  <th className="text-left px-5 py-2.5 w-[55%]">Peso</th>
                </tr>
              </thead>
              <tbody>
                {motivosPerda.map((m) => (
                  <tr key={m.motivo} className="border-b border-border/40 last:border-0 hover:bg-surface-2/50">
                    <td className="px-5 py-2.5 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: m.cor }} />
                      {m.motivo}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold">{m.pct}%</td>
                    <td className="px-5 py-2.5">
                      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(m.pct / 31) * 100}%`, background: m.cor }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ranking vendedores */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-display font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Produtividade por Vendedor
            </h2>
            <span className="text-[11px] text-muted-foreground">Mês corrente</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="text-left px-5 py-2.5">Vendedor</th>
                  <th className="text-right px-4 py-2.5">Leads</th>
                  <th className="text-right px-4 py-2.5">Qualif.</th>
                  <th className="text-right px-4 py-2.5">Propostas</th>
                  <th className="text-right px-4 py-2.5">Fechados</th>
                  <th className="text-right px-4 py-2.5">Ticket médio</th>
                  <th className="text-right px-5 py-2.5 w-56">% da meta</th>
                </tr>
              </thead>
              <tbody>
                {vendedores.map((v) => (
                  <tr key={v.nome} className="border-b border-border/40 last:border-0 hover:bg-surface-2/50">
                    <td className="px-5 py-2.5 font-medium">{v.nome}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(v.leads)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(v.qualif)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(v.prop)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmt(v.fech)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmtBRL(v.ticket)}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(v.meta, 100)}%`,
                              background: v.meta >= 90
                                ? "oklch(0.7 0.16 145)"
                                : v.meta >= 70
                                ? "oklch(0.75 0.15 80)"
                                : "oklch(0.68 0.2 47)",
                            }}
                          />
                        </div>
                        <span className="tabular-nums font-semibold text-xs w-10 text-right">{v.meta}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Origens */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-display font-semibold">Performance por Origem</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="text-left px-5 py-2.5">Origem</th>
                  <th className="text-right px-4 py-2.5">Leads</th>
                  <th className="text-right px-4 py-2.5">Qualificados</th>
                  <th className="text-right px-4 py-2.5">Conv. %</th>
                  <th className="text-right px-5 py-2.5">CAC</th>
                </tr>
              </thead>
              <tbody>
                {origens.map((o) => (
                  <tr key={o.origem} className="border-b border-border/40 last:border-0 hover:bg-surface-2/50">
                    <td className="px-5 py-2.5 font-medium">{o.origem}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(o.leads)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(o.qualif)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{o.conv}%</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                      {o.cac === 0 ? "—" : fmtBRL(o.cac)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alertas Inteligentes */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-display font-semibold flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" /> Alertas Inteligentes
            </h2>
            <button className="text-[11px] text-primary hover:underline">Ver todos</button>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {alertas.map((a, i) => (
                <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-surface-2/50">
                  <td className="px-5 py-3 w-10">
                    <span className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center",
                      a.tipo === "risk" && "bg-destructive/15 text-destructive",
                      a.tipo === "warn" && "bg-[oklch(0.75_0.15_80)]/20 text-[oklch(0.55_0.17_60)]",
                      a.tipo === "ok" && "bg-[oklch(0.7_0.16_145)]/15 text-[oklch(0.55_0.16_145)]",
                    )}>
                      {a.tipo === "risk" ? <AlertTriangle className="h-3.5 w-3.5" />
                        : a.tipo === "warn" ? <Clock className="h-3.5 w-3.5" />
                        : <CheckCircle2 className="h-3.5 w-3.5" />}
                    </span>
                  </td>
                  <td className="px-2 py-3">{a.msg}</td>
                  <td className="px-5 py-3 text-right text-[11px] text-muted-foreground whitespace-nowrap">{a.quando}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}

function TarefaRow({
  icon: Icon, color, label, value, highlight,
}: { icon: typeof ClipboardList; color: string; label: string; value: number; highlight?: boolean }) {
  return (
    <tr className="border-b border-border/40 last:border-0">
      <td className="px-5 py-3 w-12">
        <span
          className="h-8 w-8 rounded-full flex items-center justify-center"
          style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </td>
      <td className="py-3 text-muted-foreground">{label}</td>
      <td className="px-5 py-3 text-right">
        <span className={cn("tabular-nums font-display font-bold text-2xl", highlight && "text-destructive")}
          style={!highlight ? { color } : undefined}>
          {fmt(value)}
        </span>
      </td>
    </tr>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} stroke="currentColor" className="text-surface-2" strokeWidth="7" fill="none" />
        <circle
          cx="40" cy="40" r={r}
          stroke="oklch(0.7 0.16 145)"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={off}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display font-bold text-2xl tabular-nums leading-none">{score}</div>
        <div className="text-[10px] text-muted-foreground">/100</div>
      </div>
    </div>
  );
}
