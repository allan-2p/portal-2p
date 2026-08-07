import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppLayout } from "@/components/app-layout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABELS, type AppRole } from "@/hooks/use-auth";
import {
  adminCreateUser,
  adminInviteUser,
  adminSetRole,
  adminToggleActive,
  adminDeleteUser,
  adminUpdateUser,
  listSalesforceCandidates,
  inviteSalesforceUser,
  syncSalesforcePhoto,
  syncAllSalesforcePhotos,
  type SFCandidate,
} from "@/lib/users.functions";
import { adminSetUserScope, adminSetUserSfId, type FilterScope } from "@/lib/scope.functions";
import { toast } from "sonner";

import {
  Loader2, UserPlus, Mail, Shield, Trash2, Power, Camera, RefreshCw, Cloud, ExternalLink, Pencil,
} from "lucide-react";
import { uploadAvatar } from "@/lib/avatar";
import { useAvatarUrl } from "@/hooks/use-avatar-url";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — Portal 2P" }] }),
  component: UsuariosPage,
});

type Regime = "CLT" | "PJ";

type Row = {
  id: string;
  email: string;
  full_name: string | null;
  cargo: string | null;
  equipe: string | null;
  regime_contratacao: Regime;
  ativo: boolean;
  avatar_url: string | null;
  sf_user_id: string | null;
  is_external: boolean;
  filter_scope: FilterScope;
  roles: AppRole[];
};

const ROLES: AppRole[] = ["admin", "gerente", "vendedor", "diretor", "marketing"];
const REGIMES: Regime[] = ["CLT", "PJ"];
const SCOPES: { id: FilterScope; label: string }[] = [
  { id: "geral", label: "Geral" },
  { id: "pre_vendas", label: "Pré Vendas" },
  { id: "carteira", label: "Carteira" },
  { id: "individual", label: "Individual" },
];

type Tab = "portal" | "salesforce";


