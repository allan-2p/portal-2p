// Perfis de permissão: conjuntos prontos de acessos por instância.
// Aplicar um perfil substitui as permissões daquela instância; depois
// o admin pode ajustar exceções individualmente por usuário.

import type { FeatureKey, InstanceId } from "@/lib/instances";
import { INSTANCES } from "@/lib/instances";

export type PermissionProfileId = "vendedor" | "gestor" | "adm";

export type PermissionProfile = {
  id: PermissionProfileId;
  label: string;
  description: string;
  /** Features por instância. Ausente = nenhum acesso naquela instância. */
  features: Partial<Record<InstanceId, FeatureKey[]>>;
};

const SOLAR_VENDEDOR: FeatureKey[] = [
  "home",
  "tarefas",
  "propostas",
  "pedidos",
  "clientes.cadastros",
  "clientes.segmentacao",
  "clientes.perfil",
  "atlas",
];

const SOLAR_GESTOR: FeatureKey[] = [
  ...SOLAR_VENDEDOR,
  "cupons",
  "dashboards",
  "dashboards.metas",
  "clientes.sugestoes",
  "clientes.ranking",
  "admin.metas",
  "admin.tabelas",
  "admin.produtos",
];

const CARREGADORES_VENDEDOR: FeatureKey[] = [
  "carregadores.home",
  "carregadores.tarefas",
  "carregadores.clientes",
  "carregadores.propostas",
  "carregadores.pedidos",
];

const CARREGADORES_GESTOR: FeatureKey[] = [
  ...CARREGADORES_VENDEDOR,
  "carregadores.produtos",
  "carregadores.comissoes",
  "carregadores.regras",
];

const MKT_VENDEDOR: FeatureKey[] = ["marketing.home", "marketing.social", "marketing.prevendas"];

const MKT_GESTOR: FeatureKey[] = [
  "marketing.home",
  "marketing.social",
  "marketing.trafego",
  "marketing.cohort",
  "marketing.cac",
  "marketing.gargalo",
  "marketing.prevendas",
  "marketing.metas",
];

function allOf(instance: InstanceId): FeatureKey[] {
  return [...INSTANCES[instance].routes];
}

export const PERMISSION_PROFILES: PermissionProfile[] = [
  {
    id: "vendedor",
    label: "Vendedor",
    description: "Operação do dia a dia: agenda, propostas, pedidos e clientes.",
    features: {
      solar: SOLAR_VENDEDOR,
      carregadores: CARREGADORES_VENDEDOR,
      marketing: MKT_VENDEDOR,
    },
  },
  {
    id: "gestor",
    label: "Gestor",
    description: "Tudo do vendedor + dashboards, metas, tabelas e moderação.",
    features: {
      solar: SOLAR_GESTOR,
      carregadores: CARREGADORES_GESTOR,
      marketing: MKT_GESTOR,
    },
  },
  {
    id: "adm",
    label: "Administrativo",
    description: "Acesso completo à instância, incluindo administração.",
    features: {
      solar: allOf("solar"),
      carregadores: allOf("carregadores"),
      marketing: allOf("marketing"),
    },
  },
];

/** Features do perfil que realmente existem na instância. */
export function profileFeatures(
  profile: PermissionProfile,
  instance: InstanceId,
): FeatureKey[] {
  const wanted = profile.features[instance] ?? [];
  const valid = new Set(INSTANCES[instance].routes);
  return Array.from(new Set(wanted.filter((f) => valid.has(f))));
}
