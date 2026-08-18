import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import {
  listCarregadoresMetas,
  setCarregadoresMeta,
  setCarregadoresMetaAtiva,
  type CarregadoresMetaPessoa,
} from "@/lib/carregadores-metas.functions";
import { logModeration } from "@/lib/moderation-audit";

export const Route = createFileRoute("/_authenticated/carregadores/metas")({
  head: () => ({
    meta: [
      { title: "Regras de Metas — 2P Carregadores | Portal 2P" },
      {
        name: "description",
        content: "Metas mensais, trimestrais e bônus dos consultores da unidade 2P Carregadores.",
      },
      { property: "og:title", content: "Regras de Metas — 2P Carregadores | Portal 2P" },
      { property: "og:description", content: "Moderação das metas da unidade 2P Carregadores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="carregadores.metas" area="moderacao">
      <CarregadoresMetasPage />
    </AdminRouteGuard>
  ),
});

const MONTH_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

type QuarterOpt = { id: string; label: string; year: number; months: [number, number, number] };

function quarterOptions(): QuarterOpt[] {
  const now = new Date();
  const year = now.getFullYear();
  return [1, 2, 3, 4].map((q) => ({
    id: `${year}-Q${q}`,
    label: `Q${q} ${year}`,
    year,
    months: [q * 3 - 2, q * 3 - 1, q * 3] as [number, number, number],
  }));
}

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const formatInput = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseBRL(v: string): number | null {
  if (!v.trim()) return 0;
  const cleaned = v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  if (Number.isNaN(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function CarregadoresMetasPage() {
  const quarters = useMemo(quarterOptions, []);
  const currentQuarter = quarters[Math.floor(new Date().getMonth() / 3)] ?? quarters[0];
  const [quarterId, setQuarterId] = useState(currentQuarter.id);
  const [pessoaId, setPessoaId] = useState("all");
  const [onlyActive, setOnlyActive] = useState(false);
  const quarter = quarters.find((q) => q.id === quarterId) ?? currentQuarter;

  const fetchList = useServerFn(listCarregadoresMetas);
  const saveMeta = useServerFn(setCarregadoresMeta);
  const saveAtiva = useServerFn(setCarregadoresMetaAtiva);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["carregadores-metas", quarter.year, quarter.months.join(",")],
    queryFn: () => fetchList({ data: { year: quarter.year, months: [...quarter.months] } }),
    staleTime: 60_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["carregadores-metas"] });

  const metaMut = useMutation({
    mutationFn: (v: {
      user_id: string;
      month: number;
      meta?: number;
      meta_bonus?: number;
      nome: string;
    }) =>
      saveMeta({
        data: {
          user_id: v.user_id,
          year: quarter.year,
          month: v.month,
          ...(v.meta !== undefined ? { meta: v.meta } : {}),
          ...(v.meta_bonus !== undefined ? { meta_bonus: v.meta_bonus } : {}),
        },
      }),
    onSuccess: (_r, v) => {
      invalidate();
      void logModeration({
        area: "carregadores_metas",
        action: v.meta_bonus !== undefined ? "meta_bonus" : "meta",
        target: v.nome,
        summary: `Meta ${v.meta_bonus !== undefined ? "bônus " : ""}de ${v.nome} em ${MONTH_FULL[v.month - 1]}/${quarter.year} definida para ${fmt(v.meta ?? v.meta_bonus ?? 0)}`,
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar meta"),
  });

  const ativaMut = useMutation({
    mutationFn: (v: { user_id: string; active: boolean; nome: string }) =>
      saveAtiva({
        data: {
          user_id: v.user_id,
          year: quarter.year,
          months: [...quarter.months],
          active: v.active,
        },
      }),
    onSuccess: (_r, v) => {
      invalidate();
      void logModeration({
        area: "carregadores_metas",
        action: v.active ? "ativar" : "desativar",
        target: v.nome,
        summary: `Meta de ${v.nome} ${v.active ? "ativada" : "desativada"} em ${quarter.label}`,
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar meta"),
  });

  const pessoas = q.data?.records ?? [];
  const filtradas = useMemo(() => {
    let list = pessoaId === "all" ? pessoas : pessoas.filter((p) => p.user_id === pessoaId);
    if (onlyActive) {
      list = list.filter((p) => quarter.months.some((m) => p.ativo[`${quarter.year}-${m}`]));
    }
    return list;
  }, [pessoas, pessoaId, onlyActive, quarter]);

  const totais = useMemo(() => {
    const perMonth: Record<number, number> = {};
    let quarterTotal = 0;
    let bonusTotal = 0;
    for (const m of quarter.months) perMonth[m] = 0;
    for (const p of filtradas) {
      for (const m of quarter.months) {
        const key = `${quarter.year}-${m}`;
        if (p.ativo[key] === false) continue;
        perMonth[m] += p.metas[key] ?? 0;
        quarterTotal += p.metas[key] ?? 0;
        bonusTotal += p.bonus[key] ?? 0;
      }
    }
    return { perMonth, quarterTotal, bonusTotal };
  }, [filtradas, quarter]);

  return (
    <AppLayout>
      <div className="max-w-[1200px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Moderação • 2P Carregadores
            </div>
            <h1 className="text-3xl font-bold mt-1">Regras de Metas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Metas mensais e bônus dos consultores da unidade 2P Carregadores. Independentes das
              metas da 2P Solar.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border">
              <UsersIcon className="h-4 w-4 text-primary" />
              <label className="text-xs text-muted-foreground">Consultor</label>
              <select
                value={pessoaId}
                onChange={(e) => setPessoaId(e.target.value)}
                className="bg-transparent text-sm font-medium outline-none pr-1 max-w-[220px]"
                disabled={q.isLoading}
              >
                <option value="all">Todos</option>
                {pessoas.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-sm">
              {quarters.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setQuarterId(opt.id)}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    opt.id === quarterId
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
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

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label={`Total ${quarter.label}`} value={fmt(totais.quarterTotal)} highlight />
          {quarter.months.map((m) => (
            <StatCard key={m} label={`Total ${MONTH_FULL[m - 1]}`} value={fmt(totais.perMonth[m] ?? 0)} />
          ))}
          <StatCard label="Bônus no trimestre" value={fmt(totais.bonusTotal)} />
        </div>

        {q.isError && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-sm px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div>{q.error instanceof Error ? q.error.message : "Erro ao carregar consultores"}</div>
          </div>
        )}

        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
                  <th className="text-left px-4 py-2.5">Consultor</th>
                  <th className="text-center px-4 py-2.5 w-32">Meta {quarter.label}</th>
                  {quarter.months.map((m) => (
                    <th key={m} className="text-right px-4 py-2.5 w-44">
                      {MONTH_FULL[m - 1]} <span className="text-muted-foreground/70">(R$)</span>
                    </th>
                  ))}
                  <th className="text-right px-4 py-2.5 w-44">Meta bônus (trim.)</th>
                  <th className="text-right px-4 py-2.5 w-36">Total trimestre</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading && (
                  <tr>
                    <td colSpan={5 + quarter.months.length} className="px-4 py-16 text-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2 align-middle" />
                      Carregando consultores…
                    </td>
                  </tr>
                )}
                {!q.isLoading &&
                  filtradas.map((p) => (
                    <MetaRow
                      key={p.user_id}
                      pessoa={p}
                      year={quarter.year}
                      months={quarter.months}
                      onSaveMeta={(month, meta) =>
                        metaMut.mutate({ user_id: p.user_id, month, meta, nome: p.nome })
                      }
                      onSaveBonus={(month, meta_bonus) =>
                        metaMut.mutate({ user_id: p.user_id, month, meta_bonus, nome: p.nome })
                      }
                      onToggleActive={(active) =>
                        ativaMut.mutate({ user_id: p.user_id, active, nome: p.nome })
                      }
                    />
                  ))}
                {!q.isLoading && filtradas.length === 0 && (
                  <tr>
                    <td colSpan={5 + quarter.months.length} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Nenhum consultor com organização 2P Carregadores encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          As metas são salvas automaticamente ao sair do campo e ficam registradas no log de
          moderação de Carregadores.
        </p>
      </div>
    </AppLayout>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        highlight ? "border-primary/40 bg-primary/5" : "border-border bg-surface"
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-bold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function MetaRow({
  pessoa,
  year,
  months,
  onSaveMeta,
  onSaveBonus,
  onToggleActive,
}: {
  pessoa: CarregadoresMetaPessoa;
  year: number;
  months: readonly number[];
  onSaveMeta: (month: number, meta: number) => void;
  onSaveBonus: (month: number, meta: number) => void;
  onToggleActive: (active: boolean) => void;
}) {
  const ativa = months.some((m) => pessoa.ativo[`${year}-${m}`]);
  const total = months.reduce((acc, m) => acc + (pessoa.metas[`${year}-${m}`] ?? 0), 0);
  const bonusMonth = months[0];

  return (
    <tr className="border-b border-border/60 last:border-0 hover:bg-surface-2/40">
      <td className="px-4 py-2.5">
        <div className="font-medium">{pessoa.nome}</div>
        <div className="text-xs text-muted-foreground">
          {pessoa.cargo || pessoa.email}
          {!pessoa.ativoUsuario && <span className="ml-2 text-destructive">inativo</span>}
        </div>
      </td>
      <td className="px-4 py-2.5 text-center">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={ativa}
            onChange={(e) => onToggleActive(e.target.checked)}
            className="h-4 w-4 accent-primary cursor-pointer"
          />
          <span className="text-xs text-muted-foreground">{ativa ? "Ativa" : "Inativa"}</span>
        </label>
      </td>
      {months.map((m) => (
        <td key={m} className="px-4 py-2.5 text-right">
          <MoneyCell
            value={pessoa.metas[`${year}-${m}`] ?? 0}
            onSave={(v) => onSaveMeta(m, v)}
          />
        </td>
      ))}
      <td className="px-4 py-2.5 text-right">
        <MoneyCell
          value={pessoa.bonus[`${year}-${bonusMonth}`] ?? 0}
          onSave={(v) => onSaveBonus(bonusMonth, v)}
        />
      </td>
      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmt(total)}</td>
    </tr>
  );
}

function MoneyCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [text, setText] = useState(() => formatInput(value));
  const [erro, setErro] = useState(false);

  useEffect(() => {
    setText(formatInput(value));
  }, [value]);

  const commit = () => {
    const parsed = parseBRL(text);
    if (parsed === null) {
      setErro(true);
      return;
    }
    setErro(false);
    setText(formatInput(parsed));
    if (parsed !== value) onSave(parsed);
  };

  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      inputMode="decimal"
      className={`w-full max-w-[150px] text-right rounded-lg border bg-surface px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-primary ${
        erro ? "border-destructive" : "border-border"
      }`}
      aria-label="Meta em reais"
    />
  );
}
