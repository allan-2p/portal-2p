import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Save, ShieldCheck, Users, Pencil } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { useAuth } from "@/hooks/use-auth";
import {
  adminListPermissionProfiles,
  adminSavePermissionProfile,
  adminDeletePermissionProfile,
  adminSetProfileFeatures,
  adminSetProfileInstances,
  adminSetUserProfiles,
  type PermissionProfile,
} from "@/lib/permission-profiles.functions";
import { adminListAccessMatrix, type AdminUserRow } from "@/lib/access.functions";
import {
  INSTANCES,
  INSTANCE_IDS,
  ALL_FEATURES,
  FEATURE_LABELS,
  type FeatureKey,
  type InstanceId,
} from "@/lib/instances";
import { groupFeatures, shortFeatureLabel, featureScopeLabel } from "@/lib/feature-groups";
import { PermissionMatrix } from "@/components/admin/permission-matrix";

export const Route = createFileRoute("/_authenticated/admin/perfis")({
  component: PerfisPage,
  head: () => ({
    meta: [
      { title: "Perfis | Portal 2P" },
      {
        name: "description",
        content:
          "Crie perfis de permissão (moderador, gestor, vendedor) e associe usuários no Portal 2P.",
      },
      { property: "og:title", content: "Perfis | Portal 2P" },
      {
        property: "og:description",
        content: "Configuração de perfis e permissões extras por usuário.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PerfisPage() {
  const { hasRole, loading: authLoading } = useAuth();
  const listFn = useServerFn(adminListPermissionProfiles);
  const saveFn = useServerFn(adminSavePermissionProfile);
  const deleteFn = useServerFn(adminDeletePermissionProfile);
  const setFeatsFn = useServerFn(adminSetProfileFeatures);
  const setInstsFn = useServerFn(adminSetProfileInstances);
  const setUsersFn = useServerFn(adminSetUserProfiles);
  const matrixFn = useServerFn(adminListAccessMatrix);

  const [profiles, setProfiles] = useState<PermissionProfile[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [instance, setInstance] = useState<InstanceId>("solar");
  const [keys, setKeys] = useState<Set<FeatureKey>>(new Set());
  const [saving, setSaving] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [profInstances, setProfInstances] = useState<Set<InstanceId>>(new Set());
  const [featSearch, setFeatSearch] = useState("");
  const [tab, setTab] = useState<"perfis" | "matriz">("perfis");

  async function load() {
    setLoading(true);
    try {
      const [p, m] = await Promise.all([listFn(), matrixFn()]);
      setProfiles(p.profiles);
      setUsers(m.users);
      setSelectedId((cur) => cur ?? p.profiles[0]?.id ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar perfis");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading && hasRole("admin")) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const selected = useMemo(
    () => profiles.find((p) => p.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setKeys(
      new Set(
        selected.features.filter((f) => f.instance_id === instance).map((f) => f.feature_key as FeatureKey),
      ),
    );
  }, [selected, instance]);

  useEffect(() => {
    if (!selected) return;
    setProfInstances(new Set(selected.instances as InstanceId[]));
  }, [selected]);

  async function toggleProfileInstance(id: InstanceId, on: boolean) {
    if (!selected) return;
    const next = new Set(profInstances);
    if (on) next.add(id);
    else next.delete(id);
    setProfInstances(next);
    try {
      await setInstsFn({ data: { profile_id: selected.id, instance_ids: [...next] } });
      toast.success("Instâncias do perfil atualizadas");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  const instFeatures = useMemo(
    () => ALL_FEATURES.filter((f) => INSTANCES[instance].routes.includes(f)),
    [instance],
  );

  const groupedFeatures = useMemo(() => {
    const q = featSearch.trim().toLowerCase();
    const filtered = q
      ? instFeatures.filter((f) => FEATURE_LABELS[f].toLowerCase().includes(q))
      : instFeatures;
    return groupFeatures(filtered);
  }, [instFeatures, featSearch]);

  function toggleGroup(groupKeys: FeatureKey[], on: boolean) {
    const next = new Set(keys);
    for (const k of groupKeys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    setKeys(next);
  }


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
          <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h1 className="font-display font-bold text-xl mb-1">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground">
            Apenas administradores podem configurar perfis de permissão.
          </p>
        </div>
      </AppLayout>
    );
  }

  async function createProfile() {
    const name = prompt("Nome do novo perfil (ex.: Moderador Carregadores)");
    if (!name) return;
    try {
      const res = await saveFn({ data: { name } });
      toast.success("Perfil criado");
      setSelectedId(res.id);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function renameProfile(p: PermissionProfile) {
    const name = prompt("Nome do perfil", p.name);
    if (!name || name === p.name) return;
    try {
      await saveFn({ data: { id: p.id, name, description: p.description } });
      toast.success("Perfil atualizado");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function removeProfile(p: PermissionProfile) {
    if (!confirm(`Excluir o perfil "${p.name}"? Os usuários vinculados perdem essas permissões.`)) return;
    try {
      await deleteFn({ data: { id: p.id } });
      toast.success("Perfil excluído");
      setSelectedId(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function saveFeatures() {
    if (!selected) return;
    setSaving(true);
    try {
      await setFeatsFn({
        data: { profile_id: selected.id, instance_id: instance, feature_keys: [...keys] },
      });
      toast.success(`Permissões do perfil salvas em ${INSTANCES[instance].label}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function toggleUser(userId: string, on: boolean) {
    if (!selected) return;
    const current = new Set(
      profiles.filter((p) => p.user_ids.includes(userId)).map((p) => p.id),
    );
    if (on) current.add(selected.id);
    else current.delete(selected.id);
    try {
      await setUsersFn({ data: { user_id: userId, profile_ids: [...current] } });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display font-bold text-2xl">Perfis</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Administradores acessam tudo, sem exceção. Os demais usuários recebem acesso pelos
              perfis: todo acesso é definido aqui.
            </p>
          </div>
          {(
            <button
              onClick={createProfile}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
            >
              <Plus className="h-4 w-4" /> Novo perfil
            </button>
          )}
        </div>

        <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-sm w-fit">
          {(
            [
              ["perfis", "Perfis e telas"],
              ["matriz", "Matriz de permissões"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                tab === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div className="glass rounded-xl overflow-hidden h-fit">
              <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                Perfis
              </div>
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-border last:border-0 ${
                    p.id === selectedId ? "bg-primary/10" : "hover:bg-surface-2"
                  }`}
                >
                  <div className="font-medium text-sm">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.user_ids.length} usuário(s) • {p.features.length} tela(s) •{" "}
                    {p.instances.length} instância(s)
                  </div>
                </button>
              ))}
              {profiles.length === 0 && (
                <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                  Nenhum perfil criado.
                </div>
              )}
            </div>

            {selected ? (
              <div className="space-y-4">
                <div className="glass rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="font-display font-semibold text-lg">{selected.name}</h2>
                      {selected.description && (
                        <p className="text-sm text-muted-foreground">{selected.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => renameProfile(selected)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-sm hover:bg-surface-2"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Renomear
                      </button>
                      {!selected.is_system && (
                        <button
                          onClick={() => removeProfile(selected)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-sm text-destructive hover:bg-surface-2"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Excluir
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="glass rounded-xl p-4 space-y-3">
                  <div>
                    <h3 className="font-medium text-sm">Instâncias liberadas</h3>
                    <p className="text-xs text-muted-foreground">
                      Defina a quais unidades este perfil dá acesso.
                    </p>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-3">
                    {INSTANCE_IDS.map((id) => (
                      <label
                        key={id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-surface-2 cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={profInstances.has(id)}
                          onChange={(e) => toggleProfileInstance(id, e.target.checked)}
                          className="accent-[var(--primary)]"
                        />
                        {INSTANCES[id].label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="glass rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-sm w-fit">
                      {INSTANCE_IDS.map((id) => (
                        <button
                          key={id}
                          onClick={() => setInstance(id)}
                          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                            instance === id
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {INSTANCES[id].label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {keys.size} de {instFeatures.length} telas
                      </span>
                      <button
                        onClick={saveFeatures}
                        disabled={saving}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium disabled:opacity-60"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar telas
                      </button>
                    </div>
                  </div>

                  <input
                    value={featSearch}
                    onChange={(e) => setFeatSearch(e.target.value)}
                    placeholder="Buscar tela…"
                    className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm w-full sm:w-72 outline-none focus:border-primary"
                  />

                  {(["instancia", "grupo"] as const).map((area) => {
                    const areaGroups = groupedFeatures.filter((g) => g.group.area === area);
                    if (!areaGroups.length) return null;
                    return (
                      <div key={area} className="space-y-3">
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          {area === "instancia"
                            ? `Telas da instância ${INSTANCES[instance].label}`
                            : "Ambiente do Grupo 2P (Administração)"}
                        </div>
                        {areaGroups.map(({ group, keys: gk }) => {
                          const allOn = gk.every((k) => keys.has(k));
                          const someOn = gk.some((k) => keys.has(k));
                          return (
                            <div key={group.id} className="rounded-xl border border-border overflow-hidden">
                              <div className="flex items-center justify-between gap-3 px-3 py-2 bg-surface-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium flex items-center gap-2">
                                    {group.label}
                                    <span
                                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                        someOn
                                          ? "bg-primary/15 text-primary"
                                          : "bg-muted text-muted-foreground"
                                      }`}
                                    >
                                      {gk.filter((k) => keys.has(k)).length}/{gk.length}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground truncate">
                                    {group.description}
                                  </div>
                                </div>
                                <button
                                  onClick={() => toggleGroup(gk, !allOn)}
                                  className="text-xs px-2 py-1 rounded-md border border-border hover:bg-background shrink-0"
                                >
                                  {allOn ? "Desmarcar todas" : "Marcar todas"}
                                </button>
                              </div>
                              <div className="grid gap-1.5 sm:grid-cols-2 p-3">
                                {gk.map((f) => {
                                  const scope = featureScopeLabel(f);
                                  const isAreaToggle = group.accessKey === f;
                                  return (
                                    <label
                                      key={f}
                                      title={
                                        isAreaToggle
                                          ? "Libera a engrenagem e todas as telas desta área, sem precisar marcar tela por tela."
                                          : undefined
                                      }
                                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                                        isAreaToggle
                                          ? "sm:col-span-2 border-primary/50 bg-primary/5 font-medium"
                                          : "border-border hover:bg-surface-2"
                                      }`}
                                    >

                                      <input
                                        type="checkbox"
                                        checked={keys.has(f)}
                                        onChange={(e) => {
                                          const next = new Set(keys);
                                          if (e.target.checked) next.add(f);
                                          else next.delete(f);
                                          setKeys(next);
                                        }}
                                        className="accent-[var(--primary)]"
                                      />
                                      <span className="truncate">{shortFeatureLabel(f)}</span>
                                      {scope && (
                                        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                                          {scope}
                                        </span>
                                      )}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {groupedFeatures.length === 0 && (
                    <div className="text-sm text-muted-foreground py-6 text-center">
                      Nenhuma tela encontrada para “{featSearch}”.
                    </div>
                  )}
                </div>


                <div className="glass rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-medium text-sm">
                        Usuários com este perfil ({selected.user_ids.length})
                      </h3>
                    </div>
                    <input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Buscar usuário por nome ou e-mail…"
                      className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm w-full sm:w-72 outline-none focus:border-primary"
                    />
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2 max-h-[420px] overflow-auto">
                    {users
                      .filter((u) => {
                        const q = userSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          (u.full_name ?? "").toLowerCase().includes(q) ||
                          u.email.toLowerCase().includes(q)
                        );
                      })
                      .map((u) => (
                      <label
                        key={u.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-surface-2 cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selected.user_ids.includes(u.id)}
                          onChange={(e) => toggleUser(u.id, e.target.checked)}
                          className="accent-[var(--primary)]"
                        />
                        <span className="truncate">
                          {u.full_name ?? u.email}
                          {u.is_admin && (
                            <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                              admin
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              <div className="glass rounded-xl p-10 text-center text-sm text-muted-foreground">
                Selecione ou crie um perfil.
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
