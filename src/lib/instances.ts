// Central config das instâncias do Portal 2P.
// Solar (atual, laranja), Carregadores (azul), Marketing (cinza + amarelo fosco).

import type { AppPath } from "@/lib/routes";
import solarLogoRaw from "@/assets/2p-logo-sm.webp";
import carregadoresAsset from "@/assets/2p-carregadores-logo.png.asset.json";

export type InstanceId = "solar" | "carregadores" | "marketing" | "financeiro";

export const INSTANCE_IDS: readonly InstanceId[] = ["solar", "carregadores", "marketing", "financeiro"] as const;

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
  | "carregadores.home"
  | "carregadores.tarefas"
  | "carregadores.clientes"
  | "carregadores.propostas"
  | "carregadores.pedidos"
  | "carregadores.produtos"
  | "carregadores.comissoes"
  | "carregadores.regras"
  | "carregadores.metas"
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
  | "admin.logs.sap"
  | "admin.logs.moderacao"
  | "admin.logs.retencao"
  | "admin.logs.jobs"
  | "admin.logs.exportar"
  | "admin.sistema.excluir"
  | "admin.clientes.integracoes"
  | "marketing.home"
  | "marketing.social"
  | "marketing.trafego"
  | "marketing.cohort"
  | "marketing.cac"
  | "marketing.gargalo"
  | "marketing.prevendas"
  | "marketing.metas"
  | "financeiro.home"
  | "financeiro.condicoes"
  | "financeiro.credito";


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
      "carregadores.home",
      "carregadores.tarefas",
      "carregadores.clientes",
      "carregadores.propostas",
      "carregadores.pedidos",
      "carregadores.produtos",
      "carregadores.comissoes",
      "carregadores.regras",
      "carregadores.metas",
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
  financeiro: {
    id: "financeiro",
    label: "Financeiro",
    short: "FIN",
    description: "Controles financeiros do Grupo 2P — condições de pagamento (ZTERM).",
    logo: solarLogoRaw,
    swatch: "oklch(0.55 0.13 165)",
    routes: [
      "financeiro.home",
      "financeiro.condicoes",
      "financeiro.credito",
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
  "/carregadores": "carregadores.home",
  "/carregadores/tarefas": "carregadores.tarefas",
  "/carregadores/clientes": "carregadores.clientes",
  "/carregadores/clientes/cadastros": "carregadores.clientes",
  "/carregadores/propostas": "carregadores.propostas",
  "/carregadores/produtos": "carregadores.produtos",
  "/carregadores/pedidos": "carregadores.pedidos",
  "/carregadores/comissoes": "carregadores.comissoes",
  "/carregadores/regras": "carregadores.regras",
  "/carregadores/metas": "carregadores.metas",

  "/admin/usuarios": "admin.usuarios",
  "/admin/configuracoes": "admin.area.configuracoes",
  "/admin/moderacao": "admin.area.moderacao",
  "/admin/logs": "admin.area.logs",
  "/admin/produtos-solar": "admin.produtos",
  "/admin/modulos-solar": "admin.produtos",
  "/admin/trilhos-solar": "admin.produtos",
  "/admin/suportes-solar": "admin.produtos",
  "/admin/microinversores-solar": "admin.produtos",
  "/admin/metas": "admin.metas",

  "/admin/regras": "admin.regras",
  "/admin/frete-regras": "admin.regras",
  "/carregadores/frete-regras": "carregadores.regras",
  "/admin/comissoes": "admin.comissoes",
  "/admin/tabelas": "admin.tabelas",
  "/admin/produtos": "admin.objetos.produtos",
  "/admin/estoque": "admin.objetos.produtos",
  "/admin/perfis": "admin.perfis",
  "/admin/integracoes": "admin.integracoes",
  "/admin/auditoria": "admin.auditoria",
  "/admin/atividade": "admin.atividade",
  "/admin/logs/integracoes": "admin.logs.integracoes",
  "/admin/logs/sap": "admin.logs.sap",
  "/admin/logs/moderacao": "admin.logs.moderacao",
  "/admin/logs/retencao": "admin.logs.retencao",
  "/admin/logs/gatilhos": "admin.logs.jobs",
  "/admin/vinculos": "admin.vinculos",
  "/marketing": "marketing.home",
  "/marketing/social": "marketing.social",
  "/marketing/trafego": "marketing.trafego",
  "/marketing/cohort": "marketing.cohort",
  "/marketing/cac": "marketing.cac",
  "/marketing/gargalo": "marketing.gargalo",
  "/marketing/pre-vendas": "marketing.prevendas",
  "/marketing/metas": "marketing.metas",
  "/financeiro": "financeiro.home",
  "/financeiro/condicoes": "financeiro.condicoes",
  "/financeiro/credito": "financeiro.credito",
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
  "carregadores.home": "Carregadores • Home",
  "carregadores.tarefas": "Carregadores • Tarefas",
  "carregadores.clientes": "Carregadores • Clientes",
  "carregadores.propostas": "Carregadores • Propostas",
  "carregadores.pedidos": "Carregadores • Pedidos",
  "carregadores.produtos": "Moderação • Carregadores • Gestão de Produtos",
  "carregadores.comissoes": "Moderação • Carregadores • Regras de Comissões",
  "carregadores.regras": "Moderação • Carregadores • Regras de Propostas",
  "carregadores.metas": "Moderação • Carregadores • Regras de Metas",
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
  "admin.logs.sap": "Logs • Monitor de Sync SAP",
  "admin.logs.moderacao": "Logs • Moderação",
  "admin.logs.retencao": "Logs • Retenção e limpeza",
  "admin.logs.jobs": "Logs • Gatilhos automáticos (monitoramento)",
  "admin.logs.exportar": "Logs • Exportar registros (CSV)",
  "admin.sistema.excluir": "Sistema • Excluir registros (universal)",
  "admin.clientes.integracoes": "Clientes • Integrações e histórico (auditoria)",
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
  "financeiro.home": "Financeiro • Home",
  "financeiro.condicoes": "Financeiro • Condições de Pagamento",
  "financeiro.credito": "Financeiro • Análise de Crédito",
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
  "carregadores.produtos",
  "carregadores.comissoes",
  "carregadores.regras",
  "carregadores.metas",
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

