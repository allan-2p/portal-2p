import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSimulation } from "@/components/simulation";
import { AppLayout } from "@/components/app-layout";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adminListAccessMatrix,
  adminSetFeaturePermission,
  adminSetInstanceAccess,
  adminApplyPermissionProfile,
  adminBulkSetFeaturePermissions,
} from "@/lib/access.functions";

import {
  INSTANCES,
  ALL_FEATURES,
  FEATURE_LABELS,
  type InstanceId,
  type FeatureKey,
} from "@/lib/instances";
import { useMemo, useState } from "react";
import { PERMISSION_PROFILES, profileFeatures } from "@/lib/permission-profiles";
import { Loader2, KeyRound, Search, ShieldCheck, Shield, Check, X, Users, Eye, Layers, CheckSquare, Square, Unlock, Lock, Sparkles } from "lucide-react";
import { useNewFeatures } from "@/hooks/use-new-features";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/permissoes")({
  head: () => ({ meta: [{ title: "Permissões de Usuários — Portal 2P" }] }),
  component: PermissoesPage,
});

// Agrupamento visual das features
const FEATURE_GROUPS: { label: string; keys: FeatureKey[] }[] = [
  {
    label: "Operação",
    keys: ["home", "tarefas", "propostas", "pedidos", "cupons", "dashboards", "dashboards.metas", "atlas"],
  },
  { label: "Clientes", keys: ["clientes.cadastros", "clientes.segmentacao", "clientes.perfil", "clientes.sugestoes", "clientes.ranking"] },
  {
    label: "Carregadores",
    keys: ["cpo.home", "cpo.tarefas", "cpo.clientes", "cpo.propostas", "cpo.pedidos"],
  },
  {
    label: "Moderação",
    keys: ["cpo.produtos", "cpo.comissoes", "cpo.regras"],
  },
  {
    label: "Administração",
    keys: [
      "admin.usuarios",
      "admin.metas",
      "admin.tabelas",
      "admin.permissoes",
      "admin.integracoes",
      "admin.auditoria",
    ],
  },
  { label: "Marketing", keys: ["marketing.home", "marketing.social", "marketing.trafego", "marketing.cohort", "marketing.cac", "marketing.gargalo", "marketing.prevendas", "marketing.metas"] },
];

// Qualquer feature não mapeada acima ainda aparece, para nunca faltar permissão.
const GROUPED_KEYS = new Set(FEATURE_GROUPS.flatMap((g) => g.keys));
const UNGROUPED: FeatureKey[] = (ALL_FEATURES as FeatureKey[]).filter((k) => !GROUPED_KEYS.has(k));
if (UNGROUPED.length > 0) FEATURE_GROUPS.push({ label: "Outros", keys: UNGROUPED });


