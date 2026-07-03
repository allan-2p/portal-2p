import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
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
  const [search, setSearch] = useState("");
  const [quarterId, setQuarterId] = useState<string>("2026-Q3");
  const quarter = QUARTERS.find((q) => q.id === quarterId) ?? QUARTERS[2];

  const fetchList = useServerFn(listSalespersonGoals);
  const saveGoal = useServerFn(setSalespersonGoal);
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

  const people = q.data?.records ?? [];
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return people;
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(s) || (p.title ?? "").toLowerCase().includes(s),
    );
  }, [people, search]);

  const totals = useMemo(() => {
    const perMonth: Record<number, number> = {};
    let quarterTotal = 0;
    let withAny = 0;
    for (const m of quarter.months) perMonth[m] = 0;
    for (const p of people) {
      let personTotal = 0;
      for (const m of quarter.months) {
        const v = p.goals[`${quarter.year}-${m}`] ?? 0;
        perMonth[m] += v;
        personTotal += v;
      }
      if (personTotal > 0) withAny += 1;
      quarterTotal += personTotal;
    }
    return { perMonth, quarterTotal, withAny, count: people.length };
  }, [people, quarter]);

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
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar vendedor…"
                className="pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-sm w-64 focus:outline-none focus:border-primary/50"
              />
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
                      colSpan={3 + quarter.months.length}
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
                    />
                  ))}
                {!q.isLoading && filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={3 + quarter.months.length}
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
      </div>
    </AppLayout>
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
}: {
  person: SalespersonMonthlyGoals;
  year: number;
  months: readonly number[];
  onSaveGoal: (month: number, monthly_goal: number) => void;
}) {
  const total = months.reduce((acc, m) => acc + (person.goals[`${year}-${m}`] ?? 0), 0);
  return (
    <tr className="border-b border-border/40 hover:bg-surface-2/50">
      <td className="px-4 py-3 font-medium">{person.name}</td>
      <td className="px-4 py-3 text-muted-foreground">{person.title ?? "—"}</td>
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
