import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { ModerationAuditLog } from "@/components/moderation-audit-log";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertTriangle, Target, Check, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";
import {
  listSalespersonGoals,
  setSalespersonGoal,
  setQuarterGoalActive,
  type SalespersonMonthlyGoals,
} from "@/lib/admin.functions";
import { listRetentionGoals, setRetentionGoal, listGroupKpiGoals, setGroupKpiGoal, listBonusGoals, setBonusGoal } from "@/lib/goals.functions";
import {
  getCommissionSettings,
  setVendidoTiers,
  setNovosValues,
  setRetencaoTiers,
  setSalespersonEquipe,
  type Equipe,
  type VendidoTiersConfig,
  type NovosValuesConfig,
  type RetencaoTiersConfig,
} from "@/lib/commission.functions";
import { CARTEIRA_OWNER_IDS, CARTEIRA_OWNER_NAMES } from "@/lib/salespeople";
import { useAuth } from "@/hooks/use-auth";


export const Route = createFileRoute("/_authenticated/admin/metas")({
  head: () => ({ meta: [{ title: "Metas — Portal 2P" }] }),
  component: MetasPage,
});

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

function parseBRL(v: string): number | null {
  if (!v.trim()) return 0;
  const cleaned = v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  if (Number.isNaN(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function formatInput(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MONTH_LABEL = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;
const MONTH_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

type QuarterOpt = { id: string; label: string; year: number; months: [number, number, number] };
const QUARTERS: QuarterOpt[] = [
  { id: "2026-Q1", label: "Q1 2026", year: 2026, months: [1, 2, 3] },
  { id: "2026-Q2", label: "Q2 2026", year: 2026, months: [4, 5, 6] },
  { id: "2026-Q3", label: "Q3 2026", year: 2026, months: [7, 8, 9] },
];

function MetasPage() {
  const { hasRole } = useAuth();
  const [ownerId, setOwnerId] = useState<string>("all");
  const [quarterId, setQuarterId] = useState<string>("2026-Q3");
  const [onlyActive, setOnlyActive] = useState<boolean>(false);
  const quarter = QUARTERS.find((q) => q.id === quarterId) ?? QUARTERS[2];

  const fetchList = useServerFn(listSalespersonGoals);
  const saveGoal = useServerFn(setSalespersonGoal);
  const saveActive = useServerFn(setQuarterGoalActive);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin-salesperson-goals", quarter.year, quarter.months.join(",")],
    queryFn: () => fetchList({ data: { year: quarter.year, months: [...quarter.months] } }),
    staleTime: 60_000,
    enabled: hasRole("admin"),
  });

  const mut = useMutation({
    mutationFn: (v: { sf_user_id: string; year: number; month: number; monthly_goal: number }) =>
      saveGoal({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-salesperson-goals"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar meta"),
  });

  const activeMut = useMutation({
    mutationFn: (v: { sf_user_id: string; active: boolean }) =>
      saveActive({
        data: {
          sf_user_id: v.sf_user_id,
          year: quarter.year,
          months: [...quarter.months],
          active: v.active,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-salesperson-goals"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar meta"),
  });

  const people = q.data?.records ?? [];
  const filtered = useMemo(() => {
    let list = ownerId === "all" ? people : people.filter((p) => p.id === ownerId);
    if (onlyActive) {
      list = list.filter((p) => quarter.months.some((m) => p.active[`${quarter.year}-${m}`]));
    }
    return list;
  }, [people, ownerId, onlyActive, quarter]);

  const totals = useMemo(() => {
    const perMonth: Record<number, number> = {};
    let quarterTotal = 0;
    for (const m of quarter.months) perMonth[m] = 0;
    for (const p of filtered) {
      for (const m of quarter.months) {
        const key = `${quarter.year}-${m}`;
        if (!p.active[key]) continue;
        const v = p.goals[key] ?? 0;
        perMonth[m] += v;
        quarterTotal += v;
      }
    }
    return { perMonth, quarterTotal, count: filtered.length };
  }, [filtered, quarter]);


  if (!hasRole("admin")) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <Target className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <h1 className="font-display font-bold text-xl">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Somente administradores podem gerenciar metas.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-[1200px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Administrador</div>
            <h1 className="text-3xl font-bold mt-1">Metas de Faturamento</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Defina a meta mensal de cada vendedor por trimestre. Alterações são salvas
              automaticamente e o histórico é preservado.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border">
              <UsersIcon className="h-4 w-4 text-primary" />
              <label className="text-xs text-muted-foreground">Vendedor</label>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="bg-transparent text-sm font-medium outline-none pr-1 max-w-[220px]"
                disabled={q.isLoading}
              >
                <option value="all">Todos</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-sm">
              {QUARTERS.map((qo) => (
                <button
                  key={qo.id}
                  onClick={() => setQuarterId(qo.id)}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    qo.id === quarterId
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {qo.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={onlyActive}
                onChange={(e) => setOnlyActive(e.target.checked)}
                className="h-4 w-4 accent-primary cursor-pointer"
              />
              <span className="font-medium">Só metas ativas</span>
            </label>
          </div>

        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={`Total ${quarter.label}`} value={fmt(totals.quarterTotal)} highlight />
          {quarter.months.map((m) => (
            <StatCard
              key={m}
              label={`Total ${MONTH_FULL[m - 1]}`}
              value={fmt(totals.perMonth[m] ?? 0)}
            />
          ))}
        </div>

        {q.isError && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-sm px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div>{q.error instanceof Error ? q.error.message : "Erro ao carregar vendedores"}</div>
          </div>
        )}

        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
                  <th className="text-left px-4 py-2.5">Vendedor</th>
                  <th className="text-left px-4 py-2.5">Cargo</th>
                  <th className="text-center px-4 py-2.5 w-36">Meta {quarter.label}</th>
                  {quarter.months.map((m) => (
                    <th key={m} className="text-right px-4 py-2.5 w-48">
                      {MONTH_FULL[m - 1]} <span className="text-muted-foreground/70">(R$)</span>
                    </th>
                  ))}
                  <th className="text-right px-4 py-2.5 w-40">Total trimestre</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading && (
                  <tr>
                    <td
                      colSpan={4 + quarter.months.length}
                      className="px-4 py-16 text-center text-muted-foreground text-sm"
                    >
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2 align-middle" />
                      Carregando vendedores…
                    </td>
                  </tr>
                )}
                {!q.isLoading &&
                  filtered.map((p) => (
                    <GoalRow
                      key={p.id}
                      person={p}
                      year={quarter.year}
                      months={quarter.months}
                      onSaveGoal={(month, monthly_goal) =>
                        mut.mutate({
                          sf_user_id: p.id,
                          year: quarter.year,
                          month,
                          monthly_goal,
                        })
                      }
                      onToggleActive={(active) =>
                        activeMut.mutate({ sf_user_id: p.id, active })
                      }
                    />
                  ))}
                {!q.isLoading && filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={4 + quarter.months.length}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      Nenhum vendedor encontrado.
                    </td>

                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <RetentionGoalsPanel year={quarter.year} quarter={QUARTERS.findIndex((qo) => qo.id === quarterId) + 1} quarterLabel={quarter.label} />
        <BonusGoalsPanel />
        <GroupKpiGoalsPanel />
        <CommissionVendidoPanel />
        <CommissionRetencaoPanel />
        <CommissionNovosPanel />
        <SalespersonEquipePanel />
        <ModerationAuditLog area="metas" description="alterações nas metas e regras de comissão do 2P Solar." />
      </div>
    </AppLayout>
  );
}



function RetentionGoalsPanel({ year, quarter, quarterLabel }: { year: number; quarter: number; quarterLabel: string }) {
  const fetchList = useServerFn(listRetentionGoals);
  const saveGoal = useServerFn(setRetentionGoal);
  const qc = useQueryClient();
  const owners = [...CARTEIRA_OWNER_IDS];

  const q = useQuery({
    queryKey: ["admin-retention-goals", year, quarter, owners.join(",")],
    queryFn: () => fetchList({ data: { year, quarter, sfUserIds: owners } }),
    staleTime: 60_000,
  });

  const mut = useMutation({
    mutationFn: (v: { sf_user_id: string; goal: number }) =>
      saveGoal({ data: { sf_user_id: v.sf_user_id, year, quarter, goal: v.goal } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-retention-goals"] });
      qc.invalidateQueries({ queryKey: ["goals-retention"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar meta"),
  });

  const goalMap = new Map<string, number>();
  for (const g of q.data?.records ?? []) goalMap.set(g.sf_user_id, g.goal);

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="font-display font-semibold">Meta de Retenção A/B · {quarterLabel}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Quantidade alvo de contas A/B do trimestre anterior que devem manter compras (≥ R$ 15k) neste trimestre.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
              <th className="text-left px-4 py-2.5">Vendedor</th>
              <th className="text-right px-4 py-2.5 w-40">Meta (contas)</th>
            </tr>
          </thead>
          <tbody>
            {owners.map((id) => (
              <NewAbGoalRow
                key={id}
                name={CARTEIRA_OWNER_NAMES[id] ?? id}
                value={goalMap.get(id) ?? 0}
                onSave={(v) => mut.mutate({ sf_user_id: id, goal: v })}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function GroupKpiGoalsPanel() {
  const fetchList = useServerFn(listGroupKpiGoals);
  const saveGoal = useServerFn(setGroupKpiGoal);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin-group-kpi-goals"],
    queryFn: () => fetchList(),
    staleTime: 60_000,
  });

  const mut = useMutation({
    mutationFn: (v: { kpi_key: "novos" | "novos_reativacoes" | "recorrencia" | "retencao"; goal: number }) =>
      saveGoal({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-group-kpi-goals"] });
      qc.invalidateQueries({ queryKey: ["tv-group-kpi-goals"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar meta"),
  });

  const ORDER: Array<"novos" | "novos_reativacoes" | "recorrencia" | "retencao"> = [
    "novos", "novos_reativacoes", "recorrencia", "retencao",
  ];
  const byKey = new Map((q.data?.records ?? []).map((r) => [r.kpi_key, r]));

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="font-display font-semibold">Metas do Grupo · Painel de TV</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Alvos gerais exibidos no painel de performance (TV). Aplicados ao grupo inteiro.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
              <th className="text-left px-4 py-2.5">KPI</th>
              <th className="text-left px-4 py-2.5 w-32">Período</th>
              <th className="text-right px-4 py-2.5 w-40">Meta</th>
            </tr>
          </thead>
          <tbody>
            {ORDER.map((k) => {
              const r = byKey.get(k);
              return (
                <tr key={k} className="border-b border-border/40 hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium">{r?.label ?? k}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{r?.period_type ?? "—"}</td>
                  <td className="px-4 py-2">
                    <NewAbGoalRowInline
                      value={r?.goal ?? 0}
                      onSave={(v) => mut.mutate({ kpi_key: k, goal: v })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewAbGoalRowInline({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [text, setText] = useState<string>(String(value));
  const initial = useRef<number>(value);
  useEffect(() => { setText(String(value)); initial.current = value; }, [value]);
  const commit = () => {
    const n = Math.max(0, Math.floor(Number(text.replace(/[^\d]/g, "")) || 0));
    if (n === initial.current) return;
    onSave(n);
  };
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      inputMode="numeric"
      className="w-full text-right py-1.5 px-2 rounded-md bg-surface border border-border focus:outline-none focus:border-primary/50 tabular-nums"
    />
  );
}



function NewAbGoalRow({ name, value, onSave }: { name: string; value: number; onSave: (v: number) => void }) {
  const [text, setText] = useState<string>(String(value));
  const initial = useRef<number>(value);
  useEffect(() => {
    setText(String(value));
    initial.current = value;
  }, [value]);
  const commit = () => {
    const n = Math.max(0, Math.floor(Number(text.replace(/[^\d]/g, "")) || 0));
    if (n === initial.current) return;
    onSave(n);
  };
  return (
    <tr className="border-b border-border/40 hover:bg-surface-2/50">
      <td className="px-4 py-3 font-medium">{name}</td>
      <td className="px-4 py-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          inputMode="numeric"
          className="w-full text-right py-1.5 px-2 rounded-md bg-surface border border-border focus:outline-none focus:border-primary/50 tabular-nums"
        />
      </td>
    </tr>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-border p-4 ${
        highlight ? "bg-gradient-to-br from-primary/10 to-transparent" : "bg-surface/60"
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display font-bold text-2xl tabular-nums">{value}</div>
    </div>
  );
}

function GoalRow({
  person,
  year,
  months,
  onSaveGoal,
  onToggleActive,
}: {
  person: SalespersonMonthlyGoals;
  year: number;
  months: readonly number[];
  onSaveGoal: (month: number, monthly_goal: number) => void;
  onToggleActive: (active: boolean) => void;
}) {
  // Meta ativa do trimestre = qualquer mês ativo
  const isActive = months.some((m) => person.active[`${year}-${m}`]);
  const total = months.reduce((acc, m) => acc + (person.goals[`${year}-${m}`] ?? 0), 0);
  return (
    <tr className="border-b border-border/40 hover:bg-surface-2/50">
      <td className="px-4 py-3 font-medium">{person.name}</td>
      <td className="px-4 py-3 text-muted-foreground">{person.title ?? "—"}</td>
      <td className="px-4 py-3">
        <div className="flex justify-center">
          <select
            value={isActive ? "yes" : "no"}
            onChange={(e) => onToggleActive(e.target.value === "yes")}
            className={`py-1 px-2 rounded-md bg-surface border text-xs focus:outline-none ${
              isActive
                ? "border-success/40 text-success"
                : "border-border text-muted-foreground"
            }`}
          >
            <option value="yes">Ativa</option>
            <option value="no">Inativa</option>
          </select>
        </div>
      </td>
      {months.map((m) => (
        <td key={m} className="px-4 py-3">
          <GoalCell
            key={`${person.id}-${year}-${m}`}
            value={person.goals[`${year}-${m}`] ?? 0}
            monthLabel={MONTH_LABEL[m - 1]}
            onSave={(v) => onSaveGoal(m, v)}
          />
        </td>
      ))}
      <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmt(total)}</td>
    </tr>
  );
}


function GoalCell({
  value: initialValue,
  monthLabel,
  onSave,
}: {
  value: number;
  monthLabel: string;
  onSave: (v: number) => void;
}) {
  const [value, setValue] = useState<string>(initialValue ? formatInput(initialValue) : "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "invalid">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRef = useRef(initialValue);

  useEffect(() => {
    if (initialValue !== savedRef.current) {
      savedRef.current = initialValue;
      setValue(initialValue ? formatInput(initialValue) : "");
    }
  }, [initialValue]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const scheduleSave = (raw: string) => {
    if (timer.current) clearTimeout(timer.current);
    const parsed = parseBRL(raw);
    if (parsed === null) {
      setStatus("invalid");
      return;
    }
    if (parsed === savedRef.current) {
      setStatus("idle");
      return;
    }
    setStatus("saving");
    timer.current = setTimeout(() => {
      onSave(parsed);
      savedRef.current = parsed;
      setStatus("saved");
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1500);
    }, 600);
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          R$
        </span>
        <input
          inputMode="decimal"
          value={value}
          placeholder="0,00"
          aria-label={`Meta ${monthLabel}`}
          onChange={(e) => {
            setValue(e.target.value);
            scheduleSave(e.target.value);
          }}
          onBlur={(e) => {
            const parsed = parseBRL(e.target.value);
            if (parsed !== null) setValue(parsed ? formatInput(parsed) : "");
          }}
          className={`w-36 pl-8 pr-2 py-1.5 rounded-md bg-surface border text-sm text-right tabular-nums focus:outline-none ${
            status === "invalid"
              ? "border-destructive/60 focus:border-destructive"
              : "border-border focus:border-primary/50"
          }`}
        />
      </div>
      <span className="w-4 text-muted-foreground">
        {status === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {status === "saved" && <Check className="h-3.5 w-3.5 text-success" />}
        {status === "invalid" && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
      </span>
    </div>
  );
}

// ============================================================
//  Comissão do Vendido — % por faixa de atingimento e equipe
// ============================================================

function CommissionVendidoPanel() {
  const fetch = useServerFn(getCommissionSettings);
  const save = useServerFn(setVendidoTiers);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["commission-settings"],
    queryFn: () => fetch(),
    staleTime: 60_000,
  });

  const cfg = q.data?.vendido;

  const mut = useMutation({
    mutationFn: (v: VendidoTiersConfig) => save({ data: v }),
    onSuccess: () => {
      toast.success("Regras de comissão do Vendido atualizadas.");
      qc.invalidateQueries({ queryKey: ["commission-settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const [draft, setDraft] = useState<VendidoTiersConfig | null>(null);
  useEffect(() => {
    if (cfg && !draft) setDraft(cfg);
  }, [cfg, draft]);

  const view = draft ?? cfg;

  const updatePct = (equipe: Equipe, i: number, v: string) => {
    if (!view) return;
    const n = Number(v.replace(",", "."));
    if (Number.isNaN(n) || n < 0) return;
    const next: VendidoTiersConfig = {
      ...view,
      pre_vendas: [...view.pre_vendas],
      carteira: [...view.carteira],
    };
    if (equipe === "pre_vendas") next.pre_vendas[i] = n;
    else next.carteira[i] = n;
    setDraft(next);
  };

  const dirty = !!(draft && cfg && JSON.stringify(draft) !== JSON.stringify(cfg));

  const tierLabel = (t: { min: number; max: number | null }) =>
    t.max === null ? `${t.min}%+` : `${t.min}%–${t.max}%`;

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-semibold">Comissão do Vendido</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            % aplicada sobre o valor vendido a partir de 70% da meta (método marginal por faixa).
          </p>
        </div>
        {dirty && (
          <button
            onClick={() => draft && mut.mutate(draft)}
            disabled={mut.isPending}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
          >
            {mut.isPending ? "Salvando…" : "Salvar alterações"}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
              <th className="text-left px-4 py-2.5">Equipe</th>
              {view?.tiers.map((t, i) => (
                <th key={i} className="text-right px-4 py-2.5 w-32">{tierLabel(t)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(["pre_vendas", "carteira"] as const).map((eq) => (
              <tr key={eq} className="border-b border-border/40 hover:bg-surface-2/50">
                <td className="px-4 py-3 font-medium">
                  {eq === "pre_vendas" ? "Pré Vendas" : "Carteira"}
                </td>
                {view?.tiers.map((_, i) => {
                  const val = (eq === "pre_vendas" ? view.pre_vendas[i] : view.carteira[i]) ?? 0;
                  return (
                    <td key={i} className="px-4 py-2">
                      <div className="relative">
                        <input
                          value={String(val).replace(".", ",")}
                          onChange={(e) => updatePct(eq, i, e.target.value)}
                          inputMode="decimal"
                          className="w-full pl-2 pr-6 py-1.5 rounded-md bg-surface border border-border text-right tabular-nums focus:outline-none focus:border-primary/50"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
//  Comissão de Novos — R$ fixo por conta nova A/B e equipe
// ============================================================

function CommissionNovosPanel() {
  const fetch = useServerFn(getCommissionSettings);
  const save = useServerFn(setNovosValues);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["commission-settings"],
    queryFn: () => fetch(),
    staleTime: 60_000,
  });

  const cfg = q.data?.novos;
  const [draft, setDraft] = useState<NovosValuesConfig | null>(null);
  useEffect(() => { if (cfg && !draft) setDraft(cfg); }, [cfg, draft]);
  const view = draft ?? cfg;

  const mut = useMutation({
    mutationFn: (v: NovosValuesConfig) => save({ data: v }),
    onSuccess: () => {
      toast.success("Regras de comissão de Novos atualizadas.");
      qc.invalidateQueries({ queryKey: ["commission-settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const upd = (equipe: Equipe, cls: "A" | "B", v: string) => {
    if (!view) return;
    const n = Math.max(0, Math.floor(Number(v.replace(/[^\d]/g, "")) || 0));
    setDraft({ ...view, [equipe]: { ...view[equipe], [cls]: n } } as NovosValuesConfig);
  };
  const dirty = !!(draft && cfg && JSON.stringify(draft) !== JSON.stringify(cfg));

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-semibold">Comissão de Novos A/B</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Valor fixo em reais por conta nova A ou B conquistada no trimestre.
          </p>
        </div>
        {dirty && (
          <button
            onClick={() => draft && mut.mutate(draft)}
            disabled={mut.isPending}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
          >
            {mut.isPending ? "Salvando…" : "Salvar alterações"}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
              <th className="text-left px-4 py-2.5">Equipe</th>
              <th className="text-right px-4 py-2.5 w-40">Novo B (R$)</th>
              <th className="text-right px-4 py-2.5 w-40">Novo A (R$)</th>
            </tr>
          </thead>
          <tbody>
            {(["pre_vendas", "carteira"] as const).map((eq) => (
              <tr key={eq} className="border-b border-border/40 hover:bg-surface-2/50">
                <td className="px-4 py-3 font-medium">
                  {eq === "pre_vendas" ? "Pré Vendas" : "Carteira"}
                </td>
                {(["B", "A"] as const).map((cls) => (
                  <td key={cls} className="px-4 py-2">
                    <input
                      value={String(view?.[eq]?.[cls] ?? 0)}
                      onChange={(e) => upd(eq, cls, e.target.value)}
                      inputMode="numeric"
                      className="w-full py-1.5 px-2 rounded-md bg-surface border border-border text-right tabular-nums focus:outline-none focus:border-primary/50"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
//  Atribuição de Equipe por vendedor
// ============================================================

function SalespersonEquipePanel() {
  const fetch = useServerFn(getCommissionSettings);
  const save = useServerFn(setSalespersonEquipe);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["commission-settings"],
    queryFn: () => fetch(),
    staleTime: 60_000,
  });

  const mut = useMutation({
    mutationFn: (v: { sf_user_id: string; equipe: Equipe }) => save({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commission-settings"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="font-display font-semibold">Equipe do vendedor</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Define qual tabela de comissão se aplica a cada vendedor.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
              <th className="text-left px-4 py-2.5">Vendedor</th>
              <th className="text-right px-4 py-2.5 w-56">Equipe</th>
            </tr>
          </thead>
          <tbody>
            {CARTEIRA_OWNER_IDS.map((id) => {
              const current = (q.data?.equipe?.[id] ?? "carteira") as Equipe;
              return (
                <tr key={id} className="border-b border-border/40 hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium">{CARTEIRA_OWNER_NAMES[id] ?? id}</td>
                  <td className="px-4 py-2 text-right">
                    <select
                      value={current}
                      onChange={(e) => mut.mutate({ sf_user_id: id, equipe: e.target.value as Equipe })}
                      className="py-1.5 px-2 rounded-md bg-surface border border-border text-sm focus:outline-none focus:border-primary/50"
                    >
                      <option value="pre_vendas">Pré Vendas</option>
                      <option value="carteira">Carteira</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
//  Comissão de Retenção — R$ fixo por faixa de atingimento
// ============================================================

function CommissionRetencaoPanel() {
  const fetch = useServerFn(getCommissionSettings);
  const save = useServerFn(setRetencaoTiers);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["commission-settings"],
    queryFn: () => fetch(),
    staleTime: 60_000,
  });

  const cfg = q.data?.retencao;
  const [draft, setDraft] = useState<RetencaoTiersConfig | null>(null);
  useEffect(() => { if (cfg && !draft) setDraft(cfg); }, [cfg, draft]);
  const view = draft ?? cfg;

  const mut = useMutation({
    mutationFn: (v: RetencaoTiersConfig) => save({ data: v }),
    onSuccess: () => {
      toast.success("Regras de comissão de Retenção atualizadas.");
      qc.invalidateQueries({ queryKey: ["commission-settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const updVal = (i: number, v: string) => {
    if (!view) return;
    const n = Math.max(0, Math.floor(Number(v.replace(/[^\d]/g, "")) || 0));
    const values = [...view.values];
    values[i] = n;
    setDraft({ ...view, values });
  };
  const dirty = !!(draft && cfg && JSON.stringify(draft) !== JSON.stringify(cfg));

  const tierLabel = (t: { min: number; max: number | null }) =>
    t.max === null ? `${t.min}%+` : `${t.min}%–${t.max}%`;

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-semibold">Comissão de Retenção A/B</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Valor fixo em reais conforme % de atingimento da meta de retenção (abaixo de 70% = R$ 0).
          </p>
        </div>
        {dirty && (
          <button
            onClick={() => draft && mut.mutate(draft)}
            disabled={mut.isPending}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
          >
            {mut.isPending ? "Salvando…" : "Salvar alterações"}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
              <th className="text-left px-4 py-2.5">Faixa de atingimento</th>
              <th className="text-right px-4 py-2.5 w-48">Comissão (R$)</th>
            </tr>
          </thead>
          <tbody>
            {view?.tiers.map((t, i) => (
              <tr key={i} className="border-b border-border/40 hover:bg-surface-2/50">
                <td className="px-4 py-3 font-medium">{tierLabel(t)}</td>
                <td className="px-4 py-2">
                  <input
                    value={String(view.values[i] ?? 0)}
                    onChange={(e) => updVal(i, e.target.value)}
                    inputMode="numeric"
                    className="w-full py-1.5 px-2 rounded-md bg-surface border border-border text-right tabular-nums focus:outline-none focus:border-primary/50"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
//  Meta Bônus — texto livre por vendedor
// ============================================================

function BonusGoalsPanel() {
  const fetchList = useServerFn(listBonusGoals);
  const saveBonus = useServerFn(setBonusGoal);
  const qc = useQueryClient();
  const owners = [...CARTEIRA_OWNER_IDS];

  const q = useQuery({
    queryKey: ["admin-bonus-goals", owners.join(",")],
    queryFn: () => fetchList({ data: { sfUserIds: owners } }),
    staleTime: 60_000,
  });

  const mut = useMutation({
    mutationFn: (v: { sf_user_id: string; bonus_text: string }) => saveBonus({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-bonus-goals"] });
      qc.invalidateQueries({ queryKey: ["goals-bonus"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar meta bônus"),
  });

  const byOwner = new Map<string, string>();
  for (const r of q.data?.records ?? []) byOwner.set(r.sf_user_id, r.bonus_text);

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="font-display font-semibold">Meta Bônus por Vendedor</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Texto livre — descreva a meta bônus (ex.: "Fechar 3 contas &gt; R$ 50k no trimestre"). Deixe em branco para remover.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
              <th className="text-left px-4 py-2.5 w-48">Vendedor</th>
              <th className="text-left px-4 py-2.5">Meta bônus</th>
            </tr>
          </thead>
          <tbody>
            {owners.map((id) => (
              <BonusGoalRow
                key={id}
                name={CARTEIRA_OWNER_NAMES[id] ?? id}
                value={byOwner.get(id) ?? ""}
                onSave={(v) => mut.mutate({ sf_user_id: id, bonus_text: v })}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BonusGoalRow({ name, value, onSave }: { name: string; value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState<string>(value);
  const initial = useRef<string>(value);
  useEffect(() => {
    setText(value);
    initial.current = value;
  }, [value]);
  const commit = () => {
    const next = text.trim();
    if (next === initial.current.trim()) return;
    onSave(next);
    initial.current = next;
  };
  return (
    <tr className="border-b border-border/40 hover:bg-surface-2/50">
      <td className="px-4 py-3 font-medium align-top">{name}</td>
      <td className="px-4 py-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          placeholder="Ex.: Fechar 3 contas premium no trimestre…"
          rows={2}
          className="w-full py-1.5 px-2 rounded-md bg-surface border border-border focus:outline-none focus:border-primary/50 resize-y min-h-[42px]"
        />
      </td>
    </tr>
  );
}
