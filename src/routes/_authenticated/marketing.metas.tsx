import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Target } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMarketingGoals, setMarketingGoal, type MarketingGoalRow } from "@/lib/marketing-goals.functions";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/marketing/metas")({
  head: () => ({ meta: [{ title: "Metas — Marketing — Portal 2P" }] }),
  component: MarketingMetasPage,
});

function MarketingMetasPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const fetchGoals = useServerFn(listMarketingGoals);
  const saveGoal = useServerFn(setMarketingGoal);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["marketing-goals"],
    queryFn: () => fetchGoals(),
    staleTime: 30_000,
  });

  const mut = useMutation({
    mutationFn: (v: { key: string; goal?: number; real_value?: number }) => saveGoal({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-goals"] });
      toast.success("Meta salva.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  return (
    <AppLayout>
      <div className="max-w-[1100px] mx-auto space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Marketing · Admin</div>
          <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" /> Metas de Marketing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure metas e valores realizados que aparecem nas páginas de Social Media e Tráfego Pago.
            {!isAdmin && <span className="ml-1 text-warning">Apenas administradores podem editar.</span>}
          </p>
        </div>

        {q.isLoading ? (
          <div className="glass rounded-2xl p-8 text-center text-muted-foreground">Carregando…</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {(q.data?.records ?? []).map((row) => (
              <GoalCard key={row.key} row={row} disabled={!isAdmin} onSave={(patch) => mut.mutate({ key: row.key, ...patch })} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function GoalCard({ row, disabled, onSave }: { row: MarketingGoalRow; disabled: boolean; onSave: (v: { goal?: number; real_value?: number }) => void }) {
  const [goal, setGoal] = useState<string>(String(row.goal));
  const [real, setReal] = useState<string>(String(row.real_value));
  useEffect(() => { setGoal(String(row.goal)); setReal(String(row.real_value)); }, [row.goal, row.real_value]);
  const pct = row.goal > 0 ? Math.min(100, (row.real_value / row.goal) * 100) : 0;

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{row.period}</div>
          <div className="font-display font-semibold">{row.label}</div>
        </div>
        <span className="text-[11px] px-2 py-0.5 rounded bg-surface-2 border border-border">{row.unit}</span>
      </div>

      <div className="mt-3 h-2 rounded-full bg-surface-2 overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-muted-foreground text-right tabular-nums">{pct.toFixed(1)}% da meta</div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <label className="text-xs">
          <span className="text-muted-foreground">Realizado</span>
          <input
            type="number"
            min={0}
            disabled={disabled}
            value={real}
            onChange={(e) => setReal(e.target.value)}
            className="w-full mt-1 px-2 py-1.5 rounded-md bg-surface border border-border tabular-nums text-right disabled:opacity-60"
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">Meta</span>
          <input
            type="number"
            min={0}
            disabled={disabled}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="w-full mt-1 px-2 py-1.5 rounded-md bg-surface border border-border tabular-nums text-right disabled:opacity-60"
          />
        </label>
      </div>
      {!disabled && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => onSave({ goal: Number(goal) || 0, real_value: Number(real) || 0 })}
            className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90"
          >
            Salvar
          </button>
        </div>
      )}
    </div>
  );
}