function PermissoesPage() {
  const { hasRole } = useAuth();
  const list = useServerFn(adminListAccessMatrix);
  const setPerm = useServerFn(adminSetFeaturePermission);
  const setAccess = useServerFn(adminSetInstanceAccess);

  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-access-matrix"],
    queryFn: () => list(),
    staleTime: 30_000,
  });

  const sim = useSimulation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [activeInstance, setActiveInstance] = useState<InstanceId>("solar");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkUserIds, setBulkUserIds] = useState<string[]>([]);
  const [bulkFeatures, setBulkFeatures] = useState<FeatureKey[]>([]);
  const [bulkInstance, setBulkInstance] = useState<InstanceId>("solar");

  const users = q.data?.users ?? [];
  const filteredUsers = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return users;
    return users.filter(
      (u) =>
        (u.full_name ?? "").toLowerCase().includes(s) || (u.email ?? "").toLowerCase().includes(s),
    );
  }, [users, search]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? filteredUsers[0] ?? null,
    [users, filteredUsers, selectedUserId],
  );

  const mut = useMutation({
    mutationFn: (v: {
      user_id: string;
      instance_id: InstanceId;
      feature_key: FeatureKey;
      allowed: boolean;
    }) => setPerm({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["admin-access-matrix"] });
      const prev = qc.getQueryData<any>(["admin-access-matrix"]);
      qc.setQueryData<any>(["admin-access-matrix"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          users: old.users.map((u: any) => {
            if (u.id !== v.user_id) return u;
            const granted = u.granted.filter(
              (d: any) => !(d.instance_id === v.instance_id && d.feature_key === v.feature_key),
            );
            if (v.allowed)
              granted.push({ instance_id: v.instance_id, feature_key: v.feature_key });
            return { ...u, granted };
          }),
        };
      });
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["admin-access-matrix"], ctx.prev);
      toast.error(e?.message ?? "Erro ao salvar permissão");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-access"] });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["admin-access-matrix"] });
    },
  });

  const applyProfile = useServerFn(adminApplyPermissionProfile);
  const profileMut = useMutation({
    mutationFn: ({
      label: _label,
      ...v
    }: {
      user_id: string;
      instance_id: InstanceId;
      feature_keys: FeatureKey[];
      grant_instance: boolean;
      label: string;
    }) => applyProfile({ data: v }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["admin-access-matrix"] });
      qc.invalidateQueries({ queryKey: ["my-access"] });
      toast.success(`Perfil aplicado: ${v.label}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao aplicar perfil"),
  });

  const bulkFn = useServerFn(adminBulkSetFeaturePermissions);
  const bulkMut = useMutation({
    mutationFn: (v: {
      user_ids: string[];
      instance_id: InstanceId;
      feature_keys: FeatureKey[];
      allowed: boolean;
      grant_instance: boolean;
    }) => bulkFn({ data: v }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["admin-access-matrix"] });
      qc.invalidateQueries({ queryKey: ["my-access"] });
      toast.success(
        `${v.allowed ? "Liberadas" : "Bloqueadas"} ${v.feature_keys.length} funcionalidade(s) para ${v.user_ids.length} usuário(s)`,
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro na edição em massa"),
  });

  const { newFeatures, markSeen } = useNewFeatures();

  const accessMut = useMutation({
    mutationFn: (v: { user_id: string; instance_id: InstanceId; allowed: boolean }) =>
      setAccess({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-access-matrix"] });
      qc.invalidateQueries({ queryKey: ["my-access"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar acesso"),
  });



  if (!hasRole("admin")) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-muted-foreground">
          Acesso restrito a administradores.
        </div>
      </AppLayout>
    );
  }

  const instMeta = INSTANCES[activeInstance];
  const userHasInstance = selectedUser?.instances.includes(activeInstance) ?? false;

  function isAllowed(featureKey: FeatureKey): boolean {
    if (!selectedUser) return false;
    if (selectedUser.is_admin) return true;
    return selectedUser.granted.some(
      (d) => d.instance_id === activeInstance && d.feature_key === featureKey,
    );
  }

  function togglePerm(featureKey: FeatureKey, allowed: boolean) {
    if (!selectedUser) return;
    mut.mutate({
      user_id: selectedUser.id,
      instance_id: activeInstance,
      feature_key: featureKey,
      allowed,
    });
  }

  function bulkSet(allowed: boolean) {
    if (!selectedUser) return;
    const features = ALL_FEATURES.filter((f) => instMeta.routes.includes(f));
    features.forEach((f) => {
      if (isAllowed(f) !== allowed) {
        mut.mutate({
          user_id: selectedUser.id,
          instance_id: activeInstance,
          feature_key: f,
          allowed,
        });
      }
    });
    toast.success(allowed ? "Tudo liberado para esta instância" : "Tudo bloqueado nesta instância");
  }

  // Contagem de features liberadas por usuário para badge na lista
  const denyCountByUser = (u: (typeof users)[number]) =>
    u.granted.filter((d) => u.instances.includes(d.instance_id)).length;

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Administração
            </div>
            <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
              <KeyRound className="h-6 w-6 text-primary" /> Permissões de Usuários
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Escolha um usuário à esquerda e configure quais funcionalidades ele vê em cada
              instância. Por padrão, tudo é liberado — desligue o switch para bloquear.
            </p>
          </div>
        </div>

        {newFeatures.length > 0 && (
          <div className="glass rounded-xl p-4 border border-amber-500/40 bg-amber-500/5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-2">
                <Sparkles className="h-5 w-5 text-amber-500 mt-0.5" />
                <div>
                  <div className="font-semibold">
                    {newFeatures.length} nova(s) tela(s) detectada(s) — bloqueadas por padrão
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    Novas telas entram sem acesso para os usuários (exceto administradores).
                    Libere com um clique ou ajuste individualmente abaixo.
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {newFeatures.map((f) => (
                      <Badge
                        key={`${f.instance}:${f.feature}`}
                        variant="outline"
                        className="text-[11px] border-amber-500/40"
                      >
                        {INSTANCES[f.instance].label} · {f.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={bulkMut.isPending}
                  onClick={() => {
                    const byInstance = new Map<InstanceId, FeatureKey[]>();
                    for (const f of newFeatures) {
                      byInstance.set(f.instance, [
                        ...(byInstance.get(f.instance) ?? []),
                        f.feature,
                      ]);
                    }
                    for (const [instance_id, feature_keys] of byInstance) {
                      const ids = users
                        .filter((u) => !u.is_admin && u.instances.includes(instance_id))
                        .map((u) => u.id);
                      if (ids.length === 0) continue;
                      bulkMut.mutate({
                        user_ids: ids,
                        instance_id,
                        feature_keys,
                        allowed: true,
                        grant_instance: false,
                      });
                    }
                    markSeen();
                  }}
                >
                  <Unlock className="h-4 w-4 mr-1.5" /> Liberar para quem já tem a instância
                </Button>
                <Button size="sm" variant="ghost" onClick={() => markSeen()}>
                  Marcar como visto
                </Button>
              </div>
            </div>
          </div>
        )}



        {q.isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
            {/* ------ Lista de usuários ------ */}
            <div className="glass rounded-xl overflow-hidden flex flex-col">
              <div className="p-3 border-b border-border/60">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar usuário…"
                    className="pl-8 h-9"
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> {filteredUsers.length} usuário(s)
                  </span>
                  <button
                    onClick={() => {
                      setBulkMode((v) => !v);
                      setBulkUserIds([]);
                    }}
                    className={cn(
                      "px-2 py-1 rounded-md border text-[11px] transition-colors",
                      bulkMode
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border/60 hover:bg-surface-2/60",
                    )}
                  >
                    {bulkMode ? "Sair do modo massa" : "Editar em massa"}
                  </button>
                </div>
                {bulkMode && (
                  <div className="flex items-center gap-2 mt-2 text-[11px]">
                    <button
                      className="underline text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setBulkUserIds(filteredUsers.filter((u) => !u.is_admin).map((u) => u.id))
                      }
                    >
                      Selecionar todos
                    </button>
                    <button
                      className="underline text-muted-foreground hover:text-foreground"
                      onClick={() => setBulkUserIds([])}
                    >
                      Limpar
                    </button>
                    <span className="ml-auto text-muted-foreground">
                      {bulkUserIds.length} selecionado(s)
                    </span>
                  </div>
                )}
              </div>
              <ScrollArea className="h-[calc(100vh-320px)] min-h-[400px]">
                <ul className="p-2 space-y-1">
                  {filteredUsers.map((u) => {
                    const active = bulkMode
                      ? bulkUserIds.includes(u.id)
                      : selectedUser?.id === u.id;
                    const denials = denyCountByUser(u);
                    return (
                      <li key={u.id}>
                        <button
                          onClick={() => {
                            if (bulkMode) {
                              if (u.is_admin) return;
                              setBulkUserIds((prev) =>
                                prev.includes(u.id)
                                  ? prev.filter((x) => x !== u.id)
                                  : [...prev, u.id],
                              );
                              return;
                            }
                            setSelectedUserId(u.id);
                          }}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2",
                            active
                              ? "bg-primary/10 border border-primary/30"
                              : "hover:bg-surface-2/60 border border-transparent",
                          )}
                        >
                          {bulkMode &&
                            (u.is_admin ? (
                              <Square className="h-4 w-4 shrink-0 opacity-30" />
                            ) : bulkUserIds.includes(u.id) ? (
                              <CheckSquare className="h-4 w-4 shrink-0 text-primary" />
                            ) : (
                              <Square className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ))}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate flex items-center gap-1.5">
                              {u.full_name ?? u.email}
                              {u.is_admin && (
                                <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {u.email}
                            </div>
                          </div>
                          {!u.is_admin && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] h-5"
                              title="Funcionalidades liberadas"
                            >
                              {denials}
                            </Badge>
                          )}
                        </button>
                      </li>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <li className="text-center py-6 text-sm text-muted-foreground">
                      Nenhum usuário encontrado
                    </li>
                  )}
                </ul>
              </ScrollArea>
            </div>

            {/* ------ Painel do usuário selecionado ------ */}
            <div className="space-y-4">
              {bulkMode ? (
                <BulkPanel
                  users={users}
                  bulkUserIds={bulkUserIds}
                  instance={bulkInstance}
                  setInstance={(i) => {
                    setBulkInstance(i);
                    setBulkFeatures([]);
                  }}
                  features={bulkFeatures}
                  setFeatures={setBulkFeatures}
                  pending={bulkMut.isPending}
                  onApply={(allowed) =>
                    bulkMut.mutate({
                      user_ids: bulkUserIds,
                      instance_id: bulkInstance,
                      feature_keys: bulkFeatures,
                      allowed,
                      grant_instance: true,
                    })
                  }
                />
              ) : !selectedUser ? (
                <div className="glass rounded-xl p-10 text-center text-muted-foreground">
                  Selecione um usuário para configurar suas permissões.
                </div>
              ) : (
                <>
                  {/* Header do usuário */}
                  <div className="glass rounded-xl p-5 flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="text-lg font-semibold flex items-center gap-2">
                        {selectedUser.full_name ?? selectedUser.email}
                        {selectedUser.is_admin && (
                          <Badge className="bg-primary/15 text-primary border-primary/30">
                            Administrador
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">{selectedUser.email}</div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 gap-2"
                        onClick={() => {
                          sim.start({
                            id: selectedUser.id,
                            name: selectedUser.full_name ?? selectedUser.email,
                          });
                          navigate({ to: "/" });
                        }}
                      >
                        <Eye className="h-4 w-4" />
                        Simular este usuário
                      </Button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {(Object.values(INSTANCES) as InstanceMeta[]).map((i) => {
                        const has = selectedUser.instances.includes(i.id);
                        return (
                          <button
                            key={i.id}
                            onClick={() => setActiveInstance(i.id)}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-sm border transition-all flex items-center gap-2",
                              activeInstance === i.id
                                ? "border-primary/50 bg-primary/10 text-foreground"
                                : "border-border/60 hover:bg-surface-2/60 text-muted-foreground",
                              !has && "opacity-40",
                            )}
                            title={!has ? "Usuário sem acesso a esta instância" : undefined}
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-sm"
                              style={{ background: i.swatch }}
                            />
                            {i.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Acesso por instância */}
                  <div className="glass rounded-xl p-4">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" /> Acesso às instâncias
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Defina quais instâncias este usuário pode acessar.
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 mt-3">
                      {(Object.values(INSTANCES) as InstanceMeta[]).map((i) => {
                        const has = selectedUser.instances.includes(i.id);
                        return (
                          <label
                            key={i.id}
                            className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border/60 bg-surface-2/40 cursor-pointer"
                          >
                            <span className="flex items-center gap-2 text-sm truncate">
                              <span
                                className="h-2.5 w-2.5 rounded-sm"
                                style={{ background: i.swatch }}
                              />
                              {i.label}
                            </span>
                            <Switch
                              checked={has}
                              disabled={accessMut.isPending}
                              onCheckedChange={(v) =>
                                accessMut.mutate({
                                  user_id: selectedUser.id,
                                  instance_id: i.id,
                                  allowed: v,
                                })
                              }
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Perfis de permissão */}
                  {!selectedUser.is_admin && (
                    <div className="glass rounded-xl p-4">
                      <div className="text-sm font-semibold flex items-center gap-2">
                        <Layers className="h-4 w-4 text-primary" />
                        Perfis de permissão — {instMeta.label}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Aplica um conjunto pronto de acessos nesta instância (substitui o que
                        estiver marcado). Depois é só ajustar as exceções abaixo.
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3 mt-3">
                        {PERMISSION_PROFILES.map((p) => {
                          const keys = profileFeatures(p, activeInstance);
                          const isCurrent =
                            keys.length > 0 &&
                            keys.every((k) => isAllowed(k)) &&
                            instMeta.routes.filter((k) => isAllowed(k)).length === keys.length;
                          return (
                            <button
                              key={p.id}
                              disabled={profileMut.isPending || keys.length === 0}
                              onClick={() =>
                                profileMut.mutate({
                                  user_id: selectedUser.id,
                                  instance_id: activeInstance,
                                  feature_keys: keys,
                                  grant_instance: true,
                                  label: `${p.label} — ${instMeta.label}`,
                                })
                              }
                              className={cn(
                                "text-left rounded-lg border p-3 transition-all disabled:opacity-50",
                                isCurrent
                                  ? "border-primary/50 bg-primary/10"
                                  : "border-border/60 hover:bg-surface-2/60",
                              )}
                            >
                              <div className="text-sm font-medium flex items-center gap-2">
                                {p.label}
                                {isCurrent && (
                                  <Badge className="bg-primary/15 text-primary border-primary/30">
                                    Atual
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {p.description}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-1.5">
                                {keys.length} funcionalidade{keys.length === 1 ? "" : "s"}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}


                  {/* Cartão de permissões */}
                  <div className="glass rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-border/60 flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <div className="text-sm font-semibold flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-sm"
                            style={{ background: instMeta.swatch }}
                          />
                          Funcionalidades em {instMeta.label}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {instMeta.description}
                        </div>
                      </div>
                      {!selectedUser.is_admin && userHasInstance && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => bulkSet(true)}
                            disabled={mut.isPending}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" /> Liberar tudo
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => bulkSet(false)}
                            disabled={mut.isPending}
                          >
                            <X className="h-3.5 w-3.5 mr-1" /> Bloquear tudo
                          </Button>
                        </div>
                      )}
                    </div>

                    {!userHasInstance ? (
                      <div className="p-8 text-center text-sm text-muted-foreground">
                        Este usuário não tem acesso à instância{" "}
                        <strong>{instMeta.label}</strong>. Libere o acesso no bloco{" "}
                        <em>Acesso às instâncias</em> acima antes de configurar permissões.
                      </div>
                    ) : selectedUser.is_admin ? (
                      <div className="p-8 text-center text-sm text-muted-foreground">
                        Administradores têm acesso total a todas as funcionalidades.
                      </div>
                    ) : (
                      <div className="p-4 space-y-5">
                        {FEATURE_GROUPS.map((group) => {
                          const keys = group.keys.filter((k) => instMeta.routes.includes(k));
                          if (keys.length === 0) return null;
                          return (
                            <div key={group.label}>
                              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">
                                {group.label}
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                {keys.map((k) => {
                                  const allowed = isAllowed(k);
                                  return (
                                    <label
                                      key={k}
                                      className={cn(
                                        "flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors",
                                        allowed
                                          ? "border-border/60 bg-surface-2/40 hover:bg-surface-2/70"
                                          : "border-destructive/30 bg-destructive/5 hover:bg-destructive/10",
                                      )}
                                    >
                                      <span className="text-sm truncate">{FEATURE_LABELS[k]}</span>
                                      <Switch
                                        checked={allowed}
                                        onCheckedChange={(v) => togglePerm(k, v)}
                                        disabled={mut.isPending}
                                      />
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

type InstanceMeta = (typeof INSTANCES)[InstanceId];


function BulkPanel({
  users,
  bulkUserIds,
  instance,
  setInstance,
  features,
  setFeatures,
  pending,
  onApply,
}: {
  users: { id: string; email: string; full_name: string | null; is_admin: boolean }[];
  bulkUserIds: string[];
  instance: InstanceId;
  setInstance: (i: InstanceId) => void;
  features: FeatureKey[];
  setFeatures: (f: FeatureKey[]) => void;
  pending: boolean;
  onApply: (allowed: boolean) => void;
}) {
  const meta = INSTANCES[instance];
  const selectedUsers = users.filter((u) => bulkUserIds.includes(u.id));
  const instFeatures = (meta.routes as FeatureKey[]).filter((k) => ALL_FEATURES.includes(k));
  const canApply = bulkUserIds.length > 0 && features.length > 0 && !pending;

  function toggle(k: FeatureKey) {
    setFeatures(features.includes(k) ? features.filter((x) => x !== k) : [...features, k]);
  }

  return (
    <>
      <div className="glass rounded-xl p-5">
        <div className="text-lg font-semibold flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" /> Edição em massa
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Selecione os usuários na lista à esquerda, escolha a instância e as funcionalidades, e
          libere ou bloqueie tudo de uma vez. Administradores são ignorados (já têm acesso total).
        </p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {selectedUsers.length === 0 ? (
            <span className="text-xs text-muted-foreground">Nenhum usuário selecionado.</span>
          ) : (
            selectedUsers.map((u) => (
              <Badge key={u.id} variant="secondary" className="text-[11px]">
                {u.full_name ?? u.email}
              </Badge>
            ))
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-4">
          {(Object.values(INSTANCES) as InstanceMeta[]).map((i) => (
            <button
              key={i.id}
              onClick={() => setInstance(i.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm border transition-all flex items-center gap-2",
                instance === i.id
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border/60 hover:bg-surface-2/60 text-muted-foreground",
              )}
            >
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.swatch }} />
              {i.label}
            </button>
          ))}
        </div>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border/60 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-sm font-semibold flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ background: meta.swatch }} />
              Funcionalidades em {meta.label}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {features.length} de {instFeatures.length} selecionada(s)
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setFeatures(instFeatures)}>
              <Check className="h-3.5 w-3.5 mr-1" /> Marcar todas
            </Button>
            <Button size="sm" variant="outline" onClick={() => setFeatures([])}>
              <X className="h-3.5 w-3.5 mr-1" /> Limpar
            </Button>
          </div>
        </div>
        <div className="p-4 space-y-5">
          {FEATURE_GROUPS.map((group) => {
            const keys = group.keys.filter((k) => instFeatures.includes(k));
            if (keys.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">
                  {group.label}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {keys.map((k) => {
                    const on = features.includes(k);
                    return (
                      <button
                        key={k}
                        onClick={() => toggle(k)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors",
                          on
                            ? "border-primary/50 bg-primary/10"
                            : "border-border/60 bg-surface-2/40 hover:bg-surface-2/70",
                        )}
                      >
                        {on ? (
                          <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="text-sm truncate">{FEATURE_LABELS[k]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-4 border-t border-border/60 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Ao liberar, o acesso à instância {meta.label} também é garantido para os usuários
            selecionados.
          </div>
          <div className="flex gap-2">
            <Button disabled={!canApply} onClick={() => onApply(true)}>
              {pending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Unlock className="h-4 w-4 mr-1.5" />
              )}
              Liberar selecionadas
            </Button>
            <Button variant="destructive" disabled={!canApply} onClick={() => onApply(false)}>
              {pending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Lock className="h-4 w-4 mr-1.5" />
              )}
              Bloquear selecionadas
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