function UsuariosPage() {
  const { hasRole, loading: authLoading, user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("portal");
  const [modal, setModal] = useState<
    | { kind: "create" }
    | { kind: "invite"; external?: boolean }
    | { kind: "invite-sf"; candidate: SFCandidate }
    | { kind: "edit"; row: Row }
    | null
  >(null);

  const createFn = useServerFn(adminCreateUser);
  const inviteFn = useServerFn(adminInviteUser);
  const setRoleFn = useServerFn(adminSetRole);
  const toggleFn = useServerFn(adminToggleActive);
  const deleteFn = useServerFn(adminDeleteUser);
  const setScopeFn = useServerFn(adminSetUserScope);
  const setSfIdFn = useServerFn(adminSetUserSfId);
  const updateFn = useServerFn(adminUpdateUser);

  async function load() {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,email,full_name,cargo,equipe,regime_contratacao,ativo,avatar_url,sf_user_id,is_external,filter_scope")
      .order("full_name");
    const { data: rolesData } = await supabase.from("user_roles").select("user_id,role");
    const byUser = new Map<string, AppRole[]>();
    (rolesData ?? []).forEach((r: { user_id: string; role: AppRole }) => {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role);
      byUser.set(r.user_id, arr);
    });
    setRows(
      (profiles ?? []).map((p: any) => ({
        ...p,
        filter_scope: (p.filter_scope ?? "individual") as FilterScope,
        regime_contratacao: (p.regime_contratacao ?? "CLT") as Regime,

        roles: byUser.get(p.id) ?? [],
      })) as Row[],
    );
    setLoading(false);
  }

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading]);


  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!hasRole("admin")) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto mt-20 text-center">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h1 className="font-display font-bold text-xl mb-1">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground">
            Apenas administradores podem gerenciar usuários.
          </p>
        </div>
      </AppLayout>
    );
  }

  async function handleRoleChange(userId: string, role: AppRole) {
    try {
      await setRoleFn({ data: { user_id: userId, role } });
      toast.success("Papel atualizado");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleToggle(userId: string, ativo: boolean) {
    try {
      await toggleFn({ data: { user_id: userId, ativo: !ativo } });
      toast.success(ativo ? "Usuário desativado" : "Usuário ativado");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleDelete(userId: string) {
    if (!confirm("Remover este usuário permanentemente?")) return;
    try {
      await deleteFn({ data: { user_id: userId } });
      toast.success("Usuário removido");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleScopeChange(userId: string, scope: FilterScope) {
    try {
      await setScopeFn({ data: { user_id: userId, scope } });
      toast.success("Escopo atualizado");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleSfIdChange(userId: string, sf_user_id: string | null) {
    try {
      await setSfIdFn({ data: { user_id: userId, sf_user_id } });
      toast.success("ID Salesforce atualizado");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleRegimeChange(userId: string, regime: Regime) {
    try {
      await updateFn({ data: { user_id: userId, regime_contratacao: regime } });
      toast.success("Regime de contratação atualizado");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }




  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display font-bold text-2xl">Usuários</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sincronize com Salesforce, convide externos e gerencie papéis.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setModal({ kind: "invite", external: true })}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm font-medium"
            >
              <ExternalLink className="h-4 w-4" /> Convidar externo
            </button>
            <button
              onClick={() => setModal({ kind: "invite" })}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm font-medium"
            >
              <Mail className="h-4 w-4" /> Convidar
            </button>
            <button
              onClick={() => setModal({ kind: "create" })}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
            >
              <UserPlus className="h-4 w-4" /> Criar usuário
            </button>
          </div>
        </div>

        <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-sm w-fit">
          {[
            { id: "portal", label: "Usuários do portal" },
            { id: "salesforce", label: "Sincronizar com Salesforce" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className={`px-4 py-1.5 rounded-md font-medium transition-colors ${
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "portal" ? (
          <PortalTable
            rows={rows}
            loading={loading}
            currentUserId={user?.id}
            onRoleChange={handleRoleChange}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onReload={load}
            onScopeChange={handleScopeChange}
            onSfIdChange={handleSfIdChange}
            onRegimeChange={handleRegimeChange}

            onEdit={(row) => setModal({ kind: "edit", row })}
          />
        ) : (
          <SalesforceTable onInvite={(c) => setModal({ kind: "invite-sf", candidate: c })} />
        )}
      </div>


      {modal?.kind === "edit" && (
        <EditUserModal
          row={modal.row}
          onClose={() => setModal(null)}
          onSubmit={async (data) => {
            await updateFn({ data: { user_id: modal.row.id, ...data } });
            toast.success("Usuário atualizado");
            setModal(null);
            load();
          }}
        />
      )}


      {modal?.kind === "create" && (
        <UserModal
          mode="create"
          onClose={() => setModal(null)}
          onSubmit={async (data) => {
            await createFn({ data: data as any });
            toast.success("Usuário criado");
            setModal(null);
            load();
          }}
        />
      )}
      {modal?.kind === "invite" && (
        <UserModal
          mode="invite"
          external={modal.external}
          onClose={() => setModal(null)}
          onSubmit={async (data) => {
            await inviteFn({ data: { ...data, is_external: !!modal.external } });
            toast.success("Convite enviado");
            setModal(null);
            load();
          }}
        />
      )}
      {modal?.kind === "invite-sf" && (
        <InviteSFModal
          candidate={modal.candidate}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </AppLayout>
  );
}

function PortalTable({
  rows, loading, currentUserId, onRoleChange, onToggle, onDelete, onReload, onScopeChange, onSfIdChange, onRegimeChange, onEdit,
}: {
  rows: Row[];
  loading: boolean;
  currentUserId: string | undefined;
  onRoleChange: (id: string, r: AppRole) => void;
  onToggle: (id: string, ativo: boolean) => void;
  onDelete: (id: string) => void;
  onReload: () => void;
  onScopeChange: (id: string, scope: FilterScope) => void;
  onSfIdChange: (id: string, sf_user_id: string | null) => void;
  onRegimeChange: (id: string, regime: Regime) => void;
  onEdit: (row: Row) => void;
}) {


  const syncPhoto = useServerFn(syncSalesforcePhoto);
  async function handleSyncPhoto(userId: string) {
    try {
      const r = await syncPhoto({ data: { user_id: userId } });
      if (r.ok) {
        toast.success("Foto sincronizada do Salesforce");
        onReload();
      } else {
        toast.warning(r.reason);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3"></th>
            <th className="text-left px-4 py-3 font-medium">Nome</th>
            <th className="text-left px-4 py-3 font-medium">E-mail</th>
            <th className="text-left px-4 py-3 font-medium">Equipe</th>
            <th className="text-left px-4 py-3 font-medium">Papel</th>
            <th className="text-left px-4 py-3 font-medium">Regime de contratação</th>

            <th className="text-left px-4 py-3 font-medium">Escopo do filtro</th>
            <th className="text-left px-4 py-3 font-medium">ID Salesforce</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3"></th>
          </tr>

        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={10} className="text-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin inline" />
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={10} className="text-center py-10 text-muted-foreground">
                Nenhum usuário ainda.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3 w-14">
                  <AvatarCell row={r} onUploaded={onReload} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{r.full_name ?? "—"}</span>
                    {r.is_external && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        Externo
                      </span>
                    )}
                    {r.sf_user_id && (
                      <span
                        title="Vinculado ao Salesforce"
                        className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 flex items-center gap-1"
                      >
                        <Cloud className="h-2.5 w-2.5" /> SF
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.equipe ?? "—"}</td>
                <td className="px-4 py-3">
                  <select
                    value={r.roles[0] ?? "vendedor"}
                    onChange={(e) => onRoleChange(r.id, e.target.value as AppRole)}
                    disabled={r.id === currentUserId}
                    className="px-2 py-1 rounded-md bg-background border border-border text-xs"
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={r.regime_contratacao}
                    onChange={(e) => onRegimeChange(r.id, e.target.value as Regime)}
                    className="px-2 py-1 rounded-md bg-background border border-border text-xs"
                  >
                    {REGIMES.map((rg) => (
                      <option key={rg} value={rg}>{rg}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">

                  <select
                    value={r.filter_scope}
                    onChange={(e) => onScopeChange(r.id, e.target.value as FilterScope)}
                    className="px-2 py-1 rounded-md bg-background border border-border text-xs"
                  >
                    {SCOPES.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <SfIdCell
                    value={r.sf_user_id}
                    onSave={(v: string | null) => onSfIdChange(r.id, v)}
                  />

                </td>

                <td className="px-4 py-3">
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      r.ativo
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {r.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={() => onEdit(r)}
                      className="p-1.5 rounded hover:bg-surface-2"
                      title="Editar informações"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {r.sf_user_id && (
                      <button
                        onClick={() => handleSyncPhoto(r.id)}
                        className="p-1.5 rounded hover:bg-surface-2"
                        title="Sincronizar foto do Salesforce"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => onToggle(r.id, r.ativo)}
                      disabled={r.id === currentUserId}
                      className="p-1.5 rounded hover:bg-surface-2 disabled:opacity-30"
                      title={r.ativo ? "Desativar" : "Ativar"}
                    >
                      <Power className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(r.id)}
                      disabled={r.id === currentUserId}
                      className="p-1.5 rounded hover:bg-destructive/10 text-destructive disabled:opacity-30"
                      title="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SalesforceTable({ onInvite }: { onInvite: (c: SFCandidate) => void }) {
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "invited" | "active">("pending");
  const [search, setSearch] = useState("");
  const fetchFn = useServerFn(listSalesforceCandidates);
  const [data, setData] = useState<SFCandidate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const r = await fetchFn();
      setData(r.records);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const filtered = (data ?? []).filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return c.name.toLowerCase().includes(s) || (c.email ?? "").toLowerCase().includes(s);
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou e-mail…"
          className="px-3 py-2 rounded-lg bg-surface border border-border text-sm w-72"
        />
        <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-xs">
          {[
            { id: "pending", label: "Pendentes" },
            { id: "invited", label: "Convidados" },
            { id: "active", label: "Ativos no portal" },
            { id: "all", label: "Todos" },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id as any)}
              className={`px-3 py-1.5 rounded-md font-medium ${
                statusFilter === s.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <SyncAllPhotosButton />
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-sm px-4 py-3">
          {err}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nome</th>
              <th className="text-left px-4 py-3 font-medium">E-mail</th>
              <th className="text-left px-4 py-3 font-medium">Cargo</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-muted-foreground">
                  Nenhum usuário do Salesforce nesse filtro.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.sf_user_id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.title ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.status === "pending" && c.email && (
                      <button
                        onClick={() => onInvite(c)}
                        className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
                      >
                        Convidar para o portal
                      </button>
                    )}
                    {c.status === "invited" && (
                      <span className="text-xs text-muted-foreground">Aguardando aceite</span>
                    )}
                    {c.status === "active" && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">Já no portal</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SyncAllPhotosButton() {
  const syncAll = useServerFn(syncAllSalesforcePhotos);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const r = await syncAll();
      toast.success(
        `Fotos sincronizadas: ${r.updated}/${r.total} atualizadas` +
          (r.skipped ? ` · ${r.skipped} sem foto` : "") +
          (r.failed ? ` · ${r.failed} falharam` : ""),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao sincronizar fotos");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={run}
      disabled={busy}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm disabled:opacity-60"
      title="Sincroniza a foto de perfil (do Salesforce) para todos os usuários vinculados"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      Sincronizar fotos
    </button>
  );
}


function StatusBadge({ status }: { status: SFCandidate["status"] }) {
  const map = {
    pending: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
    invited: { label: "Convidado", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
    active: { label: "Ativo", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  } as const;
  const s = map[status];
  return <span className={`text-xs px-2 py-1 rounded-full ${s.cls}`}>{s.label}</span>;
}

function InviteSFModal({
  candidate, onClose, onDone,
}: { candidate: SFCandidate; onClose: () => void; onDone: () => void }) {
  const [role, setRole] = useState<AppRole>("vendedor");
  const [equipe, setEquipe] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inviteFn = useServerFn(inviteSalesforceUser);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          try {
            const r = await inviteFn({
              data: {
                sf_user_id: candidate.sf_user_id,
                role,
                cargo: candidate.title ?? null,
                equipe: equipe || null,
              },
            });
            toast.success(
              r.photo_synced
                ? "Convite enviado (foto sincronizada)"
                : "Convite enviado (foto SF indisponível)",
            );
            onDone();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erro");
          } finally {
            setSubmitting(false);
          }
        }}
        className="w-full max-w-md bg-card border border-border rounded-2xl p-6 space-y-3"
      >
        <h2 className="font-display font-bold text-lg">Convidar do Salesforce</h2>
        <div className="text-sm space-y-1">
          <div><span className="text-muted-foreground">Nome:</span> <span className="font-medium">{candidate.name}</span></div>
          <div><span className="text-muted-foreground">E-mail:</span> {candidate.email ?? "—"}</div>
          <div><span className="text-muted-foreground">Cargo:</span> {candidate.title ?? "—"}</div>
        </div>
        <Field label="Papel no portal">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AppRole)}
            className="input"
          >
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </Field>
        <Field label="Equipe (opcional)">
          <input value={equipe} onChange={(e) => setEquipe(e.target.value)} className="input" />
        </Field>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-border text-sm hover:bg-surface-2">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar convite
          </button>
        </div>
        <style>{`.input{width:100%;padding:0.5rem 0.75rem;border-radius:0.5rem;background:hsl(var(--background));border:1px solid hsl(var(--border));font-size:0.875rem;outline:none}.input:focus{border-color:hsl(var(--primary))}`}</style>
      </form>
    </div>
  );
}

function UserModal({
  mode,
  external,
  onClose,
  onSubmit,
}: {
  mode: "create" | "invite";
  external?: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
}) {
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    cargo: "",
    equipe: "",
    password: "",
    regime_contratacao: "CLT" as Regime,
    role: "vendedor" as AppRole,

  });
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          try {
            const payload =
              mode === "create"
                ? form
                : {
                    email: form.email,
                    full_name: form.full_name,
                    cargo: form.cargo || null,
                    equipe: form.equipe || null,
                    regime_contratacao: form.regime_contratacao,
                    role: form.role,

                  };
            await onSubmit(payload);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro");
          } finally {
            setSubmitting(false);
          }
        }}
        className="w-full max-w-md bg-card border border-border rounded-2xl p-6 space-y-3"
      >
        <h2 className="font-display font-bold text-lg flex items-center gap-2">
          {mode === "create" ? "Criar usuário" : external ? "Convidar externo" : "Convidar usuário"}
          {external && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              Externo
            </span>
          )}
        </h2>
        <p className="text-xs text-muted-foreground">
          {mode === "create"
            ? "Você define o e-mail e a senha inicial. O usuário entra imediatamente."
            : external
              ? "Usuário fora do Salesforce. Receberá um e-mail para definir a senha e ficará marcado como Externo."
              : "Enviamos um e-mail para o usuário definir a própria senha."}
        </p>

        <Field label="Nome completo">
          <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="input" />
        </Field>
        <Field label="E-mail">
          <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
        </Field>
        {mode === "create" && (
          <Field label="Senha inicial (mínimo 8)">
            <input required type="text" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cargo">
            <input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} className="input" />
          </Field>
          <Field label="Equipe">
            <input value={form.equipe} onChange={(e) => setForm({ ...form, equipe: e.target.value })} className="input" />
          </Field>
        </div>
        <Field label="Papel">
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AppRole })} className="input">
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </Field>
        <Field label="Regime de contratação">
          <select
            value={form.regime_contratacao}
            onChange={(e) => setForm({ ...form, regime_contratacao: e.target.value as Regime })}
            className="input"
          >
            {REGIMES.map((rg) => (
              <option key={rg} value={rg}>{rg}</option>
            ))}
          </select>
        </Field>


        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-border text-sm hover:bg-surface-2">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "create" ? "Criar" : "Enviar convite"}
          </button>
        </div>

        <style>{`.input{width:100%;padding:0.5rem 0.75rem;border-radius:0.5rem;background:hsl(var(--background));border:1px solid hsl(var(--border));font-size:0.875rem;outline:none}.input:focus{border-color:hsl(var(--primary))}`}</style>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function AvatarCell({ row, onUploaded }: { row: Row; onUploaded: () => void }) {
  const url = useAvatarUrl(row.avatar_url);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const initials = (row.full_name ?? row.email)
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="relative group h-10 w-10">
      <div className="h-10 w-10 rounded-full overflow-hidden bg-gradient-to-br from-primary to-[oklch(0.62_0.22_25)] flex items-center justify-center text-xs font-semibold text-primary-foreground">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initials}
      </div>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="absolute inset-0 rounded-full bg-black/55 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity disabled:opacity-100"
        aria-label="Trocar foto"
        title="Trocar foto"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            await uploadAvatar(row.id, f);
            toast.success("Foto atualizada");
            onUploaded();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erro ao enviar imagem");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function SfIdCell({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  const [v, setV] = useState<string>(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  const dirty = (v.trim() || null) !== (value ?? null);
  return (
    <div className="flex items-center gap-1">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="005..."
        className="w-32 px-2 py-1 rounded-md bg-background border border-border text-xs font-mono"
      />
      {dirty && (
        <button
          onClick={() => onSave(v.trim() ? v.trim() : null)}
          className="text-[10px] px-2 py-1 rounded bg-primary text-primary-foreground font-medium"
        >
          Salvar
        </button>
      )}
    </div>
  );
}

type EditPayload = {
  email: string;
  full_name: string;
  cargo: string | null;
  equipe: string | null;
  regime_contratacao: Regime;
  is_external: boolean;

};

function EditUserModal({
  row,
  onClose,
  onSubmit,
}: {
  row: Row;
  onClose: () => void;
  onSubmit: (data: EditPayload) => Promise<void>;
}) {
  const [form, setForm] = useState({
    email: row.email,
    full_name: row.full_name ?? "",
    cargo: row.cargo ?? "",
    equipe: row.equipe ?? "",
    regime_contratacao: row.regime_contratacao ?? "CLT",
    is_external: row.is_external,
  });

  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          try {
            await onSubmit({
              email: form.email,
              full_name: form.full_name,
              cargo: form.cargo || null,
              equipe: form.equipe || null,
              is_external: form.is_external,
            });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erro");
          } finally {
            setSubmitting(false);
          }
        }}
        className="w-full max-w-md bg-card border border-border rounded-2xl p-6 space-y-3"
      >
        <h2 className="font-display font-bold text-lg">Editar usuário</h2>
        <Field label="Nome completo">
          <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="input" />
        </Field>
        <Field label="E-mail">
          <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cargo">
            <input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} className="input" />
          </Field>
          <Field label="Equipe">
            <input value={form.equipe} onChange={(e) => setForm({ ...form, equipe: e.target.value })} className="input" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_external}
            onChange={(e) => setForm({ ...form, is_external: e.target.checked })}
          />
          Usuário externo
        </label>
        <p className="text-xs text-muted-foreground">
          Papel, escopo e ID do Salesforce são editados diretamente na tabela.
        </p>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-border text-sm hover:bg-surface-2">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
        <style>{`.input{width:100%;padding:0.5rem 0.75rem;border-radius:0.5rem;background:hsl(var(--background));border:1px solid hsl(var(--border));font-size:0.875rem;outline:none}.input:focus{border-color:hsl(var(--primary))}`}</style>
      </form>
    </div>
  );
}


