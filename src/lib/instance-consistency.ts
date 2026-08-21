// Validação automática de consistência de visibilidade entre instâncias.
//
// Regra: tudo que é do Grupo 2P (Administração / Configurações) e está
// disponível no Solar deve aparecer igualmente em Carregadores e Marketing
// para administradores. Nenhuma divergência é aceita.

import { INSTANCES, INSTANCE_IDS, ROUTE_FEATURE, FEATURE_LABELS, type FeatureKey, type InstanceId } from "@/lib/instances";

/** Features de grupo: presentes em todas as instâncias, sem exceção. */
export function isGroupFeature(key: FeatureKey): boolean {
  return key.startsWith("admin.");
}

/**
 * Features de grupo que são permissões (capabilities) e não telas navegáveis:
 * não têm rota própria em ROUTE_FEATURE por definição — governam botões,
 * abas e áreas dentro de outras telas. Elas continuam sendo validadas quanto
 * à presença em todas as instâncias e ao rótulo.
 */
export const CAPABILITY_FEATURES: FeatureKey[] = [
  "admin.logs.exportar",
  "admin.sistema.excluir",
  "admin.clientes.integracoes",
  "admin.area.integracoes",
];

export function isCapabilityFeature(key: FeatureKey): boolean {
  return CAPABILITY_FEATURES.includes(key);
}

/** Baseline: features de grupo declaradas no Solar (fonte da verdade). */
export const GROUP_FEATURES: FeatureKey[] = INSTANCES.solar.routes.filter(isGroupFeature);


export type VisibilityIssue = {
  instance: InstanceId;
  feature: FeatureKey;
  label: string;
  path: string | null;
  kind: "missing_in_instance" | "missing_route" | "missing_label";
  message: string;
};

export type VisibilityReport = {
  ok: boolean;
  checked: number;
  issues: VisibilityIssue[];
};

function pathFor(feature: FeatureKey): string | null {
  const entry = Object.entries(ROUTE_FEATURE).find(([, f]) => f === feature);
  return entry ? entry[0] : null;
}

/**
 * Confere se todas as opções de grupo do Solar existem em todas as instâncias.
 * Roda em teste automatizado e também na tela de Auditoria de Acessos.
 */
export function validateAdminVisibility(): VisibilityReport {
  const issues: VisibilityIssue[] = [];
  let checked = 0;

  for (const feature of GROUP_FEATURES) {
    const path = pathFor(feature);
    const label = FEATURE_LABELS[feature] ?? feature;

    if (!path) {
      issues.push({
        instance: "solar",
        feature,
        label,
        path: null,
        kind: "missing_route",
        message: `"${label}" não tem rota mapeada em ROUTE_FEATURE.`,
      });
    }
    if (!FEATURE_LABELS[feature]) {
      issues.push({
        instance: "solar",
        feature,
        label: feature,
        path,
        kind: "missing_label",
        message: `"${feature}" não tem rótulo em FEATURE_LABELS.`,
      });
    }

    for (const instance of INSTANCE_IDS) {
      checked++;
      if (!INSTANCES[instance].routes.includes(feature)) {
        issues.push({
          instance,
          feature,
          label,
          path,
          kind: "missing_in_instance",
          message: `"${label}" existe no Solar mas não está declarada em ${INSTANCES[instance].label}.`,
        });
      }
    }
  }

  return { ok: issues.length === 0, checked, issues };
}
