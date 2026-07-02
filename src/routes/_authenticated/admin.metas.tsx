import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertTriangle, Search, Target, Check } from "lucide-react";
import { toast } from "sonner";
import { listSalespersonGoals, setSalespersonGoal, type SalespersonGoal } from "@/lib/admin.functions";
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

function MetasPage() {
  const { hasRole } = useAuth();
  const [search, setSearch] = useState("");

  const fetchList = useServerFn(listSalespersonGoals);
  const saveGoal = useServerFn(setSalespersonGoal);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin-salesperson-goals"],
    queryFn: () => fetchList(),
    staleTime: 60_000,
    enabled: hasRole("admin"),
  });

  const mut = useMutation({
    mutationFn: (v: { sf_user_id: string; monthly_goal: number }) => saveGoal({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-salesperson-goals"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar meta"),
  });

  const people = q.data?.records ?? [];
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return people;
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        (p.email ?? "").toLowerCase().includes(s) ||
        (p.title ?? "").toLowerCase().includes(s),
    );
  }, [people, search]);

  const totals = useMemo(() => {
    const total = people.reduce((acc, p) => acc + p.monthlyGoal, 0);
    const withGoal = people.filter((p) => p.monthlyGoal > 0).length;
    return { total, withGoal, count: people.length };
  }, [people]);

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
              Defina a meta mensal de faturamento em R$ para cada vendedor. Alterações são salvas
              automaticamente.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar vendedor…"
                className="pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-sm w-64 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="Meta total mensal" value={fmt(totals.total)} highlight />
          <StatCard label="Vendedores com meta" value={`${totals.withGoal} / ${totals.count}`} />
          <StatCard
            label="Meta média"
            value={fmt(totals.withGoal > 0 ? totals.total / totals.withGoal : 0)}
          />
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
                  <th className="text-left px-4 py-2.5">E-mail</th>
                  <th className="text-left px-4 py-2.5">Cargo</th>
                  <th className="text-right px-4 py-2.5 w-56">Meta mensal (R$)</th>
                  <th className="text-left px-4 py-2.5 w-40">Última atualização</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center text-muted-foreground text-sm">
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
                      onSave={(monthly_goal) => mut.mutate({ sf_user_id: p.id, monthly_goal })}
                    />
                  ))}
                {!q.isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
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
  onSave,
}: {
  person: SalespersonGoal;
  onSave: (monthly_goal: number) => void;
}) {
  const [value, setValue] = useState<string>(person.monthlyGoal ? formatInput(person.monthlyGoal) : "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "invalid">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRef = useRef(person.monthlyGoal);

  useEffect(() => {
    // sync when server data mudar (ex.: outro admin editou)
    if (person.monthlyGoal !== savedRef.current) {
      savedRef.current = person.monthlyGoal;
      setValue(person.monthlyGoal ? formatInput(person.monthlyGoal) : "");
    }
  }, [person.monthlyGoal]);

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

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <tr className="border-b border-border/40 hover:bg-surface-2/50">
      <td className="px-4 py-3 font-medium">{person.name}</td>
      <td className="px-4 py-3 text-muted-foreground">{person.email ?? "—"}</td>
      <td className="px-4 py-3 text-muted-foreground">{person.title ?? "—"}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              R$
            </span>
            <input
              inputMode="decimal"
              value={value}
              placeholder="0,00"
              onChange={(e) => {
                setValue(e.target.value);
                scheduleSave(e.target.value);
              }}
              onBlur={(e) => {
                const parsed = parseBRL(e.target.value);
                if (parsed !== null) setValue(parsed ? formatInput(parsed) : "");
              }}
              className={`w-44 pl-8 pr-2 py-1.5 rounded-md bg-surface border text-sm text-right tabular-nums focus:outline-none ${
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
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {person.updatedAt ? new Date(person.updatedAt).toLocaleString("pt-BR") : "—"}
      </td>
    </tr>
  );
}

function formatInput(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
