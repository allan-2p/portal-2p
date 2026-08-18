/**
 * Agrupamento das telas (features) por categoria, usado na tela de Perfis.
 *
 * A ideia é separar claramente o que é operação do dia a dia do que é
 * ambiente do Grupo 2P (Configurações, Moderação e Integrações), para o
 * admin saber exatamente quem acessa o quê dentro de cada área.
 */
import { FEATURE_LABELS, type FeatureKey } from "@/lib/instances";

export type FeatureGroupId =
  | "operacao"
  | "clientes"
  | "dashboards"
  | "inteligencia"
  | "config"
  | "moderacao"
  | "integracoes"
  | "logs"
  | "sistema";

export type FeatureGroup = {
  id: FeatureGroupId;
  label: string;
  description: string;
  /** Área do portal a que o grupo pertence. */
  area: "instancia" | "grupo";
  /**
   * Toggle explícito que libera a área inteira (e a engrenagem) sem depender
   * de marcar telas específicas.
   */
  accessKey?: FeatureKey;
  keys: FeatureKey[];
};

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: "operacao",
    label: "Operação",
    description: "Telas do dia a dia comercial.",
    area: "instancia",
    keys: [
      "home",
      "tarefas",
      "propostas",
      "pedidos",
      "cupons",
      "carregadores.home",
      "carregadores.tarefas",
      "carregadores.propostas",
      "carregadores.pedidos",
      "marketing.home",
      "marketing.social",
      "marketing.trafego",
      "marketing.cohort",
      "marketing.cac",
      "marketing.gargalo",
      "marketing.prevendas",
    ],
  },
  {
    id: "clientes",
    label: "Clientes",
    description: "Cadastros, segmentação e ranking.",
    area: "instancia",
    keys: [
      "clientes.cadastros",
      "clientes.perfil",
      "clientes.segmentacao",
      "clientes.sugestoes",
      "clientes.ranking",
      "carregadores.clientes",
    ],
  },
  {
    id: "dashboards",
    label: "Dashboards e Metas",
    description: "Indicadores e acompanhamento de metas.",
    area: "instancia",
    keys: ["dashboards", "dashboards.metas", "marketing.metas"],
  },
  {
    id: "inteligencia",
    label: "Inteligência",
    description: "Recursos de IA do portal.",
    area: "instancia",
    keys: ["atlas"],
  },
  {
    id: "config",
    label: "Administração • Configurações",
    description: "Quem administra usuários, perfis, objetos, tabelas e auditoria do Grupo 2P.",
    area: "grupo",
    accessKey: "admin.area.configuracoes",
    keys: [
      "admin.area.configuracoes",
      "admin.usuarios",
      "admin.perfis",
      "admin.auditoria",
      "admin.vinculos",
      "admin.objetos.produtos",
      "admin.tabelas",
    ],
  },
  {
    id: "moderacao",
    label: "Administração • Moderação",
    description: "Produtos e regras (propostas, metas e comissões) de cada unidade.",
    area: "grupo",
    accessKey: "admin.area.moderacao",
    keys: [
      "admin.area.moderacao",
      "admin.produtos",
      "admin.metas",
      "admin.regras",
      "admin.comissoes",
      "carregadores.produtos",
      "carregadores.comissoes",
      "carregadores.regras",
      "carregadores.metas",
    ],
  },
  {
    id: "integracoes",
    label: "Administração • Integrações",
    description: "Acesso ao painel de integrações (Salesforce, SAP, Metricool, etc.).",
    area: "grupo",
    accessKey: "admin.area.integracoes",
    keys: ["admin.area.integracoes", "admin.integracoes"],
  },
  {
    id: "logs",
    label: "Administração • Logs",
    description:
      "Quem pode ver os logs do portal (usuários, integrações, moderação e retenção) e quem pode exportar os registros em CSV.",
    area: "grupo",
    accessKey: "admin.area.logs",
    keys: [
      "admin.area.logs",
      "admin.atividade",
      "admin.logs.integracoes",
      "admin.logs.moderacao",
      "admin.logs.retencao",
      "admin.logs.jobs",
      "admin.logs.exportar",
    ],
  },
  {
    id: "sistema",
    label: "Administração • Sistema",
    description:
      "Permissões universais do portal. Excluir registros é exclusivo do Administrador do Sistema.",
    area: "grupo",
    keys: ["admin.sistema.excluir", "admin.clientes.integracoes"],
  },
];

const GROUP_BY_KEY = new Map<FeatureKey, FeatureGroup>();
for (const g of FEATURE_GROUPS) for (const k of g.keys) GROUP_BY_KEY.set(k, g);

export function groupForFeature(key: FeatureKey): FeatureGroup | null {
  return GROUP_BY_KEY.get(key) ?? null;
}

/** Rótulo curto: remove o prefixo de área ("Admin • ", "Clientes • ", …). */
export function shortFeatureLabel(key: FeatureKey): string {
  const full = FEATURE_LABELS[key];
  const idx = full.indexOf("•");
  return idx >= 0 ? full.slice(idx + 1).trim() : full;
}

/** Prefixo da feature (ex.: "Carregadores", "Marketing") ou null. */
export function featureScopeLabel(key: FeatureKey): string | null {
  const full = FEATURE_LABELS[key];
  const idx = full.indexOf("•");
  return idx >= 0 ? full.slice(0, idx).trim() : null;
}

/** Agrupa uma lista de features preservando a ordem dos grupos. */
export function groupFeatures(keys: FeatureKey[]): { group: FeatureGroup; keys: FeatureKey[] }[] {
  const set = new Set(keys);
  return FEATURE_GROUPS.map((group) => ({
    group,
    keys: group.keys.filter((k) => set.has(k)),
  })).filter((g) => g.keys.length > 0);
}

/** Toggles explícitos de acesso a áreas administrativas. */
export const AREA_ACCESS_KEYS: FeatureKey[] = FEATURE_GROUPS.flatMap((g) =>
  g.accessKey ? [g.accessKey] : [],
);

/** Telas liberadas por um toggle de área (exclui o próprio toggle). */
export function featuresForAreaAccessKey(key: FeatureKey): FeatureKey[] {
  const g = FEATURE_GROUPS.find((x) => x.accessKey === key);
  return g ? g.keys.filter((k) => k !== key) : [];
}
