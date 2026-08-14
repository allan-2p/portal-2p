/**
 * Tipos de ação (capacidades) que cada tela libera.
 *
 * O modelo de permissão do portal é por tela, mas cada tela habilita ações
 * diferentes. Este mapa traduz "tem a tela X" em "pode visualizar / editar /
 * concluir / moderar", que é o que a Matriz de Permissões mostra.
 */
import type { FeatureKey } from "@/lib/instances";
import { ALL_FEATURES } from "@/lib/instances";

export type CapabilityId = "visualizar" | "editar" | "concluir" | "moderar";

export const CAPABILITIES: { id: CapabilityId; label: string; description: string }[] = [
  {
    id: "visualizar",
    label: "Visualizar",
    description: "Abrir a tela e consultar os dados.",
  },
  {
    id: "editar",
    label: "Editar",
    description: "Criar, alterar ou excluir registros da tela.",
  },
  {
    id: "concluir",
    label: "Concluir",
    description: "Finalizar fluxos (concluir pedido, fechar tarefa, etc.).",
  },
  {
    id: "moderar",
    label: "Moderar",
    description: "Definir regras que valem para os outros usuários.",
  },
];

const V: CapabilityId[] = ["visualizar"];
const VE: CapabilityId[] = ["visualizar", "editar"];
const VEC: CapabilityId[] = ["visualizar", "editar", "concluir"];
const VEM: CapabilityId[] = ["visualizar", "editar", "moderar"];
const VECM: CapabilityId[] = ["visualizar", "editar", "concluir", "moderar"];

const MAP: Partial<Record<FeatureKey, CapabilityId[]>> = {
  // Operação — Solar
  home: V,
  tarefas: VEC,
  propostas: VEC,
  pedidos: VE,
  cupons: VE,
  // Operação — Carregadores
  "cpo.home": V,
  "cpo.tarefas": VEC,
  "cpo.propostas": VEC,
  "cpo.pedidos": VE,
  // Clientes
  "clientes.cadastros": VE,
  "clientes.perfil": V,
  "clientes.segmentacao": V,
  "clientes.sugestoes": V,
  "clientes.ranking": V,
  "cpo.clientes": VE,
  // Dashboards e metas
  dashboards: V,
  "dashboards.metas": VE,
  "marketing.metas": VE,
  // Marketing
  "marketing.home": V,
  "marketing.social": VE,
  "marketing.trafego": V,
  "marketing.cohort": V,
  "marketing.cac": V,
  "marketing.gargalo": V,
  "marketing.prevendas": V,
  // Inteligência
  atlas: V,
  // Configurações (Grupo 2P)
  "admin.area.configuracoes": VECM,
  "admin.usuarios": VEM,
  "admin.perfis": VEM,
  "admin.vinculos": VEM,
  "admin.auditoria": V,
  "admin.objetos.produtos": VEM,
  // Logs
  "admin.area.logs": VECM,
  "admin.atividade": V,
  "admin.logs.integracoes": V,
  "admin.logs.moderacao": V,
  "admin.logs.retencao": VE,
  // Moderação
  "admin.area.moderacao": VECM,
  "admin.produtos": VEM,
  "admin.metas": VEM,
  "admin.tabelas": VEM,
  "cpo.produtos": VEM,
  "cpo.comissoes": VEM,
  "cpo.regras": VEM,
  // Integrações
  "admin.area.integracoes": VECM,
  "admin.integracoes": VEM,
};

export function capabilitiesForFeature(key: FeatureKey): CapabilityId[] {
  return MAP[key] ?? V;
}

/** Une as capacidades de um conjunto de telas. */
export function capabilitiesForFeatures(keys: FeatureKey[]): Set<CapabilityId> {
  const out = new Set<CapabilityId>();
  for (const k of keys) for (const c of capabilitiesForFeature(k)) out.add(c);
  return out;
}

export const ALL_FEATURE_KEYS: FeatureKey[] = [...ALL_FEATURES];
