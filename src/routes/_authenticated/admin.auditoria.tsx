import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { adminListAccessMatrix } from "@/lib/access.functions";
import { INSTANCES, FEATURE_LABELS, ROUTE_FEATURE, type InstanceId, type FeatureKey } from "@/lib/instances";
import { useMemo, useState } from "react";
import { Loader2, ShieldCheck, Search, AlertTriangle, Users, KeyRound, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { validateAdminVisibility } from "@/lib/instance-consistency";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";

export const Route = createFileRoute("/_authenticated/admin/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoria de Acessos — Portal 2P" },
      { name: "description", content: "Relatório de auditoria de telas, abas e menus com os usuários que têm acesso a cada um." },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.auditoria" area="configuracoes">
      <AuditoriaPage />
    </AdminRouteGuard>
  ),
});

type Row = {
  instance: InstanceId;
  feature: FeatureKey;
  path: string | null;
  users: { id: string; name: string; admin: boolean }[];
  admins: number;
  regular: number;
};

function AuditoriaPage() {
  const list = useServerFn(adminListAccessMatrix);
  const { data, isLoading } = useQuery({
    queryKey: ["access-matrix-audit"],
    queryFn: () => list(),
    staleTime: 30_000,
  });
  const [q, setQ] = useState("");
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [inst, setInst] = useState<InstanceId | "all">("all");

  const users = data?.users ?? [];

  const pathByFeature = useMemo(() => {
    const m = new Map<string, string>();
    for (const [path, feat] of Object.entries(ROUTE_FEATURE)) if (!m.has(feat)) m.set(feat, path);
    return m;
  }, []);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const inst of Object.values(INSTANCES)) {
      for (const feature of inst.routes as FeatureKey[]) {
        const withAccess = users
          .filter((u) => {
            const hasInstance = u.is_admin || u.instances.includes(inst.id);
            if (!hasInstance) return false;
            if (u.is_admin) return true;
            return u.granted.some((g) => g.instance_id === inst.id && g.feature_key === feature);
          })
          .map((u) => ({ id: u.id, name: u.full_name || u.email, admin: u.is_admin }));
        out.push({
          instance: inst.id as InstanceId,
          feature,
          path: pathByFeature.get(feature) ?? null,
          users: withAccess,
          admins: withAccess.filter((u) => u.admin).length,
          regular: withAccess.filter((u) => !u.admin).length,
        });
      }
    }
    return out;
  }, [users, pathByFeature]);

  // Inconsistências
  const issues = useMemo(() => {
    const out: { kind: string; severity: "alta" | "média"; detail: string }[] = [];
    const validByInstance = new Map<string, Set<string>>(
      Object.values(INSTANCES).map((i) => [i.id, new Set(i.routes as string[])]),
    );
    for (const u of users) {
      if (u.is_admin) continue;
      for (const g of u.granted) {
        if (!u.instances.includes(g.instance_id)) {
          out.push({
            kind: "Permissão órfã",
            severity: "alta",
            detail: `${u.full_name || u.email} tem "${FEATURE_LABELS[g.feature_key as FeatureKey] ?? g.feature_key}" liberado em ${g.instance_id}, mas não tem acesso a essa instância.`,
          });
        } else if (!validByInstance.get(g.instance_id)?.has(g.feature_key)) {
          out.push({
            kind: "Tela inexistente",
            severity: "média",
            detail: `${u.full_name || u.email} tem "${g.feature_key}" liberado em ${g.instance_id}, mas essa tela não existe nessa instância.`,
          });
        }
      }
      for (const instId of u.instances) {
        const count = u.granted.filter((g) => g.instance_id === instId).length;
        if (count === 0) {
          out.push({
            kind: "Instância sem telas",
            severity: "média",
            detail: `${u.full_name || u.email} tem acesso à instância ${instId}, mas nenhuma tela liberada.`,
          });
        }
      }
    }
    for (const r of rows) {
      if (r.regular === 0) {
        out.push({
          kind: "Tela sem usuários",
          severity: "média",
          detail: `"${FEATURE_LABELS[r.feature] ?? r.feature}" (${r.instance}) só é acessível por administradores.`,
        });
      }
    }
    return out;
  }, [users, rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (inst !== "all" && r.instance !== inst) return false;
      if (onlyGaps && r.regular > 0) return false;
      if (!term) return true;
      const label = (FEATURE_LABELS[r.feature] ?? r.feature).toLowerCase();
      return (
        label.includes(term) ||
        r.feature.toLowerCase().includes(term) ||
        (r.path ?? "").toLowerCase().includes(term) ||
        r.users.some((u) => u.name.toLowerCase().includes(term))
      );
    });
  }, [rows, q, onlyGaps, inst]);

  function exportCsv() {
    const head = ["Instância", "Tela", "Chave", "Rota", "Admins", "Usuários", "Nomes"];
    const lines = [head.join(";")].concat(
      filtered.map((r) =>
        [
          r.instance,
          FEATURE_LABELS[r.feature] ?? r.feature,
          r.feature,
          r.path ?? "",
          String(r.admins),
          String(r.regular),
          r.users.filter((u) => !u.admin).map((u) => u.name).join(", "),
        ]
          .map((v) => `"${v.replace(/"/g, '""')}"`)
          .join(";"),
      ),
    );
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "auditoria-acessos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalGaps = rows.filter((r) => r.regular === 0).length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Auditoria de Acessos
            </h1>
            <p className="text-sm text-muted-foreground">
              Todas as telas, abas e menus do portal e quem tem acesso a cada um.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
            </Button>
            <Link to="/admin/perfis">
              <Button size="sm">
                <KeyRound className="h-4 w-4 mr-1.5" /> Ajustar permissões
              </Button>
            </Link>
          </div>
        </div>

        <VisibilityCheck />

        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Telas mapeadas" value={rows.length} />
          <Stat label="Usuários" value={users.length} icon={<Users className="h-4 w-4" />} />
          <Stat label="Telas sem usuários" value={totalGaps} tone={totalGaps ? "warn" : "ok"} />
          <Stat label="Inconsistências" value={issues.length} tone={issues.length ? "warn" : "ok"} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar tela, rota ou usuário..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex items-center gap-1">
            <FilterChip active={inst === "all"} onClick={() => setInst("all")}>Todas</FilterChip>
            {Object.values(INSTANCES).map((i) => (
              <FilterChip key={i.id} active={inst === i.id} onClick={() => setInst(i.id as InstanceId)}>
                {i.label}
              </FilterChip>
            ))}
          </div>
          <FilterChip active={onlyGaps} onClick={() => setOnlyGaps((v) => !v)}>
            Só lacunas
          </FilterChip>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando auditoria...
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Instância</th>
                  <th className="text-left px-3 py-2">Tela / Aba</th>
                  <th className="text-left px-3 py-2">Rota</th>
                  <th className="text-left px-3 py-2">Com acesso</th>
                  <th className="text-left px-3 py-2">Usuários</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={`${r.instance}-${r.feature}`} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <Badge variant="outline">{INSTANCES[r.instance]?.label ?? r.instance}</Badge>
                    </td>
                    <td className="px-3 py-2 font-medium">{FEATURE_LABELS[r.feature] ?? r.feature}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{r.path ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={cn("font-semibold", r.regular === 0 && "text-[oklch(0.72_0.17_60)]")}>{r.regular}</span>
                      <span className="text-muted-foreground text-xs"> + {r.admins} adm</span>
                    </td>
                    <td className="px-3 py-2">
                      {r.regular === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-[oklch(0.72_0.17_60)]">
                          <AlertTriangle className="h-3.5 w-3.5" /> Nenhum usuário além de administradores
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.users
                            .filter((u) => !u.admin)
                            .map((u) => (
                              <span key={u.id} className="text-xs px-2 py-0.5 rounded bg-surface-2 border border-border">
                                {u.name}
                              </span>
                            ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                      Nenhuma tela encontrada com esses filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[oklch(0.72_0.17_60)]" /> Lacunas e inconsistências ({issues.length})
          </h2>
          {issues.length === 0 ? (
            <div className="text-sm text-muted-foreground border border-border rounded-lg p-4 bg-card">
              Nenhuma inconsistência encontrada.
            </div>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border bg-card">
              {issues.map((i, idx) => (
                <div key={idx} className="px-3 py-2 flex items-start gap-3 text-sm">
                  <Badge variant={i.severity === "alta" ? "destructive" : "secondary"} className="shrink-0">
                    {i.kind}
                  </Badge>
                  <span className="text-muted-foreground">{i.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon?: React.ReactNode; tone?: "ok" | "warn" }) {
  return (
    <div className="border border-border rounded-lg p-3 bg-card">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div
        className={cn(
          "text-2xl font-semibold mt-1",
          tone === "warn" && "text-[oklch(0.72_0.17_60)]",
          tone === "ok" && "text-[oklch(0.72_0.16_150)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 h-9 rounded-lg border text-sm transition-colors",
        active ? "bg-primary text-primary-foreground border-primary" : "bg-surface border-border hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}

/** Validação automática: opções do Grupo 2P visíveis igualmente em todas as instâncias. */
function VisibilityCheck() {
  const report = useMemo(() => validateAdminVisibility(), []);
  return (
    <div className={cn("rounded-xl border p-4", report.ok ? "border-border bg-surface" : "border-destructive/40 bg-destructive/5")}>
      <div className="flex items-center gap-2 text-sm font-medium">
        {report.ok ? <ShieldCheck className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
        Consistência entre instâncias
        <Badge variant="outline" className="ml-1">{report.checked} verificações</Badge>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {report.ok
          ? "Todas as opções do Grupo 2P disponíveis no Solar aparecem igualmente em Carregadores e Marketing para administradores."
          : "Divergências de visibilidade encontradas entre as instâncias:"}
      </p>
      {!report.ok && (
        <ul className="mt-2 space-y-1 text-xs text-destructive">
          {report.issues.map((i, idx) => (
            <li key={idx}>• {i.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
