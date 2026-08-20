/**
 * Matriz de permissões por objeto de um perfil (Basic Access + Manager Access),
 * no estilo Salesforce. As checagens reais acontecem no servidor; aqui é só a
 * administração dos flags.
 */
import { useEffect, useState } from "react";
import { Loader2, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  BASIC_FLAGS,
  emptyPermMap,
  FLAG_LABELS,
  MANAGER_FLAGS,
  normalizePerm,
  OBJECT_KEYS,
  OBJECT_LABELS,
  type ObjectKey,
  type ObjectPerm,
  type ObjectPermMap,
} from "@/lib/object-perms";
import {
  listarObjectPermsPerfilFn,
  salvarObjectPermsPerfilFn,
} from "@/lib/object-perms.functions";

export function ObjectPermsEditor({
  profileId,
  instancia,
  instanciaLabel,
}: {
  profileId: string;
  instancia: string;
  instanciaLabel: string;
}) {
  const listFn = useServerFn(listarObjectPermsPerfilFn);
  const saveFn = useServerFn(salvarObjectPermsPerfilFn);
  const [map, setMap] = useState<ObjectPermMap>(() => emptyPermMap());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listFn({ data: { profileId, instancia } })
      .then((rows) => {
        if (!alive) return;
        const next = emptyPermMap();
        for (const r of rows ?? []) {
          if (OBJECT_KEYS.includes(r.object_key)) {
            const { object_key, ...flags } = r as any;
            next[r.object_key] = { ...next[r.object_key], ...flags };
          }
        }
        setMap(next);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar permissões"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, instancia]);

  function toggle(obj: ObjectKey, flag: keyof ObjectPerm, on: boolean) {
    setMap((cur) => ({ ...cur, [obj]: normalizePerm({ ...cur[obj], [flag]: on }) }));
  }

  async function salvar() {
    setSaving(true);
    try {
      await saveFn({
        data: {
          profileId,
          instancia,
          perms: OBJECT_KEYS.map((k) => ({ object_key: k, ...map[k] })),
        },
      });
      toast.success(`Permissões de objetos salvas em ${instanciaLabel}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="font-medium text-sm">Permissões de objetos — {instanciaLabel}</h3>
            <p className="text-[11px] text-muted-foreground">
              Basic Access define o que o usuário faz nos próprios registros. Manager Access
              libera os registros dos outros consultores.
            </p>
          </div>
        </div>
        <button
          onClick={salvar}
          disabled={saving || loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar objetos
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">Objeto</th>
                {BASIC_FLAGS.map((f) => (
                  <th key={f} className="px-2 py-2 font-medium text-center">
                    {FLAG_LABELS[f]}
                  </th>
                ))}
                {MANAGER_FLAGS.map((f) => (
                  <th key={f} className="px-2 py-2 font-medium text-center whitespace-nowrap">
                    {FLAG_LABELS[f]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OBJECT_KEYS.map((k) => (
                <tr key={k} className="border-t border-border">
                  <td className="py-2 pr-3 whitespace-nowrap">{OBJECT_LABELS[k]}</td>
                  {[...BASIC_FLAGS, ...MANAGER_FLAGS].map((f) => (
                    <td key={f} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        className="accent-[var(--primary)]"
                        checked={map[k][f]}
                        disabled={f === "view_all" && map[k].modify_all}
                        onChange={(e) => toggle(k, f, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
