import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Stethoscope,
  User as UserIcon,
  ShieldCheck,
  Activity,
  Pencil,
} from "lucide-react";
import { adminUserDiagnostics, type UserCheck } from "@/lib/users.functions";
import { ROLE_LABELS, type AppRole } from "@/hooks/use-auth";

const SCOPE_LABELS: Record<string, string> = {
  geral: "Geral",
  pre_vendas: "Pré Vendas",
  carteira: "Carteira",
  individual: "Individual",
};

const ORG_LABELS: Record<string, string> = {
  solar: "2P Solar",
  station: "Station",
  grupo: "Grupo 2P",
  carregadores: "2P Carregadores",
};

type TabId = "geral" | "diagnostico" | "acessos" | "atividade";
const TABS: { id: TabId; label: string; icon: typeof UserIcon }[] = [
  { id: "geral", label: "Visão geral", icon: UserIcon },
  { id: "diagnostico", label: "Diagnóstico", icon: Stethoscope },
  { id: "acessos", label: "Acessos", icon: ShieldCheck },
  { id: "atividade", label: "Atividade", icon: Activity },
];

function fmtDate(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR");
}

function fmtMoney(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Info({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm ${mono ? "font-mono" : ""}`}>{value ?? "—"}</p>
    </div>
  );
}

function CheckRow({ c }: { c: UserCheck }) {
  const Icon = c.status === "ok" ? CheckCircle2 : c.status === "warn" ? AlertTriangle : XCircle;
  const tone =
    c.status === "ok"
      ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5"
      : c.status === "warn"
        ? "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/5"
        : "text-destructive border-destructive/30 bg-destructive/5";
  return (
    <div className={`flex gap-3 rounded-xl border p-3 ${tone}`}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{c.label}</p>
        <p className="text-xs text-muted-foreground">{c.detail}</p>
        {c.fix && <p className="text-xs text-foreground/80">Como resolver: {c.fix}</p>}
      </div>
    </div>
  );
}

export function UserDetailSheet({
  userId,
  onClose,
  onEdit,
}: {
  userId: string;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const [tab, setTab] = useState<TabId>("geral");
  const diagFn = useServerFn(adminUserDiagnostics);
  const q = useQuery({
    queryKey: ["user-diagnostics", userId],
    queryFn: () => diagFn({ data: { user_id: userId } }),
  });

  const d = q.data;
  const problems = (d?.checks ?? []).filter((c) => c.status !== "ok");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl h-full bg-card border-l border-border overflow-y-auto"
      >
        <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display font-bold text-lg">
              {d?.profile.full_name ?? "Detalhes do usuário"}
            </h2>
            <p className="text-xs text-muted-foreground">{d?.profile.email ?? ""}</p>
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-surface-2 flex items-center gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-2" aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {q.isLoading ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : q.error || !d ? (
          <div className="p-6 text-sm text-destructive">
            {q.error instanceof Error ? q.error.message : "Erro ao carregar diagnóstico."}
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {problems.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
                <span className="font-medium">{problems.length}</span> ponto(s) de atenção
                encontrados — veja a aba Diagnóstico.
              </div>
            )}

            <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-sm w-fit">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                    tab === t.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "geral" && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 rounded-xl border border-border p-4">
                  <Info label="Nome" value={d.profile.full_name} />
                  <Info label="E-mail" value={d.profile.email} />
                  <Info label="Telefone" value={d.profile.telefone} />
                  <Info label="Cargo" value={d.profile.cargo} />
                  <Info label="Tipo de cargo" value={d.profile.cargo_tipo} />
                  <Info label="Equipe" value={d.profile.equipe} />
                  <Info label="Organização" value={ORG_LABELS[d.profile.organizacao] ?? d.profile.organizacao} />
                  <Info label="Regime" value={d.profile.regime_contratacao} />
                  <Info label="Meta mensal" value={fmtMoney(d.profile.meta_mensal)} />
                  <Info
                    label="Perfis"
                    value={d.perfis?.length ? d.perfis.join(", ") : "—"}
                  />
                  <Info label="Escopo" value={SCOPE_LABELS[d.profile.filter_scope] ?? d.profile.filter_scope} />
                  <Info label="Status" value={d.profile.ativo ? "Ativo" : "Inativo"} />
                  <Info label="Externo" value={d.profile.is_external ? "Sim" : "Não"} />
                  <Info label="Criado em" value={fmtDate(d.profile.created_at)} />
                  <Info label="Atualizado em" value={fmtDate(d.profile.updated_at)} />
                  <Info label="ID do portal" value={d.profile.id} mono />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 rounded-xl border border-border p-4">
                  <p className="col-span-full text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Salesforce
                  </p>
                  <Info label="sf_user_id" value={d.profile.sf_user_id ?? "não vinculado"} mono />
                  <Info label="Nome no SF" value={d.salesforce.name} />
                  <Info label="E-mail no SF" value={d.salesforce.email} />
                  <Info label="Cargo no SF" value={d.salesforce.title} />
                  <Info
                    label="Equipe SF"
                    value={d.salesforce.team === "pre_vendas" ? "Pré Vendas" : d.salesforce.team === "carteira" ? "Carteira" : "—"}
                  />
                  <Info label="Visível nos rankings" value={d.salesforce.hidden ? "Não" : "Sim"} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-xl border border-border p-4">
                  <p className="col-span-full text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Metas cadastradas
                  </p>
                  <Info label="Mensais" value={d.goals.monthly} />
                  <Info label="Bônus" value={d.goals.bonus ? "Sim" : "Não"} />
                  <Info label="Novos A/B" value={d.goals.new_ab} />
                  <Info label="Retenção" value={d.goals.retention} />
                </div>
              </div>
            )}

            {tab === "diagnostico" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 rounded-xl border border-border p-4">
                  <Info label="Escopo aplicado" value={SCOPE_LABELS[d.scope.scope] ?? d.scope.scope} />
                  <Info
                    label="Vendedores visíveis"
                    value={d.scope.allowed_sf_ids === null ? "Todos" : d.scope.allowed_count}
                  />
                  <Info label="sf_user_id" value={d.profile.sf_user_id ?? "vazio"} mono />
                </div>
                {d.checks.map((c) => (
                  <CheckRow key={c.id} c={c} />
                ))}
                {d.scope.allowed_sf_ids && d.scope.allowed_sf_ids.length > 0 && (
                  <details className="rounded-xl border border-border p-3">
                    <summary className="text-sm cursor-pointer">
                      IDs do Salesforce considerados ({d.scope.allowed_sf_ids.length})
                    </summary>
                    <p className="mt-2 text-xs font-mono break-all text-muted-foreground">
                      {d.scope.allowed_sf_ids.join(", ")}
                    </p>
                  </details>
                )}
              </div>
            )}

            {tab === "acessos" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-border p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Instâncias liberadas
                  </p>
                  {d.access.instances.length ? (
                    <div className="flex flex-wrap gap-2">
                      {d.access.instances.map((i) => (
                        <span key={i} className="text-xs px-2 py-1 rounded-full bg-surface-2 border border-border">
                          {ORG_LABELS[i] ?? i}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-destructive">Nenhuma instância liberada.</p>
                  )}
                </div>

                <div className="rounded-xl border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Telas por instância
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <Info label="Liberadas (total)" value={d.access.permissions_allowed} />
                    <Info label="Bloqueadas (total)" value={d.access.permissions_denied} />
                  </div>
                  <div className="space-y-1">
                    {d.access.by_instance.map((b) => (
                      <div key={b.instance_id} className="flex justify-between text-sm">
                        <span>{ORG_LABELS[b.instance_id] ?? b.instance_id}</span>
                        <span className="text-muted-foreground">
                          {b.allowed} liberadas · {b.denied} bloqueadas
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 rounded-xl border border-border p-4">
                  <p className="col-span-full text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Autenticação
                  </p>
                  <Info label="Último acesso" value={fmtDate(d.auth.last_sign_in_at)} />
                  <Info label="E-mail confirmado" value={fmtDate(d.auth.email_confirmed_at)} />
                  <Info label="Bloqueado" value={d.auth.banned ? "Sim" : "Não"} />
                </div>
              </div>
            )}

            {tab === "atividade" && (
              <div className="rounded-xl border border-border divide-y divide-border">
                {d.activity.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">Nenhum registro de atividade.</p>
                ) : (
                  d.activity.map((a, i) => (
                    <div key={i} className="p-3 flex justify-between gap-4 text-sm">
                      <div>
                        <p className="font-medium">{a.event}</p>
                        {a.detail && <p className="text-xs text-muted-foreground">{a.detail}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(a.created_at)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
