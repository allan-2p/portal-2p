import { Fragment, useMemo, useState } from "react";
import { Check, Minus, ChevronRight, ChevronDown } from "lucide-react";
import {
  INSTANCES,
  INSTANCE_IDS,
  FEATURE_LABELS,
  type FeatureKey,
  type InstanceId,
} from "@/lib/instances";
import {
  FEATURE_GROUPS,
  featuresForAreaAccessKey,
  shortFeatureLabel,
} from "@/lib/feature-groups";
import {
  CAPABILITIES,
  capabilitiesForFeature,
  type CapabilityId,
} from "@/lib/feature-capabilities";
import type { PermissionProfile } from "@/lib/permission-profiles.functions";

/** Telas efetivas de um perfil dentro de uma instância. */
function effectiveFeatures(profile: PermissionProfile, instance: InstanceId): Set<FeatureKey> {
  const routes = INSTANCES[instance].routes;
  if (profile.is_full_access) return new Set(routes);
  const set = new Set<FeatureKey>();
  for (const f of profile.features) {
    if (f.instance_id !== instance) continue;
    const key = f.feature_key as FeatureKey;
    set.add(key);
    for (const sub of featuresForAreaAccessKey(key)) set.add(sub);
  }
  return new Set([...set].filter((k) => routes.includes(k)));
}

function CapCell({ on }: { on: boolean }) {
  return (
    <div className="flex justify-center">
      {on ? (
        <Check className="h-4 w-4 text-primary" />
      ) : (
        <Minus className="h-3.5 w-3.5 text-muted-foreground/50" />
      )}
    </div>
  );
}

export function PermissionMatrix({ profiles }: { profiles: PermissionProfile[] }) {
  const [instance, setInstance] = useState<InstanceId>("solar");
  const [view, setView] = useState<"perfil" | "comparar">("perfil");
  const [profileId, setProfileId] = useState<string>(profiles[0]?.id ?? "");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const profile = useMemo(
    () => profiles.find((p) => p.id === profileId) ?? profiles[0] ?? null,
    [profiles, profileId],
  );

  const groups = useMemo(() => {
    const routes = INSTANCES[instance].routes;
    return FEATURE_GROUPS.map((g) => ({
      group: g,
      keys: g.keys.filter((k) => routes.includes(k)),
    })).filter((g) => g.keys.length > 0);
  }, [instance]);

  const granted = useMemo(
    () => (profile ? effectiveFeatures(profile, instance) : new Set<FeatureKey>()),
    [profile, instance],
  );

  function toggleOpen(id: string) {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-xl p-4 space-y-3">
        <div>
          <h2 className="font-display font-semibold text-lg">Matriz de permissões</h2>
          <p className="text-sm text-muted-foreground">
            O que cada perfil pode fazer, por categoria e por tipo de ação. Derivada das telas
            liberadas em cada perfil.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-sm w-fit">
            {(
              [
                ["perfil", "Um perfil"],
                ["comparar", "Comparar perfis"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  view === id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {view === "perfil" && (
            <select
              value={profile?.id ?? ""}
              onChange={(e) => setProfileId(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {CAPABILITIES.map((c) => (
            <span key={c.id}>
              <span className="font-medium text-foreground">{c.label}:</span> {c.description}
            </span>
          ))}
        </div>
      </div>

      {view === "perfil" ? (
        !profile ? (
          <div className="glass rounded-xl p-6 text-sm text-muted-foreground text-center">
            Nenhum perfil criado.
          </div>
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Categoria / tela</th>
                  {CAPABILITIES.map((c) => (
                    <th key={c.id} className="px-3 py-2 font-medium w-24 text-center">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(({ group, keys }) => {
                  const on = keys.filter((k) => granted.has(k));
                  const isOpen = open.has(group.id);
                  const groupCaps = new Set<CapabilityId>();
                  for (const k of on) for (const c of capabilitiesForFeature(k)) groupCaps.add(c);
                  return (
                    <Fragment key={group.id}>
                      <tr
                        onClick={() => toggleOpen(group.id)}
                        className="border-t border-border cursor-pointer hover:bg-surface-2"
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="font-medium">{group.label}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                on.length
                                  ? "bg-primary/15 text-primary"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {on.length}/{keys.length} telas
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground ml-6">
                            {group.description}
                          </div>
                        </td>
                        {CAPABILITIES.map((c) => (
                          <td key={c.id} className="px-3 py-2.5">
                            <CapCell on={groupCaps.has(c.id)} />
                          </td>
                        ))}
                      </tr>
                      {isOpen &&
                        keys.map((k) => {
                          const has = granted.has(k);
                          const caps = capabilitiesForFeature(k);
                          return (
                            <tr
                              key={`${group.id}-${k}`}
                              className={`border-t border-border/60 ${has ? "" : "opacity-50"}`}
                            >
                              <td className="px-3 py-2 pl-10">
                                <span className="truncate">{shortFeatureLabel(k)}</span>
                                <span className="ml-2 text-[10px] text-muted-foreground">
                                  {FEATURE_LABELS[k]}
                                </span>
                              </td>
                              {CAPABILITIES.map((c) => (
                                <td key={c.id} className="px-3 py-2">
                                  <CapCell on={has && caps.includes(c.id)} />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="glass rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium sticky left-0 bg-surface-2">
                  Perfil
                </th>
                {groups.map(({ group }) => (
                  <th key={group.id} className="px-3 py-2 font-medium text-center min-w-[150px]">
                    {group.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => {
                const g = effectiveFeatures(p, instance);
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-2.5 font-medium sticky left-0 bg-background">
                      {p.name}
                      {p.is_full_access && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                          acesso total
                        </span>
                      )}
                    </td>
                    {groups.map(({ group, keys }) => {
                      const on = keys.filter((k) => g.has(k));
                      const caps = new Set<CapabilityId>();
                      for (const k of on) for (const c of capabilitiesForFeature(k)) caps.add(c);
                      return (
                        <td key={group.id} className="px-3 py-2.5 text-center">
                          {caps.size === 0 ? (
                            <span className="text-xs text-muted-foreground">sem acesso</span>
                          ) : (
                            <div className="flex flex-wrap justify-center gap-1">
                              {CAPABILITIES.filter((c) => caps.has(c.id)).map((c) => (
                                <span
                                  key={c.id}
                                  title={c.description}
                                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary"
                                >
                                  {c.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {profiles.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={groups.length + 1}>
                    Nenhum perfil criado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
