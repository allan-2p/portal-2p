/**
 * Navegação do ambiente de Administração do Grupo 2P.
 *
 * Ao entrar em Configurações, Painel de Controle ou Moderação o portal troca
 * o menu lateral padrão por este — é um ambiente separado de configuração.
 */
import {
  Users,
  UserCog,
  KeyRound,
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
  LayoutDashboard,
  SlidersHorizontal,
} from "lucide-react";
import type { FeatureKey } from "@/lib/instances";

export type AdminSectionId = "configuracoes" | "painel" | "moderacao";

export type AdminNavItem = {
  to: string;
  label: string;
  icon: typeof Users;
  feature?: FeatureKey;
};

export type AdminNavGroup = {
  label: string | null;
  items: AdminNavItem[];
};

export type AdminSection = {
  id: AdminSectionId;
  label: string;
  icon: typeof Users;
  home: string;
  groups: AdminNavGroup[];
};

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    id: "configuracoes",
    label: "Configurações",
    icon: Settings2,
    home: "/admin/perfis",
    groups: [
      {
        label: "Acessos",
        items: [
          { to: "/admin/perfis", label: "Perfis de Permissão", icon: UserCog, feature: "admin.perfis" },
          { to: "/admin/permissoes", label: "Permissões de Usuários", icon: KeyRound, feature: "admin.permissoes" },
          { to: "/admin/auditoria", label: "Auditoria de Acessos", icon: ShieldCheck, feature: "admin.auditoria" },
        ],
      },
      {
        label: "Usuários",
        items: [
          { to: "/usuarios", label: "Usuários", icon: Users, feature: "admin.usuarios" },
          { to: "/admin/atividade", label: "Log de Usuários", icon: ActivityIcon, feature: "admin.atividade" },
          { to: "/admin/vinculos", label: "Vínculos Salesforce", icon: Link2, feature: "admin.vinculos" },
        ],
      },
    ],
  },
  {
    id: "painel",
    label: "Painel de Controle",
    icon: LayoutDashboard,
    home: "/integracoes",
    groups: [
      {
        label: null,
        items: [{ to: "/integracoes", label: "Integrações", icon: Plug, feature: "admin.integracoes" }],
      },
    ],
  },
  {
    id: "moderacao",
    label: "Moderação",
    icon: SlidersHorizontal,
    home: "/admin/metas",
    groups: [
      {
        label: "2P Solar",
        items: [
          { to: "/admin/metas", label: "Regras de Metas", icon: Target, feature: "admin.metas" },
          { to: "/admin/tabelas", label: "Tabelas", icon: TableIcon, feature: "admin.tabelas" },
          { to: "/admin/produtos", label: "Produtos (SAP)", icon: Package, feature: "admin.produtos" },
        ],
      },
      {
        label: "2P Carregadores",
        items: [
          { to: "/carregadores/produtos", label: "Produtos e Alíquotas", icon: Package, feature: "cpo.produtos" },
          { to: "/carregadores/comissoes", label: "Comissões", icon: Percent, feature: "cpo.comissoes" },
          { to: "/carregadores/regras", label: "Regras", icon: BookOpen, feature: "cpo.regras" },
        ],
      },
    ],
  },
];

const ALL_ADMIN_PATHS = ADMIN_SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => i.to)));

export function isAdminEnvPath(pathname: string): boolean {
  return ALL_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || pathname === "/perfil";
}

export function sectionForPath(pathname: string): AdminSection | null {
  for (const s of ADMIN_SECTIONS) {
    for (const g of s.groups) {
      for (const i of g.items) {
        if (pathname === i.to || pathname.startsWith(`${i.to}/`)) return s;
      }
    }
  }
  return null;
}
