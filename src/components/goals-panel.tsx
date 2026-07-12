import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Target, Repeat, Sparkles, Loader2, Wallet, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSalesforceVendas,
  getSalesforceSalesByAccount,
} from "@/lib/salesforce.functions";
import {
  listFaturamentoGoalsForOwners,
  listNewAbGoals,
  listRetentionGoals,
} from "@/lib/goals.functions";
import {
  getCommissionSettings,
  calcVendidoCommission,
  calcNovosCommission,
  calcRetencaoCommission,
  type Equipe,
} from "@/lib/commission.functions";
import { CARTEIRA_OWNER_IDS } from "@/lib/salespeople";

const AB_THRESHOLD = 15_000;
const A_THRESHOLD = 30_000;

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function fmtKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function currentQuarterInfo(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const qStart = Math.floor(m / 3) * 3;
  const quarter = Math.floor(m / 3) + 1;
  const months: [number, number, number] = [qStart + 1, qStart + 2, qStart + 3];
  const curStart = new Date(y, qStart, 1);
  const curEnd = new Date(y, qStart + 3, 0);
  const prevStart = new Date(y, qStart - 3, 1);
  const prevEnd = new Date(y, qStart, 0);
  return {
    year: y,
    quarter,
    months,
    curStart: fmtKey(curStart),
    curEnd: fmtKey(curEnd),
    prevStart: fmtKey(prevStart),
    prevEnd: fmtKey(prevEnd),
    label: `Q${quarter} ${y}`,
  };
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function progressColor(pct: number) {
  if (pct >= 100) return "bg-success";
  if (pct >= 70) return "bg-warning";
  return "bg-destructive";
}

function progressTextColor(pct: number) {
  if (pct >= 100) return "text-success";
  if (pct >= 70) return "text-warning";
  return "text-destructive";
}

type GoalCardProps = {
  label: string;
  Icon: typeof Target;
  realized: string;
  goal: string;
  pct: number | null;
  hint?: string;
  loading?: boolean;
};

function GoalCard({ label, Icon, realized, goal, pct, hint, loading }: GoalCardProps) {
  const pctVal = pct ?? 0;
  const clamped = Math.max(0, Math.min(100, pctVal));
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="font-display font-bold text-3xl">{loading ? "…" : realized}</div>
        <div className="text-sm text-muted-foreground">/ {loading ? "…" : goal}</div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-surface-2 overflow-hidden">
        <div
          className={cn("h-full transition-all", progressColor(pctVal))}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={cn("font-semibold", pct === null ? "text-muted-foreground" : progressTextColor(pctVal))}>
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin inline" />
          ) : pct === null ? (
            "sem meta definida"
          ) : (
            `${pctVal.toFixed(1)}%`
          )}
        </span>
        {hint ? <span className="text-muted-foreground">{hint}</span> : null}
      </div>
    </div>
  );
}

