// Central config das instâncias do Portal 2P.
// Solar (atual, laranja), Carregadores (azul), Marketing (cinza + amarelo fosco).

import solarLogoRaw from "@/assets/2p-logo.jpg";
import carregadoresAsset from "@/assets/2p-carregadores-logo.png.asset.json";

export type InstanceId = "solar" | "carregadores" | "marketing";

export const INSTANCE_IDS: readonly InstanceId[] = ["solar", "carregadores", "marketing"] as const;

export type FeatureKey =
  | "home"
  | "tarefas"
  | "pedidos"
  | "propostas"
  | "cupons"
  | "dashboards"
  | "dashboards.metas"
  | "clientes.cadastros"
  | "clientes.segmentacao"
  | "clientes.perfil"
  | "clientes.sugestoes"
  | "clientes.ranking"
  | "atlas"
  | "cpo.home"
  | "cpo.tarefas"
  | "cpo.clientes"
  | "cpo.propostas"
  | "cpo.pedidos"
  | "cpo.produtos"
  | "cpo.comissoes"
  | "cpo.regras"
  | "admin.usuarios"
  | "admin.metas"
  | "admin.tabelas"
  | "admin.produtos"
  | "admin.permissoes"
  | "admin.perfis"
  | "admin.integracoes"
  | "admin.auditoria"
  | "admin.atividade"
  | "admin.vinculos"
  | "marketing.home"
  | "marketing.social"
  | "marketing.trafego"
  | "marketing.cohort"
  | "marketing.cac"
  | "marketing.gargalo"
  | "marketing.prevendas"
  | "marketing.metas";


export type InstanceMeta = {
  id: InstanceId;
  label: string;
  short: string;
  description: string;
  logo: string;
  swatch: string; // usada só para preview no switcher
  routes: FeatureKey[]; // features visíveis por default nessa instância
};

export const INSTANCES: Record<InstanceId, InstanceMeta> = {
  solar: {
    id: "solar",
    label: "Solar",
    short: "SOL",
    description: "Portal comercial da unidade Solar (padrão histórico).",
    logo: solarLogoRaw,
    swatch: "oklch(0.68 0.2 47)",
    routes: [
      "home",
      "tarefas",
      "pedidos",
      "propostas",
      "dashboards",
      "dashboards.metas",
      "clientes.cadastros",
      "clientes.segmentacao",
      "clientes.perfil",
      "clientes.sugestoes",
      "clientes.ranking",
      "cupons",
      "atlas",
      "admin.usuarios",
      "admin.metas",
      "admin.tabelas",
      "admin.produtos",
      "admin.permissoes",
      "admin.perfis",
      "admin.integracoes",
      "admin.auditoria",
      "admin.atividade",
      "admin.vinculos",
    ],
  },
  carregadores: {
    id: "carregadores",
    label: "Carregadores",
    short: "CAR",
    description: "Unidade de carregadores veiculares — mesma base comercial.",
    logo: carregadoresAsset.url,
    swatch: "oklch(0.5 0.19 265)",
    routes: [
      "cpo.home",
      "cpo.tarefas",
      "cpo.clientes",
      "cpo.propostas",
      "cpo.pedidos",
      "cpo.produtos",
      "cpo.comissoes",
      "cpo.regras",
      "admin.usuarios",
      "admin.permissoes",
      "admin.perfis",
      "admin.integracoes",
      "admin.auditoria",
      "admin.atividade",
      "admin.vinculos",
    ],

  },
  marketing: {
    id: "marketing",
    label: "Marketing",
    short: "MKT",
    description: "Consolidação de marketing de Solar e Carregadores.",
    logo: solarLogoRaw,
    swatch: "oklch(0.78 0.14 90)",
    routes: [
      "marketing.home",
      "marketing.social",
      "marketing.trafego",
      "marketing.cohort",
      "marketing.cac",
      "marketing.gargalo",
      "marketing.prevendas",
      "marketing.metas",
      "admin.usuarios",
      "admin.permissoes",
      "admin.perfis",
      "admin.integracoes",
      "admin.auditoria",
      "admin.atividade",
      "admin.vinculos",
    ],
  },
};

