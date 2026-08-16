// Central config das instâncias do Portal 2P.
// Solar (atual, laranja), Carregadores (azul), Marketing (cinza + amarelo fosco).

import type { AppPath } from "@/lib/routes";
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
  | "cpo.metas"
  | "admin.usuarios"
  | "admin.metas"
  | "admin.regras"
  | "admin.comissoes"
  | "admin.tabelas"
  | "admin.produtos"
  | "admin.objetos.produtos"
  | "admin.perfis"
  | "admin.integracoes"
  | "admin.auditoria"
  | "admin.atividade"
  | "admin.vinculos"
  | "admin.area.configuracoes"
  | "admin.area.moderacao"
  | "admin.area.integracoes"
  | "admin.area.logs"
  | "admin.logs.integracoes"
  | "admin.logs.moderacao"
  | "admin.logs.retencao"
  | "admin.logs.exportar"
  | "admin.sistema.excluir"
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
      "cpo.metas",
      "admin.usuarios",
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
      "admin.perfis",
      "admin.integracoes",
      "admin.auditoria",
      "admin.atividade",
      "admin.vinculos",
    ],
  },
};

// Mapa: rota do TanStack → feature key (para gate de menu e roteamento).
export const ROUTE_FEATURE: Partial<Record<AppPath, FeatureKey>> = {
  "/": "home",
  "/solar/tarefas": "tarefas",
  "/solar/pedidos": "pedidos",
  "/solar/propostas": "propostas",
  "/solar/cupons": "cupons",
  "/solar/dashboards": "dashboards",
  "/solar/dashboards/metas": "dashboards.metas",
  "/solar/clientes/cadastros": "clientes.cadastros",
  "/solar/clientes/segmentacao": "clientes.segmentacao",
  "/solar/clientes/perfil": "clientes.perfil",
  "/solar/clientes/sugestoes": "clientes.sugestoes",
  "/solar/clientes/ranking": "clientes.ranking",
  "/solar/atlas": "atlas",
  "/carregadores": "cpo.home",
  "/carregadores/tarefas": "cpo.tarefas",
  "/carregadores/clientes": "cpo.clientes",
  "/carregadores/clientes/cadastros": "cpo.clientes",
  "/carregadores/propostas": "cpo.propostas",
  "/carregadores/produtos": "cpo.produtos",
  "/carregadores/pedidos": "cpo.pedidos",
  "/carregadores/comissoes": "cpo.comissoes",
  "/carregadores/regras": "cpo.regras",
  "/carregadores/metas": "cpo.metas",

  "/admin/usuarios": "admin.usuarios",
  "/admin/configuracoes": "admin.area.configuracoes",
  "/admin/moderacao": "admin.area.moderacao",
  "/admin/logs": "admin.area.logs",
  "/admin/produtos-solar": "admin.produtos",
  "/admin/metas": "admin.metas",

  "/admin/regras": "admin.regras",
  "/admin/comissoes": "admin.comissoes",
  "/admin/tabelas": "admin.tabelas",
  "/admin/produtos": "admin.objetos.produtos",
  "/admin/estoque": "admin.objetos.produtos",
  "/admin/perfis": "admin.perfis",
  "/admin/integracoes": "admin.integracoes",
  "/admin/auditoria": "admin.auditoria",
  "/admin/atividade": "admin.atividade",
  "/admin/logs/integracoes": "admin.logs.integracoes",
  "/admin/logs/moderacao": "admin.logs.moderacao",
  "/admin/logs/retencao": "admin.logs.retencao",
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
  "cpo.produtos": "Moderação • Carregadores • Gestão de Produtos",
  "cpo.comissoes": "Moderação • Carregadores • Regras de Comissões",
  "cpo.regras": "Moderação • Carregadores • Regras de Propostas",
  "cpo.metas": "Moderação • Carregadores • Regras de Metas",
  "admin.usuarios": "Admin • Usuários",
  "admin.metas": "Moderação • Solar • Regras de Metas",
  "admin.regras": "Moderação • Solar • Regras de Propostas",
  "admin.comissoes": "Moderação • Solar • Regras de Comissões",
  "admin.tabelas": "Admin • Tabelas",
  "admin.produtos": "Moderação • Solar • Gestão de Produtos",
  "admin.objetos.produtos": "Configurações • Objetos e Campos — Produtos",
  "admin.perfis": "Admin • Perfis",
  "admin.integracoes": "Admin • Integrações",
  "admin.auditoria": "Admin • Auditoria de Acessos",
  "admin.atividade": "Logs • Log de Usuários",
  "admin.logs.integracoes": "Logs • Integrações",
  "admin.logs.moderacao": "Logs • Moderação",
  "admin.logs.retencao": "Logs • Retenção e limpeza",
  "admin.logs.exportar": "Logs • Exportar registros (CSV)",
  "admin.sistema.excluir": "Sistema • Excluir registros (universal)",
  "admin.vinculos": "Admin • Vínculos Salesforce",
  "admin.area.configuracoes": "Acesso • Configurações (engrenagem)",
  "admin.area.moderacao": "Acesso • Moderação (engrenagem)",
  "admin.area.integracoes": "Acesso • Integrações (engrenagem)",
  "admin.area.logs": "Acesso • Logs (engrenagem)",
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
  "cpo.metas",
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
  return match ? (ROUTE_FEATURE as Record<string, FeatureKey>)[match] ?? null : null;
}

// Primeira instância permitida que contém a feature — usada para trocar de
// instância automaticamente quando o usuário abre um link direto (ex.: /carregadores/propostas).
export function instanceForFeature(feature: FeatureKey, allowed: InstanceId[]): InstanceId | null {
  return allowed.find((i) => INSTANCES[i].routes.includes(feature)) ?? null;
}

