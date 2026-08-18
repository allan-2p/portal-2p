import { INSTANCES, ALL_FEATURES, FEATURE_LABELS, type FeatureKey, type InstanceId } from "@/lib/instances";

/** Feature que precisa de outra ligada para aparecer no menu. */
export const MENU_PARENT: Partial<Record<FeatureKey, FeatureKey>> = {
  "dashboards.metas": "dashboards",
  "clientes.sugestoes": "atlas",
};

/** Porta de entrada (home) de cada instância. */
export const INSTANCE_HOME: Record<InstanceId, FeatureKey> = {
  solar: "home",
  carregadores: "carregadores.home",
  marketing: "marketing.home",
};

export type AccessUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  is_admin: boolean;
  instances: string[];
  granted: { instance_id: string; feature_key: string }[];
};

export type ConflictKind = "orphan_instance" | "missing_parent" | "no_home" | "invalid_feature";

export type Conflict = {
  id: string;
  kind: ConflictKind;
  severity: "alta" | "media";
  user_id: string;
  user_label: string;
  instance_id: InstanceId;
  feature_keys: FeatureKey[];
  title: string;
  detail: string;
  /** Sugestão automática aplicável em 1 clique. */
  fix:
    | { type: "grant_instance" }
    | { type: "grant_features"; features: FeatureKey[] }
    | { type: "revoke_features"; features: FeatureKey[] };
  fixLabel: string;
};

export const CONFLICT_KIND_LABEL: Record<ConflictKind, string> = {
  orphan_instance: "Permissão sem instância",
  missing_parent: "Menu inacessível",
  no_home: "Sem porta de entrada",
  invalid_feature: "Permissão órfã",
};

const label = (u: AccessUser) => u.full_name ?? u.email ?? u.id.slice(0, 8);

/**
 * Analisa a matriz de acessos e retorna inconsistências + sugestões automáticas.
 * Administradores são ignorados (têm acesso total por definição).
 */
export function detectPermissionConflicts(users: AccessUser[]): Conflict[] {
  const out: Conflict[] = [];
  const instanceIds = Object.keys(INSTANCES) as InstanceId[];

  for (const u of users) {
    if (u.is_admin) continue;
    const name = label(u);

    for (const inst of instanceIds) {
      const meta = INSTANCES[inst];
      const granted = u.granted
        .filter((g) => g.instance_id === inst)
        .map((g) => g.feature_key as FeatureKey);
      const has = (f: FeatureKey) => granted.includes(f);
      const hasInstance = u.instances.includes(inst);

      // 1) Permissões concedidas numa instância à qual o usuário não tem acesso
      if (!hasInstance && granted.length > 0) {
        out.push({
          id: `${u.id}:${inst}:orphan`,
          kind: "orphan_instance",
          severity: "alta",
          user_id: u.id,
          user_label: name,
          instance_id: inst,
          feature_keys: granted,
          title: `${name} tem ${granted.length} permissão(ões) em ${meta.label}, mas não tem acesso à instância`,
          detail:
            "As telas liberadas nunca aparecem porque a instância está bloqueada para este usuário.",
          fix: { type: "grant_instance" },
          fixLabel: `Liberar acesso à instância ${meta.label}`,
        });
        continue; // demais checagens só fazem sentido com a instância liberada
      }
      if (!hasInstance) continue;

      // 2) Features fora do escopo da instância
      const invalid = granted.filter((f) => !meta.routes.includes(f));
      if (invalid.length > 0) {
        out.push({
          id: `${u.id}:${inst}:invalid`,
          kind: "invalid_feature",
          severity: "media",
          user_id: u.id,
          user_label: name,
          instance_id: inst,
          feature_keys: invalid,
          title: `${name} tem permissões que não existem em ${meta.label}`,
          detail: `Sem efeito prático: ${invalid
            .map((f) => FEATURE_LABELS[f] ?? f)
            .join(", ")}.`,
          fix: { type: "revoke_features", features: invalid },
          fixLabel: "Remover permissões sem efeito",
        });
      }

      const usable = granted.filter((f) => meta.routes.includes(f));
      if (usable.length === 0) continue;

      // 3) Filhos de menu sem o pai liberado → caminho inacessível
      const missingParents: FeatureKey[] = [];
      const orphanChildren: FeatureKey[] = [];
      for (const f of usable) {
        const parent = MENU_PARENT[f];
        if (parent && meta.routes.includes(parent) && !has(parent)) {
          missingParents.push(parent);
          orphanChildren.push(f);
        }
      }
      if (orphanChildren.length > 0) {
        const uniqueParents = Array.from(new Set(missingParents));
        out.push({
          id: `${u.id}:${inst}:parent`,
          kind: "missing_parent",
          severity: "alta",
          user_id: u.id,
          user_label: name,
          instance_id: inst,
          feature_keys: orphanChildren,
          title: `${name}: ${orphanChildren
            .map((f) => FEATURE_LABELS[f] ?? f)
            .join(", ")} não aparece no menu`,
          detail: `O item fica dentro de ${uniqueParents
            .map((f) => FEATURE_LABELS[f] ?? f)
            .join(", ")}, que está bloqueado.`,
          fix: { type: "grant_features", features: uniqueParents },
          fixLabel: `Liberar ${uniqueParents.map((f) => FEATURE_LABELS[f] ?? f).join(", ")}`,
        });
      }

      // 4) Instância liberada e telas liberadas, mas sem home → cai em tela vazia ao entrar
      const home = INSTANCE_HOME[inst];
      if (meta.routes.includes(home) && !has(home)) {
        out.push({
          id: `${u.id}:${inst}:home`,
          kind: "no_home",
          severity: "media",
          user_id: u.id,
          user_label: name,
          instance_id: inst,
          feature_keys: [home],
          title: `${name} não tem a página inicial de ${meta.label}`,
          detail:
            "Ao trocar para esta instância o usuário não encontra uma tela inicial liberada.",
          fix: { type: "grant_features", features: [home] },
          fixLabel: `Liberar ${FEATURE_LABELS[home] ?? home}`,
        });
      }
    }
  }

  // Mais graves primeiro, depois por usuário
  const rank = { alta: 0, media: 1 } as const;
  return out.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.user_label.localeCompare(b.user_label),
  );
}

export const ALL_FEATURE_KEYS = ALL_FEATURES as FeatureKey[];