// Mapa: rota do TanStack → feature key (para gate de menu e roteamento).
export const ROUTE_FEATURE: Record<string, FeatureKey> = {
  "/": "home",
  "/tarefas": "tarefas",
  "/pedidos": "pedidos",
  "/orcamentos": "propostas",
  "/cupons": "cupons",
  "/dashboards": "dashboards",
  "/dashboards/metas": "dashboards.metas",
  "/clientes/cadastros": "clientes.cadastros",
  "/clientes/segmentacao": "clientes.segmentacao",
  "/clientes/perfil": "clientes.perfil",
  "/clientes/sugestoes": "clientes.sugestoes",
  "/clientes/ranking": "clientes.ranking",
  "/atlas": "atlas",
  "/carregadores": "cpo.home",
  "/carregadores/tarefas": "cpo.tarefas",
  "/carregadores/clientes": "cpo.clientes",
  "/carregadores/clientes/cadastros": "cpo.clientes",
  "/carregadores/propostas": "cpo.propostas",
  "/carregadores/produtos": "cpo.produtos",
  "/carregadores/pedidos": "cpo.pedidos",
  "/carregadores/comissoes": "cpo.comissoes",
  "/carregadores/regras": "cpo.regras",

  "/usuarios": "admin.usuarios",
  "/admin/metas": "admin.metas",
  "/admin/tabelas": "admin.tabelas",
  "/admin/produtos": "admin.produtos",
  "/admin/permissoes": "admin.permissoes",
  "/admin/perfis": "admin.perfis",
  "/integracoes": "admin.integracoes",
  "/admin/auditoria": "admin.auditoria",
  "/admin/atividade": "admin.atividade",
  "/admin/vinculos": "admin.vinculos",
  "/marketing": "marketing.home",
  "/marketing/social": "marketing.social",
  "/marketing/trafego": "marketing.trafego",
  "/marketing/cohort": "marketing.cohort",
  "/marketing/cac": "marketing.cac",
  "/marketing/gargalo": "marketing.gargalo",
  "/marketing/pre-vendas": "marketing.prevendas",
  "/marketing/metas": "marketing.metas",
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  home: "Home",
  tarefas: "Tarefas",
  pedidos: "Pedidos",
  propostas: "Propostas",
  cupons: "Cupons",
  dashboards: "Dashboards",
  "dashboards.metas": "Dashboards • Metas",
  "clientes.cadastros": "Clientes • Cadastros",
  "clientes.segmentacao": "Clientes • Segmentação",
  "clientes.perfil": "Clientes • Perfil do Cliente",
  "clientes.sugestoes": "Clientes • Sugestões do Atlas",
  "clientes.ranking": "Clientes • Ranking",
  atlas: "Atlas (AI)",
  "cpo.home": "Carregadores • Home",
  "cpo.tarefas": "Carregadores • Tarefas",
  "cpo.clientes": "Carregadores • Clientes",
  "cpo.propostas": "Carregadores • Propostas",
  "cpo.pedidos": "Carregadores • Pedidos",
  "cpo.produtos": "Moderação • Produtos e Alíquotas",
  "cpo.comissoes": "Moderação • Comissões",
  "cpo.regras": "Moderação • Regras",
  "admin.usuarios": "Admin • Usuários",
  "admin.metas": "Admin • Metas",
  "admin.tabelas": "Admin • Tabelas",
  "admin.produtos": "Admin • Produtos (SAP)",
  "admin.permissoes": "Admin • Permissões de Usuários",
  "admin.perfis": "Admin • Perfis",
  "admin.integracoes": "Admin • Integrações",
  "admin.auditoria": "Admin • Auditoria de Acessos",
  "admin.atividade": "Admin • Log de Usuários",
  "admin.vinculos": "Admin • Vínculos Salesforce",
  "marketing.home": "Marketing • Home",
  "marketing.social": "Marketing • Social Mídia",
  "marketing.trafego": "Marketing • Mídia Paga",
  "marketing.cohort": "Marketing • Cohort",
  "marketing.cac": "Marketing • CAC",
  "marketing.gargalo": "Marketing • Mapa de Gargalo",
  "marketing.prevendas": "Marketing • Pré-Vendas",
  "marketing.metas": "Marketing • Metas",
};

export const ALL_FEATURES: FeatureKey[] = Object.keys(FEATURE_LABELS) as FeatureKey[];

// === Consistência de grupo ===
// Tudo que é do Grupo 2P (Administração/Configurações) precisa estar disponível
// igualmente em todas as instâncias para administradores. Normalizamos aqui para
// que nenhuma instância possa divergir por esquecimento na config acima.
export const GROUP_FEATURE_KEYS: FeatureKey[] = [
  ...ALL_FEATURES.filter((k) => k.startsWith("admin.")),
  // Itens de Moderação da unidade Carregadores também devem ser visíveis
  // para administradores em qualquer instância.
  "cpo.produtos",
  "cpo.comissoes",
  "cpo.regras",
];
for (const id of INSTANCE_IDS) {
  for (const key of GROUP_FEATURE_KEYS) {
    if (!INSTANCES[id].routes.includes(key)) INSTANCES[id].routes.push(key);
  }
}

export function defaultInstanceForList(allowed: InstanceId[]): InstanceId {
  if (allowed.includes("solar")) return "solar";
  return allowed[0] ?? "solar";
}

// Resolve a feature key a partir do pathname (match exato ou prefixo mais longo).
export function featureForPath(path: string): FeatureKey | null {
  const keys = Object.keys(ROUTE_FEATURE).sort((a, b) => b.length - a.length);
  const match = keys.find((k) => path === k || path.startsWith(k + "/"));
  return match ? ROUTE_FEATURE[match] : null;
}

// Primeira instância permitida que contém a feature — usada para trocar de
// instância automaticamente quando o usuário abre um link direto (ex.: /carregadores/propostas).
export function instanceForFeature(feature: FeatureKey, allowed: InstanceId[]): InstanceId | null {
  return allowed.find((i) => INSTANCES[i].routes.includes(feature)) ?? null;
}

