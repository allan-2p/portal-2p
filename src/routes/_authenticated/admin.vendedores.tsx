import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, AlertTriangle, Search, Eye, EyeOff, UserCog } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { listSalespeopleForAdmin, setSalespersonVisibility } from "@/lib/admin.functions";
import { listSfTeams, adminSetSfTeam, type SFTeam } from "@/lib/scope.functions";
import { useAuth } from "@/hooks/use-auth";


export const Route = createFileRoute("/_authenticated/admin/vendedores")({
  head: () => ({ meta: [{ title: "Vendedores — Portal 2P" }] }),
  component: VendedoresPage,
});

function VendedoresPage() {
  const { hasRole } = useAuth();
  const [search, setSearch] = useState("");
  const [onlyHidden, setOnlyHidden] = useState(false);

  const fetchList = useServerFn(listSalespeopleForAdmin);
  const setVisibility = useServerFn(setSalespersonVisibility);
  const fetchTeams = useServerFn(listSfTeams);
  const setTeamFn = useServerFn(adminSetSfTeam);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin-salespeople"],
    queryFn: () => fetchList(),
    staleTime: 60_000,
    enabled: hasRole("admin"),
  });

  const teamsQ = useQuery({
    queryKey: ["sf-teams"],
    queryFn: () => fetchTeams(),
    staleTime: 60_000,
    enabled: hasRole("admin"),
  });

  const teamMap = useMemo(() => {
    const m = new Map<string, SFTeam>();
    for (const r of teamsQ.data?.rows ?? []) m.set(r.sf_user_id, r.team);
    return m;
  }, [teamsQ.data]);

  const mut = useMutation({
    mutationFn: (v: { sf_user_id: string; hidden: boolean }) =>
      setVisibility({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-salespeople"] });
      qc.invalidateQueries({ queryKey: ["sf-salespeople"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const teamMut = useMutation({
    mutationFn: (v: { sf_user_id: string; team: SFTeam | null }) =>
      setTeamFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sf-teams"] });
      qc.invalidateQueries({ queryKey: ["my-scope"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar equipe"),
  });


  const people = q.data?.records ?? [];
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return people.filter((p) => {
      if (onlyHidden && !p.hidden) return false;
      if (!s) return true;
      return (
        p.name.toLowerCase().includes(s) ||
        (p.email ?? "").toLowerCase().includes(s) ||
        (p.title ?? "").toLowerCase().includes(s)
      );
    });
  }, [people, search, onlyHidden]);

  const hiddenCount = people.filter((p) => p.hidden).length;

  if (!hasRole("admin")) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <UserCog className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <h1 className="font-display font-bold text-xl">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground mt-1">Somente administradores podem gerenciar vendedores.</p>
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
            <h1 className="text-3xl font-bold mt-1">Vendedores</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Escolha quais vendedores do Salesforce ficam visíveis nos filtros do portal.
              {people.length > 0 && <> {hiddenCount} de {people.length} ocultos.</>}
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
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border text-sm cursor-pointer">
              <Switch checked={onlyHidden} onCheckedChange={setOnlyHidden} />
              <span className="text-muted-foreground">Somente ocultos</span>
            </label>
          </div>
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
                  <th className="text-left px-4 py-2.5 w-40">Equipe</th>
                  <th className="text-center px-4 py-2.5 w-32">Status</th>
                  <th className="text-center px-4 py-2.5 w-40">Aparece no portal?</th>
                </tr>

              </thead>
              <tbody>
                {q.isLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground text-sm">
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2 align-middle" />
                      Carregando vendedores do Salesforce…
                    </td>
                  </tr>
                )}
                {!q.isLoading && filtered.map((p) => {
                  const visible = !p.hidden;
                  const busy = mut.isPending && mut.variables?.sf_user_id === p.id;
                  return (
                    <tr key={p.id} className="border-b border-border/40 hover:bg-surface-2/50">
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.email ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.title ?? "—"}</td>
                      <td className="px-4 py-3 text-center">
                        {visible ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-success/15 text-success">
                            <Eye className="h-3 w-3" /> Visível
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                            <EyeOff className="h-3 w-3" /> Oculto
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex items-center gap-2">
                          {busy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                          <Switch
                            checked={visible}
                            disabled={mut.isPending}
                            onCheckedChange={(v) =>
                              mut.mutate({ sf_user_id: p.id, hidden: !v })
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!q.isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
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
