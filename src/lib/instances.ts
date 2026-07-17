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
  | "dashboards"
  | "clientes.cadastros"
  | "clientes.segmentacao"
  | "clientes.perfil"
  | "clientes.sugestoes"
  | "atlas"
  | "admin.usuarios"
  | "admin.vendedores"
  | "admin.metas"
  | "admin.tabelas"
  | "admin.integracoes"
  | "marketing.home"
  | "marketing.social"
  | "marketing.trafego"
  | "marketing.cohort"
  | "marketing.cac"
  | "marketing.gargalo"
  | "marketing.prevendas";

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
      "dashboards",
      "clientes.cadastros",
      "clientes.segmentacao",
      "atlas",
      "admin.usuarios",
      "admin.vendedores",
      "admin.metas",
      "admin.tabelas",
      "admin.integracoes",
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
      "home",
      "tarefas",
      "pedidos",
      "dashboards",
      "clientes.cadastros",
      "clientes.segmentacao",
      "atlas",
      "admin.usuarios",
      "admin.vendedores",
      "admin.metas",
      "admin.tabelas",
      "admin.integracoes",
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
      "admin.usuarios",
      "admin.integracoes",
    ],
  },
};

// Mapa: rota do TanStack → feature key (para gate de menu e roteamento).
export const ROUTE_FEATURE: Record<string, FeatureKey> = {
  "/": "home",
  "/tarefas": "tarefas",
  "/pedidos": "pedidos",
  "/dashboards": "dashboards",
  "/clientes/cadastros": "clientes.cadastros",
  "/clientes/segmentacao": "clientes.segmentacao",
  "/atlas": "atlas",
  "/usuarios": "admin.usuarios",
  "/admin/vendedores": "admin.vendedores",
  "/admin/metas": "admin.metas",
  "/admin/tabelas": "admin.tabelas",
  "/integracoes": "admin.integracoes",
  "/marketing": "marketing.home",
  "/marketing/social": "marketing.social",
  "/marketing/trafego": "marketing.trafego",
  "/marketing/cohort": "marketing.cohort",
  "/marketing/cac": "marketing.cac",
  "/marketing/gargalo": "marketing.gargalo",
  "/marketing/pre-vendas": "marketing.prevendas",
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  home: "Home",
  tarefas: "Tarefas",
  pedidos: "Pedidos",
  dashboards: "Dashboards",
  "clientes.cadastros": "Clientes • Cadastros",
  "clientes.segmentacao": "Clientes • Segmentação",
  atlas: "Atlas (AI)",
  "admin.usuarios": "Admin • Usuários",
  "admin.vendedores": "Admin • Vendedores",
  "admin.metas": "Admin • Metas",
  "admin.tabelas": "Admin • Tabelas",
  "admin.integracoes": "Admin • Integrações",
  "marketing.home": "Marketing • Home",
  "marketing.social": "Marketing • Social Media",
  "marketing.trafego": "Marketing • Tráfego Pago",
  "marketing.cohort": "Marketing • Cohort",
  "marketing.cac": "Marketing • CAC",
  "marketing.gargalo": "Marketing • Mapa de Gargalo",
  "marketing.prevendas": "Marketing • Home Pré-Vendas",
};

export const ALL_FEATURES: FeatureKey[] = Object.keys(FEATURE_LABELS) as FeatureKey[];

export function defaultInstanceForList(allowed: InstanceId[]): InstanceId {
  if (allowed.includes("solar")) return "solar";
  return allowed[0] ?? "solar";
}
