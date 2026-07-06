import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminListAccessMatrix, adminSetInstanceAccess } from "@/lib/access.functions";
import { INSTANCES, type InstanceId } from "@/lib/instances";
import { Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/acessos-instancias")({
  head: () => ({ meta: [{ title: "Acessos por Instância — Portal 2P" }] }),
  component: AcessosPage,
});

function AcessosPage() {
  const { hasRole } = useAuth();
  const list = useServerFn(adminListAccessMatrix);
  const setAccess = useServerFn(adminSetInstanceAccess);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-access-matrix"], queryFn: () => list(), staleTime: 30_000 });
  const mut = useMutation({
    mutationFn: (v: { user_id: string; instance_id: InstanceId; allowed: boolean }) =>
      setAccess({ data: v }),
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

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Administração</div>
            <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" /> Acessos por Instância
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Defina quais instâncias cada usuário pode acessar.
            </p>
          </div>
        </div>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
          </div>
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-4 py-3">Usuário</th>
                  {(Object.values(INSTANCES) as (typeof INSTANCES)[InstanceId][]).map((i) => (
                    <th key={i.id} className="px-3 py-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.swatch }} />
                        {i.label}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(q.data?.users ?? []).map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{u.full_name ?? u.email}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    {(Object.values(INSTANCES) as (typeof INSTANCES)[InstanceId][]).map((i) => {
                      const allowed = u.instances.includes(i.id);
                      return (
                        <td key={i.id} className="px-3 py-2 text-center">
                          <label className="inline-flex items-center justify-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary"
                              checked={allowed}
                              onChange={(e) =>
                                mut.mutate({
                                  user_id: u.id,
                                  instance_id: i.id,
                                  allowed: e.target.checked,
                                })
                              }
                              disabled={mut.isPending}
                            />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