export function GoalsPanel({ ownerId }: { ownerId: string }) {
  const info = useMemo(currentQuarterInfo, []);
  const owners = ownerId === "all" ? [...CARTEIRA_OWNER_IDS] : [ownerId];

  const fetchVendas = useServerFn(getSalesforceVendas);
  const fetchSalesByAccount = useServerFn(getSalesforceSalesByAccount);
  const fetchFaturamentoGoals = useServerFn(listFaturamentoGoalsForOwners);
  const fetchNewAbGoals = useServerFn(listNewAbGoals);
  const fetchRetentionGoals = useServerFn(listRetentionGoals);

  // Vendas do trimestre atual (para faturamento por owner e Novos A+B por accountId+owner)
  const curVendasQ = useQuery({
    queryKey: ["goals-cur-vendas", info.curStart, info.curEnd],
    queryFn: () => fetchVendas({ data: { start: info.curStart, end: info.curEnd } }),
    staleTime: 60_000,
  });

  // Vendas trimestre anterior — para calcular base A/B por owner (retenção + novos A+B)
  const prevVendasQ = useQuery({
    queryKey: ["goals-prev-vendas", info.prevStart, info.prevEnd],
    queryFn: () => fetchVendas({ data: { start: info.prevStart, end: info.prevEnd } }),
    staleTime: 60_000,
  });

  // Metas de faturamento (todas as 3 mensalidades ativas do trimestre para os owners)
  const goalsQ = useQuery({
    queryKey: ["goals-faturamento", info.year, info.months.join(","), owners.join(",")],
    queryFn: () =>
      fetchFaturamentoGoals({
        data: { year: info.year, months: [...info.months], sfUserIds: owners },
      }),
    staleTime: 60_000,
  });

  // Meta trimestral de Novos A+B
  const newAbGoalsQ = useQuery({
    queryKey: ["goals-newab", info.year, info.quarter, owners.join(",")],
    queryFn: () =>
      fetchNewAbGoals({
        data: { year: info.year, quarter: info.quarter, sfUserIds: owners },
      }),
    staleTime: 60_000,
  });

  const retentionGoalsQ = useQuery({
    queryKey: ["goals-retention", info.year, info.quarter, owners.join(",")],
    queryFn: () =>
      fetchRetentionGoals({
        data: { year: info.year, quarter: info.quarter, sfUserIds: owners },
      }),
    staleTime: 60_000,
  });

  const fetchCommission = useServerFn(getCommissionSettings);
  const commissionQ = useQuery({
    queryKey: ["commission-settings"],
    queryFn: () => fetchCommission(),
    staleTime: 60_000,
  });

  const loading =
    curVendasQ.isLoading || prevVendasQ.isLoading || goalsQ.isLoading || newAbGoalsQ.isLoading || retentionGoalsQ.isLoading;

  const ownerSet = useMemo(() => new Set(owners), [owners.join(",")]);

  // ---- Faturamento agregado ---- //
  const faturamentoReal = useMemo(() => {
    let total = 0;
    for (const r of curVendasQ.data?.records ?? []) {
      if (!r.ownerId || !ownerSet.has(r.ownerId)) continue;
      if (r.tipoNf === "Bonificação") continue;
      total += r.total ?? r.amount ?? 0;
    }
    return total;
  }, [curVendasQ.data, ownerSet]);

  const faturamentoMeta = useMemo(() => {
    let total = 0;
    for (const g of goalsQ.data?.records ?? []) {
      if (!g.active) continue;
      total += g.monthly_goal;
    }
    return total;
  }, [goalsQ.data]);

  // ---- Retenção e Novos A/B (agregados + por owner p/ comissão) ---- //
  const abKpis = useMemo(() => {
    const curByAcc = new Map<string, { total: number; owner: string | null }>();
    for (const r of curVendasQ.data?.records ?? []) {
      if (!r.accountId) continue;
      if (r.tipoNf === "Bonificação") continue;
      const v = r.total ?? r.amount ?? 0;
      const entry = curByAcc.get(r.accountId) ?? { total: 0, owner: r.ownerId ?? null };
      entry.total += v;
      if (!entry.owner) entry.owner = r.ownerId ?? null;
      curByAcc.set(r.accountId, entry);
    }
    const prevByAcc = new Map<string, { total: number; owner: string | null }>();
    for (const r of prevVendasQ.data?.records ?? []) {
      if (!r.accountId) continue;
      if (r.tipoNf === "Bonificação") continue;
      const v = r.total ?? r.amount ?? 0;
      const entry = prevByAcc.get(r.accountId) ?? { total: 0, owner: r.ownerId ?? null };
      entry.total += v;
      if (!entry.owner) entry.owner = r.ownerId ?? null;
      prevByAcc.set(r.accountId, entry);
    }
    const prevAB = new Map<string, string | null>();
    for (const [id, v] of prevByAcc) if (v.total >= AB_THRESHOLD) prevAB.set(id, v.owner);

    const isOwner = (o: string | null | undefined) => !!o && ownerSet.has(o);

    let retencaoBase = 0;
    let retencaoAtivos = 0;
    const retencaoBaseByOwner: Record<string, number> = {};
    const retencaoAtivosByOwner: Record<string, number> = {};
    for (const [id, owner] of prevAB) {
      if (!isOwner(owner)) continue;
      retencaoBase++;
      const o = owner as string;
      retencaoBaseByOwner[o] = (retencaoBaseByOwner[o] ?? 0) + 1;
      const cur = curByAcc.get(id);
      if (cur && cur.total >= AB_THRESHOLD) {
        retencaoAtivos++;
        retencaoAtivosByOwner[o] = (retencaoAtivosByOwner[o] ?? 0) + 1;
      }
    }
    const retencaoMetaFallback = Math.round(retencaoBase * 0.9);

    // Novos A/B por owner (nunca foi A/B no tri anterior; agora ≥15k)
    const novosAperOwner: Record<string, number> = {};
    const novosBperOwner: Record<string, number> = {};
    let novosA = 0;
    let novosB = 0;
    for (const [id, cur] of curByAcc) {
      if (cur.total < AB_THRESHOLD) continue;
      if (prevAB.has(id)) continue; // já era A/B
      if (!isOwner(cur.owner)) continue;
      const owner = cur.owner as string;
      if (cur.total > A_THRESHOLD) {
        novosA++;
        novosAperOwner[owner] = (novosAperOwner[owner] ?? 0) + 1;
      } else {
        novosB++;
        novosBperOwner[owner] = (novosBperOwner[owner] ?? 0) + 1;
      }
    }
    return {
      retencaoBase,
      retencaoAtivos,
      retencaoMetaFallback,
      retencaoBaseByOwner,
      retencaoAtivosByOwner,
      novosAB: novosA + novosB,
      novosA,
      novosB,
      novosAperOwner,
      novosBperOwner,
    };
  }, [curVendasQ.data, prevVendasQ.data, ownerSet]);

  const novosAbMeta = useMemo(() => {
    let total = 0;
    for (const g of newAbGoalsQ.data?.records ?? []) total += g.goal;
    return total;
  }, [newAbGoalsQ.data]);

  const retencaoMeta = useMemo(() => {
    const configured = (retentionGoalsQ.data?.records ?? []).reduce((a, r) => a + r.goal, 0);
    return configured > 0 ? configured : abKpis.retencaoMetaFallback;
  }, [retentionGoalsQ.data, abKpis.retencaoMetaFallback]);

  // ---- Comissões por owner (usa equipe do commission settings) ---- //
  const comissao = useMemo(() => {
    const cfg = commissionQ.data;
    if (!cfg) return { vendido: 0, novos: 0 };

    // vendido por owner
    const vendidoByOwner: Record<string, number> = {};
    for (const r of curVendasQ.data?.records ?? []) {
      if (!r.ownerId || !ownerSet.has(r.ownerId)) continue;
      if (r.tipoNf === "Bonificação") continue;
      vendidoByOwner[r.ownerId] = (vendidoByOwner[r.ownerId] ?? 0) + (r.total ?? r.amount ?? 0);
    }
    // meta por owner (soma dos meses ativos do trimestre)
    const metaByOwner: Record<string, number> = {};
    for (const g of goalsQ.data?.records ?? []) {
      if (!g.active) continue;
      metaByOwner[g.sf_user_id] = (metaByOwner[g.sf_user_id] ?? 0) + g.monthly_goal;
    }

    let totalVendido = 0;
    let totalNovos = 0;
    for (const owner of owners) {
      const equipe: Equipe = (cfg.equipe?.[owner] ?? "carteira") as Equipe;
      totalVendido += calcVendidoCommission(
        vendidoByOwner[owner] ?? 0,
        metaByOwner[owner] ?? 0,
        equipe,
        cfg.vendido,
      );
      totalNovos += calcNovosCommission(
        abKpis.novosAperOwner[owner] ?? 0,
        abKpis.novosBperOwner[owner] ?? 0,
        equipe,
        cfg.novos,
      );
    }
    return { vendido: totalVendido, novos: totalNovos };
  }, [commissionQ.data, curVendasQ.data, goalsQ.data, ownerSet, owners.join(","), abKpis]);

  const pct = (real: number, meta: number) => (meta > 0 ? (real / meta) * 100 : null);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display font-semibold text-lg">Metas · {info.label}</h2>
          <p className="text-xs text-muted-foreground">
            Faturamento, Retenção, Novos A+B e comissões do trimestre atual.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <GoalCard
          label="VENDIDO"
          Icon={Target}
          realized={fmtBRL(faturamentoReal)}
          goal={fmtBRL(faturamentoMeta)}
          pct={pct(faturamentoReal, faturamentoMeta)}
          hint={faturamentoMeta === 0 ? "sem meta ativa" : undefined}
          loading={loading}
        />
        <GoalCard
          label="Retenção A/B"
          Icon={Repeat}
          realized={String(abKpis.retencaoAtivos)}
          goal={String(retencaoMeta)}
          pct={pct(abKpis.retencaoAtivos, retencaoMeta)}
          hint={`base A/B tri ant.: ${abKpis.retencaoBase}`}
          loading={loading}
        />
        <GoalCard
          label="Novos A+B"
          Icon={Sparkles}
          realized={String(abKpis.novosAB)}
          goal={String(novosAbMeta)}
          pct={pct(abKpis.novosAB, novosAbMeta)}
          hint={
            novosAbMeta === 0
              ? "defina meta em /admin/metas"
              : `A: ${abKpis.novosA} · B: ${abKpis.novosB}`
          }
          loading={loading}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <CommissionCard
          label="Comissão · Vendido"
          Icon={Wallet}
          value={fmtBRL(comissao.vendido)}
          hint={
            faturamentoMeta === 0
              ? "sem meta ativa"
              : `atingimento: ${pct(faturamentoReal, faturamentoMeta)?.toFixed(1) ?? "0"}%`
          }
          loading={loading || commissionQ.isLoading}
        />
        <CommissionCard
          label="Comissão · Novos A/B"
          Icon={Gift}
          value={fmtBRL(comissao.novos)}
          hint={`A: ${abKpis.novosA} · B: ${abKpis.novosB}`}
          loading={loading || commissionQ.isLoading}
        />
      </div>
    </div>
  );
}


function CommissionCard({
  label,
  Icon,
  value,
  hint,
  loading,
}: {
  label: string;
  Icon: typeof Target;
  value: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-3 font-display font-bold text-3xl tabular-nums">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : value}
      </div>
      {hint ? <div className="mt-2 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
