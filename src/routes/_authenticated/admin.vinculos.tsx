import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminListSfLinks,
  adminSetSfUserId,
  adminAutoMatchSfLinks,
  type SfLinkRow,
} from "@/lib/users.functions";
import { Loader2, Link2, Search, RefreshCw, Wand2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";

export const Route = createFileRoute("/_authenticated/admin/vinculos")({
  head: () => ({
    meta: [
      { title: "Vínculos Salesforce | Portal 2P" },
      {
        name: "description",
        content:
          "Vincule e corrija o ID do Salesforce (sf_user_id) de cada vendedor do Portal 2P.",
      },
      { property: "og:title", content: "Vínculos Salesforce | Portal 2P" },
      {
        property: "og:description",
        content: "Painel administrativo para vincular vendedores aos usuários do Salesforce.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.vinculos">
      <VinculosPage />
    </AdminRouteGuard>
  ),
});

const STATUS_META: Record<
  SfLinkRow["status"],
  { label: string; className: string }
> = {
  ok: { label: "Vinculado", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  missing: { label: "Sem vínculo", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  invalid: { label: "ID inválido", className: "bg-destructive/10 text-destructive border-destructive/30" },
  duplicate: { label: "Duplicado", className: "bg-destructive/10 text-destructive border-destructive/30" },
  mismatch: { label: "E-mail diferente", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
};

function VinculosPage() {
  const list = useServerFn(adminListSfLinks);
  const setLink = useServerFn(adminSetSfUserId);
  const autoMatch = useServerFn(adminAutoMatchSfLinks);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | SfLinkRow["status"]>("todos");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-sf-links"],
    queryFn: () => list({}),
  });

  const saveMut = useMutation({
    mutationFn: (vars: { user_id: string; sf_user_id: string | null }) => setLink({ data: vars }),
    onSuccess: () => {
      toast.success("Vínculo atualizado.");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-sf-links"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
  });

  const autoMut = useMutation({
    mutationFn: () => autoMatch({}),
    onSuccess: (r: { linked: number }) => {
      toast.success(
        r.linked > 0 ? `${r.linked} vínculo(s) criados por e-mail.` : "Nenhum vínculo automático encontrado.",
      );
      qc.invalidateQueries({ queryKey: ["admin-sf-links"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha no auto-vínculo."),
  });

  const rows = data?.rows ?? [];
  const options = data?.options ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "todos" && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.full_name, r.email, r.sf_user_id, r.sf_name, r.cargo]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, search, statusFilter]);

  const counts = useMemo(() => {
    const c = { ok: 0, missing: 0, invalid: 0, duplicate: 0, mismatch: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              Vínculos Salesforce
            </h1>
            <p className="text-sm text-muted-foreground">
              Vincule e corrija o ID do Salesforce de cada vendedor.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => autoMut.mutate()}
              disabled={autoMut.isPending}
            >
              {autoMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Vincular por e-mail
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              Atualizar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {(Object.keys(STATUS_META) as SfLinkRow["status"][]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(statusFilter === s ? "todos" : s)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                statusFilter === s ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/50",
              )}
            >
              <div className="text-xs text-muted-foreground">{STATUS_META[s].label}</div>
              <div className="text-lg font-semibold">{counts[s]}</div>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar por nome, e-mail ou ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {(Object.keys(STATUS_META) as SfLinkRow["status"][]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhum usuário encontrado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Usuário</th>
                    <th className="text-left px-3 py-2">Organização</th>
                    <th className="text-left px-3 py-2">Salesforce</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const isEditing = editing === r.user_id;
                    return (
                      <tr key={r.user_id} className="border-t border-border align-top">
                        <td className="px-3 py-2">
                          <div className="font-medium">{r.full_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{r.email}</div>
                          {!r.ativo && (
                            <Badge variant="outline" className="mt-1 text-[10px]">
                              Inativo
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 capitalize text-muted-foreground">{r.organizacao}</td>
                        <td className="px-3 py-2 min-w-[320px]">
                          {isEditing ? (
                            <div className="space-y-2">
                              <Select
                                value={draft || "__none__"}
                                onValueChange={(v) => setDraft(v === "__none__" ? "" : v)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione o usuário do Salesforce" />
                                </SelectTrigger>
                                <SelectContent className="max-h-72">
                                  <SelectItem value="__none__">— Sem vínculo —</SelectItem>
                                  {options.map((o) => (
                                    <SelectItem key={o.id} value={o.id}>
                                      {o.name} {o.email ? `(${o.email})` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                placeholder="Ou cole o ID (18 caracteres)"
                                className="font-mono text-xs"
                              />
                            </div>
                          ) : (
                            <div>
                              <div className="font-mono text-xs">{r.sf_user_id ?? "—"}</div>
                              <div className="text-xs text-muted-foreground">
                                {r.sf_name ?? "sem correspondência"}
                                {r.sf_email ? ` · ${r.sf_email}` : ""}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={STATUS_META[r.status].className}>
                            {STATUS_META[r.status].label}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                onClick={() =>
                                  saveMut.mutate({
                                    user_id: r.user_id,
                                    sf_user_id: draft.trim() ? draft.trim() : null,
                                  })
                                }
                                disabled={saveMut.isPending}
                              >
                                {saveMut.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                                Salvar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditing(null)}
                                aria-label="Cancelar edição"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditing(r.user_id);
                                setDraft(r.sf_user_id ?? "");
                              }}
                            >
                              {r.sf_user_id ? "Corrigir" : "Vincular"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
