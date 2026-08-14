/**
 * Navegação do ambiente de Administração do Grupo 2P.
 *
 * Ao entrar em Configurações, Integrações ou Moderação o portal troca o menu
 * lateral padrão por este — é um ambiente separado de configuração.
 */
import {
  Users,
  UserCog,
  Activity as ActivityIcon,
  Link2,
  ShieldCheck,
  Plug,
  Target,
  Table as TableIcon,
  Package,
  Percent,
  BookOpen,
  Settings2,
  SlidersHorizontal,
  ScrollText,
  LayoutDashboard,
} from "lucide-react";
import type { FeatureKey } from "@/lib/instances";

export type AdminSectionId = "configuracoes" | "integracoes" | "moderacao" | "logs";

export type AdminNavItem = {
  to: string;
  label: string;
  icon: typeof Users;
  feature?: FeatureKey;
  /** Ativa apenas no match exato (usado pelas "Visão geral" das seções). */
  exact?: boolean;
};

export type AdminNavGroup = {
  label: string | null;
  items: AdminNavItem[];
  collapsible?: boolean;
};

export type AdminSection = {
  id: AdminSectionId;
  label: string;
  /** Frase curta usada na home da seção. */
  description: string;
  icon: typeof Users;
  home: string;
  /** Prefixos extras que pertencem à seção (ex.: a página índice de Integrações). */
  prefixes?: string[];
  groups: AdminNavGroup[];
};

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    id: "configuracoes",
    label: "Configurações",
    description: "Usuários, perfis de acesso, objetos, campos e tabelas do Grupo 2P.",
    icon: Settings2,
    home: "/admin/configuracoes",
    groups: [
      {
        label: null,
        items: [{ to: "/admin/configuracoes", label: "Visão geral", icon: LayoutDashboard, exact: true }],
      },
      {
        label: "Usuários",
        items: [
          { to: "/usuarios", label: "Usuários", icon: Users, feature: "admin.usuarios" },
          { to: "/admin/vinculos", label: "Vínculos Salesforce", icon: Link2, feature: "admin.vinculos" },
        ],
      },
      {
        label: "Acessos",
        items: [
          { to: "/admin/perfis", label: "Perfis", icon: UserCog, feature: "admin.perfis" },
          { to: "/admin/auditoria", label: "Auditoria de Acessos", icon: ShieldCheck, feature: "admin.auditoria" },
        ],
      },
      {
        label: "Objetos e Campos",
        items: [
          { to: "/admin/produtos", label: "Produtos", icon: Package, feature: "admin.objetos.produtos" },
        ],
      },
      {
        label: "Tabelas",
        items: [
          { to: "/admin/tabelas", label: "Tabelas", icon: TableIcon, feature: "admin.tabelas" },
        ],
      },
    ],
  },
  {
    id: "integracoes",
    label: "Integrações",
    description: "Conexões com Salesforce, SAP, marketing, cadastros e plataforma.",
    icon: Plug,
    home: "/integracoes",
    prefixes: ["/integracoes"],
    groups: [
      {
        label: null,
        items: [{ to: "/integracoes", label: "Visão geral", icon: LayoutDashboard, exact: true }],
      },
      {
        label: "CRM",
        items: [{ to: "/integracoes/salesforce", label: "Salesforce", icon: Plug, feature: "admin.integracoes" }],
      },
      {
        label: "ERP",
        items: [{ to: "/integracoes/sap", label: "SAP", icon: Plug, feature: "admin.integracoes" }],
      },
      {
        label: "Marketing",
        items: [
          { to: "/integracoes/metricool", label: "Metricool", icon: Plug, feature: "admin.integracoes" },
          { to: "/integracoes/notion", label: "Notion", icon: Plug, feature: "admin.integracoes" },
        ],
      },
      {
        label: "Cadastros",
        items: [
          { to: "/integracoes/serpro-cnpja", label: "Serpro / CNPJá", icon: Plug, feature: "admin.integracoes" },
          { to: "/integracoes/viacep", label: "ViaCEP", icon: Plug, feature: "admin.integracoes" },
        ],
      },
      {
        label: "Dados e Arquivos",
        items: [
          { to: "/integracoes/base-contas-carregadores", label: "Base de Contas — Carregadores", icon: Plug, feature: "admin.integracoes" },
          { to: "/integracoes/top20", label: "Top 20", icon: Plug, feature: "admin.integracoes" },
          { to: "/integracoes/storage", label: "Storage — Top 20 / Logos", icon: Plug, feature: "admin.integracoes" },
        ],
      },
      {
        label: "Plataforma",
        items: [
          { to: "/integracoes/lovable-cloud", label: "Lovable Cloud", icon: Plug, feature: "admin.integracoes" },
          { to: "/integracoes/lovable-ai", label: "Lovable AI (Atlas)", icon: Plug, feature: "admin.integracoes" },
          { to: "/integracoes/emails", label: "E-mails transacionais", icon: Plug, feature: "admin.integracoes" },
          { to: "/integracoes/mcp", label: "Servidor MCP", icon: Plug, feature: "admin.integracoes" },
        ],
      },
    ],
  },
  {
    id: "moderacao",
    label: "Moderação",
    description: "Produtos e regras (propostas, metas e comissões) de todas as unidades.",
    icon: SlidersHorizontal,
    home: "/admin/moderacao",
    groups: [
      {
        label: null,
        items: [{ to: "/admin/moderacao", label: "Visão geral", icon: LayoutDashboard, exact: true }],
      },
      {
        label: "Produtos",
        collapsible: true,
        items: [
          { to: "/admin/produtos-solar", label: "Produtos — 2P Solar", icon: Package, feature: "admin.produtos" },
          { to: "/carregadores/produtos", label: "Produtos — 2P Carregadores", icon: Package, feature: "cpo.produtos" },
        ],
      },
      {
        label: "Regras",
        collapsible: true,
        items: [
          { to: "/carregadores/regras", label: "Regras de Propostas", icon: BookOpen, feature: "cpo.regras" },
          { to: "/admin/metas", label: "Regras de Metas", icon: Target, feature: "admin.metas" },
          { to: "/carregadores/comissoes", label: "Regras de Comissões", icon: Percent, feature: "cpo.comissoes" },
        ],
      },
    ],
  },
  {
    id: "logs",
    label: "Logs",
    description: "Histórico de acessos, integrações, moderações e políticas de retenção.",
    icon: ScrollText,
    home: "/admin/logs",
    groups: [
      {
        label: null,
        items: [{ to: "/admin/logs", label: "Visão geral", icon: LayoutDashboard, exact: true }],
      },
      {
        label: "Logs do portal",
        items: [
          { to: "/admin/atividade", label: "Log de Usuários", icon: ActivityIcon, feature: "admin.atividade" },
          { to: "/admin/logs/integracoes", label: "Log de Integrações", icon: Plug, feature: "admin.logs.integracoes" },
          { to: "/admin/logs/moderacao", label: "Log de Moderação", icon: ShieldCheck, feature: "admin.logs.moderacao" },
          { to: "/admin/logs/retencao", label: "Retenção e limpeza", icon: ScrollText, feature: "admin.logs.retencao" },
        ],
      },
    ],
  },
];


const ALL_ADMIN_PATHS = ADMIN_SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => i.to)));

export function isAdminEnvPath(pathname: string): boolean {
  return ADMIN_SECTIONS.flatMap((s) => s.prefixes ?? []).some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  ) || ALL_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || pathname === "/perfil";
}

export function sectionForPath(pathname: string): AdminSection | null {
  for (const s of ADMIN_SECTIONS) {
    for (const p of s.prefixes ?? []) {
      if (pathname === p || pathname.startsWith(`${p}/`)) return s;
    }
    for (const g of s.groups) {
      for (const i of g.items) {
        if (pathname === i.to || pathname.startsWith(`${i.to}/`)) return s;
      }
    }
  }
  return null;
}
