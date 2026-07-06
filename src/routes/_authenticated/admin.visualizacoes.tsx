import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { useAuth, ROLE_LABELS, type AppRole } from "@/hooks/use-auth";
import {
  listVariantRoutings,
  adminUpsertVariantRouting,
  adminDeleteVariantRouting,
  type VariantRow,
} from "@/lib/views.functions";
import { SCREENS, PERSONAS, type ScreenKey } from "@/lib/view-screens";
import { INSTANCE_IDS, INSTANCES, type InstanceId } from "@/lib/instances";
import { Loader2, Plus, Trash2, Eye, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/visualizacoes")({
  head: () => ({ meta: [{ title: "Visualizações — Portal 2P" }] }),
  component: AdminVisualizacoesPage,
});

const ROLES: AppRole[] = ["admin", "diretor", "gerente", "marketing", "vendedor"];

function AdminVisualizacoesPage() {
  const { hasRole, loading } = useAuth();
  const qc = useQueryClient();
  const fetchList = useServerFn(listVariantRoutings);
  const upsertFn = useServerFn(adminUpsertVariantRouting);
  const deleteFn = useServerFn(adminDeleteVariantRouting);

  const listQ = useQuery({
    queryKey: ["view-routings"],
    queryFn: () => fetchList(),
    staleTime: 60_000,
  });

  const upsertMut = useMutation({
    mutationFn: (row: Partial<VariantRow>) =>
      upsertFn({
        data: {
          id: row.id,
          screen: row.screen!,
          role: (row.role as any) ?? null,
          cargo: row.cargo ?? null,
          instance_id: (row.instance_id as any) ?? null,
          variant_key: row.variant_key!,
          label: row.label ?? null,
          enabled: row.enabled ?? true,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["view-routings"] });
      toast.success("Roteamento salvo");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["view-routings"] });
      toast.success("Regra removida");
    },
  });

  const [screen, setScreen] = useState<ScreenKey>("home");
  const rows = useMemo(
    () => (listQ.data ?? []).filter((r) => r.screen === screen),
    [listQ.data, screen],
  );

  if (loading) {
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
        <div className="max-w-xl mx-auto text-center py-20">
          <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold">Somente administradores</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Esta página configura quais variantes de tela cada Papel/Cargo enxerga.
          </p>
        </div>
      </AppLayout>
    );
  }

  const screenMeta = SCREENS.find((s) => s.key === screen)!;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <header>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Eye className="h-3.5 w-3.5" /> Admin · Visualizações
          </div>
          <h1 className="text-3xl font-bold mt-1">Versões de tela</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Cada tela expõe um conjunto de <b>variantes</b> (criadas em código). Aqui você define
            qual variante um Papel + Cargo + Instância deve receber por padrão. O usuário sempre
            pode sobrescrever com o toggle <b>“Ver como…”</b> no header.
          </p>
        </header>

        {/* Seletor de tela */}
        <div className="flex flex-wrap gap-2">
          {SCREENS.map((s) => (
            <button
              key={s.key}
              onClick={() => setScreen(s.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm border transition-colors",
                screen === s.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-surface hover:bg-surface-2 border-border",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <div className="font-display font-semibold">{screenMeta.label}</div>
              <div className="text-xs text-muted-foreground">{screenMeta.description}</div>
            </div>
            <button
              onClick={() =>
                upsertMut.mutate({
                  screen,
                  role: null,
                  cargo: null,
                  instance_id: null,
                  variant_key: "default",
                  label: null,
                  enabled: true,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" /> Nova regra
            </button>
          </div>

          {listQ.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-14 px-6">
              Nenhuma regra cadastrada — o resolvedor cai automaticamente na variante <b>default</b>.
              Adicione uma regra para direcionar um Papel/Cargo específico a outra variante.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2">Papel</th>
                    <th className="text-left px-4 py-2">Cargo</th>
                    <th className="text-left px-4 py-2">Instância</th>
                    <th className="text-left px-4 py-2">Variante</th>
                    <th className="text-left px-4 py-2">Rótulo</th>
                    <th className="text-left px-4 py-2 w-20">Ativa</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <RoutingRow
                      key={r.id}
                      row={r}
                      onSave={(next) => upsertMut.mutate({ ...next, id: r.id })}
                      onDelete={() => deleteMut.mutate(r.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="font-display font-semibold mb-2">Personas disponíveis</div>
          <div className="text-xs text-muted-foreground mb-3">
            Use estas chaves em <code className="text-foreground">variant_key</code> para direcionar cada Papel/Cargo. Também aparecem no toggle “Ver como…”.
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {PERSONAS.map((p) => (
              <div key={p.key} className="border border-border rounded-lg p-2.5">
                <div className="font-mono text-[11px] text-primary">{p.key}</div>
                <div className="text-sm font-medium">{p.label}</div>
                {p.description && (
                  <div className="text-[11px] text-muted-foreground">{p.description}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function RoutingRow({
  row,
  onSave,
  onDelete,
}: {
  row: VariantRow;
  onSave: (next: Partial<VariantRow>) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<VariantRow>(row);
  const dirty =
    draft.role !== row.role ||
    draft.cargo !== row.cargo ||
    draft.instance_id !== row.instance_id ||
    draft.variant_key !== row.variant_key ||
    draft.label !== row.label ||
    draft.enabled !== row.enabled;

  const update = (patch: Partial<VariantRow>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <tr className="border-t border-border">
      <td className="px-4 py-2">
        <select
          value={draft.role ?? ""}
          onChange={(e) => update({ role: (e.target.value || null) as any })}
          className="bg-transparent border border-border rounded-md px-2 py-1 text-sm"
        >
          <option value="">— qualquer —</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2">
        <input
          value={draft.cargo ?? ""}
          onChange={(e) => update({ cargo: e.target.value || null })}
          placeholder="qualquer"
          className="bg-transparent border border-border rounded-md px-2 py-1 text-sm w-32"
        />
      </td>
      <td className="px-4 py-2">
        <select
          value={draft.instance_id ?? ""}
          onChange={(e) => update({ instance_id: (e.target.value || null) as any })}
          className="bg-transparent border border-border rounded-md px-2 py-1 text-sm"
        >
          <option value="">— qualquer —</option>
          {INSTANCE_IDS.map((i) => (
            <option key={i} value={i}>
              {INSTANCES[i as InstanceId].label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2">
        <input
          value={draft.variant_key}
          onChange={(e) => update({ variant_key: e.target.value })}
          list="persona-keys"
          className="bg-transparent border border-border rounded-md px-2 py-1 text-sm w-40 font-mono text-xs"
        />
        <datalist id="persona-keys">
          {PERSONAS.map((p) => (
            <option key={p.key} value={p.key} />
          ))}
        </datalist>
      </td>
      <td className="px-4 py-2">
        <input
          value={draft.label ?? ""}
          onChange={(e) => update({ label: e.target.value || null })}
          placeholder="opcional"
          className="bg-transparent border border-border rounded-md px-2 py-1 text-sm w-40"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
      </td>
      <td className="px-4 py-2 flex items-center gap-1">
        {dirty && (
          <button
            onClick={() => onSave(draft)}
            className="px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs"
          >
            Salvar
          </button>
        )}
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title="Remover"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
