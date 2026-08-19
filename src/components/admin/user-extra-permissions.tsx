import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { adminGetUserExtraFeatures } from "@/lib/access.functions";
import {
  INSTANCES,
  INSTANCE_IDS,
  FEATURE_LABELS,
  type FeatureKey,
  type InstanceId,
} from "@/lib/instances";

export type ExtraFeature = { instance_id: string; feature_key: string };

const keyOf = (e: ExtraFeature) => `${e.instance_id}::${e.feature_key}`;

/**
 * Permissões extras do usuário — somam-se ao perfil de permissão.
 * Vive apenas no cadastro do usuário (não altera o perfil).
 */
export function UserExtraPermissions({
  userId,
  value,
  onChange,
}: {
  userId: string;
  value: ExtraFeature[];
  onChange: (next: ExtraFeature[]) => void;
}) {
  const getExtras = useServerFn(adminGetUserExtraFeatures);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<InstanceId>(INSTANCE_IDS[0] as InstanceId);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getExtras({ data: { user_id: userId } })
      .then((res) => alive && onChange(res.features))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const selecionadas = useMemo(() => new Set(value.map(keyOf)), [value]);

  const features = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (INSTANCES[aberta].routes as FeatureKey[]).filter((f) =>
      !termo ? true : (FEATURE_LABELS[f] ?? f).toLowerCase().includes(termo) || f.includes(termo),
    );
  }, [aberta, busca]);

  function toggle(feature: FeatureKey) {
    const item = { instance_id: aberta as string, feature_key: feature as string };
    const k = keyOf(item);
    onChange(selecionadas.has(k) ? value.filter((v) => keyOf(v) !== k) : [...value, item]);
  }

  return (
    <div className="pt-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Permissões extras (além do perfil)
        </div>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            Limpar {value.length}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando permissões…
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex flex-wrap gap-1 p-2 border-b border-border bg-muted/40">
            {INSTANCE_IDS.map((id) => {
              const qtd = value.filter((v) => v.instance_id === id).length;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAberta(id as InstanceId)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
                    aberta === id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {INSTANCES[id as InstanceId].label}
                  {qtd > 0 ? ` (${qtd})` : ""}
                </button>
              );
            })}
          </div>

          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar tela…"
                className="input pl-8 h-9 text-sm"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-border/60">
            {features.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Nenhuma tela encontrada.</p>
            ) : (
              features.map((f) => {
                const checked = selecionadas.has(`${aberta}::${f}`);
                return (
                  <label
                    key={f}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent/50"
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(f)} />
                    <span className={checked ? "font-medium" : ""}>{FEATURE_LABELS[f] ?? f}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Estas telas ficam liberadas só para este usuário, sem alterar o perfil de permissão.
      </p>
    </div>
  );
}
