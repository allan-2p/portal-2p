import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminListAccessMatrix, adminSetFeaturePermission } from "@/lib/access.functions";
import { INSTANCES, ALL_FEATURES, FEATURE_LABELS, type InstanceId, type FeatureKey } from "@/lib/instances";
import { useState } from "react";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/permissoes")({
  head: () => ({ meta: [{ title: "Permissões de Usuários — Portal 2P" }] }),
  component: PermissoesPage,
});

function PermissoesPage() {
  const { hasRole } = useAuth();
  const list = useServerFn(adminListAccessMatrix);
  const setPerm = useServerFn(adminSetFeaturePermission);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-access-matrix"], queryFn: () => list(), staleTime: 30_000 });
  const [inst, setInst] = useState<InstanceId>("solar");
  const mut = useMutation({
    mutationFn: (v: { user_id: string; instance_id: InstanceId; feature_key: FeatureKey; allowed: boolean }) =>
      setPerm({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-access-matrix"] });
      qc.invalidateQueries({ queryKey: ["my-access"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  if (!hasRole("admin")) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-muted-foreground">Acesso restrito a administradores.</div>
      </AppLayout>
    );
  }

  const instMeta = INSTANCES[inst];
  const instFeatures = ALL_FEATURES.filter((f) => instMeta.routes.includes(f));

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Administração</div>
            <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
              <KeyRound className="h-6 w-6 text-primary" /> Permissões de Usuários
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Por padrão todos os usuários com acesso à instância veem tudo. Desmarque uma célula para <strong>bloquear</strong> aquela funcionalidade para o usuário.
            </p>
          </div>
          <Tabs value={inst} onValueChange={(v) => setInst(v as InstanceId)}>
            <TabsList>
              {(Object.values(INSTANCES) as (typeof INSTANCES)[InstanceId][]).map((i) => (
                <TabsTrigger key={i.id} value={i.id}>
                  <span className="h-2 w-2 rounded-sm mr-1.5" style={{ background: i.swatch }} />
                  {i.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <Tabs value={inst} onValueChange={(v) => setInst(v as InstanceId)}>
          {(Object.values(INSTANCES) as (typeof INSTANCES)[InstanceId][]).map((i) => (
            <TabsContent key={i.id} value={i.id} className="mt-0">
              {q.isLoading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
                </div>
              ) : (
                <div className="glass rounded-xl overflow-auto max-h-[70vh]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface-2/95 backdrop-blur">
                      <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="text-left px-4 py-3 sticky left-0 bg-surface-2/95 z-10 min-w-[220px]">Usuário</th>
                        {instFeatures.map((f) => (
                          <th key={f} className="px-2 py-3 text-center whitespace-nowrap font-normal">
                            <div className="rotate-[-30deg] origin-bottom-left inline-block text-[11px]">
                              {FEATURE_LABELS[f]}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(q.data?.users ?? [])
                        .filter((u) => u.instances.includes(i.id))
                        .map((u) => (
                          <tr key={u.id} className="border-t border-border">
                            <td className="px-4 py-2 sticky left-0 bg-background/95 z-10">
                              <div className="font-medium">{u.full_name ?? u.email}</div>
                              <div className="text-xs text-muted-foreground">{u.email}</div>
                            </td>
                            {instFeatures.map((f) => {
                              const denied = u.denied.some((d) => d.instance_id === i.id && d.feature_key === f);
                              const allowed = !denied;
                              return (
                                <td key={f} className="px-2 py-1.5 text-center">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-primary"
                                    checked={allowed}
                                    onChange={(e) =>
                                      mut.mutate({
                                        user_id: u.id,
                                        instance_id: i.id,
                                        feature_key: f,
                                        allowed: e.target.checked,
                                      })
                                    }
                                    disabled={mut.isPending || u.is_admin}
                                    title={u.is_admin ? "Administradores têm acesso total" : undefined}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppLayout>
  );
}
