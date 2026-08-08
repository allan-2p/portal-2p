import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminListAccessMatrix, adminSetFeaturePermission } from "@/lib/access.functions";
import {
  INSTANCES,
  ALL_FEATURES,
  FEATURE_LABELS,
  type InstanceId,
  type FeatureKey,
} from "@/lib/instances";
import { useMemo, useState } from "react";
import { Loader2, KeyRound, Search, ShieldCheck, Check, X, Users } from "lucide-react";
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
  { label: "Operação", keys: ["home", "tarefas", "pedidos", "cupons", "dashboards", "atlas"] },
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
      "admin.vendedores",
      "admin.metas",
      "admin.tabelas",
      "admin.integracoes",
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
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-access-matrix"],
    queryFn: () => list(),
    staleTime: 30_000,
  });

  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [activeInstance, setActiveInstance] = useState<InstanceId>("solar");

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
            const denied = u.denied.filter(
              (d: any) => !(d.instance_id === v.instance_id && d.feature_key === v.feature_key),
            );
            if (!v.allowed)
              denied.push({ instance_id: v.instance_id, feature_key: v.feature_key });
            return { ...u, denied };
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
    return !selectedUser.denied.some(
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

  // Contagem denial por usuário para badge na lista
  const denyCountByUser = (u: (typeof users)[number]) =>
    u.denied.filter((d) => u.instances.includes(d.instance_id)).length;

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
                <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> {filteredUsers.length} usuário(s)
                </div>
              </div>
              <ScrollArea className="h-[calc(100vh-320px)] min-h-[400px]">
                <ul className="p-2 space-y-1">
                  {filteredUsers.map((u) => {
                    const active = selectedUser?.id === u.id;
                    const denials = denyCountByUser(u);
                    return (
                      <li key={u.id}>
                        <button
                          onClick={() => setSelectedUserId(u.id)}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2",
                            active
                              ? "bg-primary/10 border border-primary/30"
                              : "hover:bg-surface-2/60 border border-transparent",
                          )}
                        >
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
                          {denials > 0 && !u.is_admin && (
                            <Badge variant="secondary" className="text-[10px] h-5">
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
              {!selectedUser ? (
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
                        <strong>{instMeta.label}</strong>. Libere o acesso em{" "}
                        <em>Acessos por Instância</em> antes de configurar permissões.
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
