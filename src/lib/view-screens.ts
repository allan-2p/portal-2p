// Registro central de "telas com variantes" — usado pelo admin, pelo toggle
// "Ver como…" e pelo resolvedor. Adicionar tela aqui a habilita para
// configuração; a renderização real fica em cada rota via <ViewSlot />.

import type { AppRole } from "@/hooks/use-auth";
import type { InstanceId } from "@/lib/instances";

export type ScreenKey = "home" | "dashboards" | "clientes.segmentacao";

export type VariantKey = string; // ex: "default", "vendedor.closer", "diretor"

export type PersonaOption = {
  key: VariantKey;
  label: string;
  role?: AppRole;
  cargo?: string;
  description?: string;
};

// Personas disponíveis globalmente para o toggle "Ver como…". A permissão
// para assumir uma persona é combinada com o Papel real do usuário (Admin vê
// todas). O usuário sempre pode voltar para "Automático".
export const PERSONAS: PersonaOption[] = [
  { key: "default", label: "Padrão", description: "Layout base sem cargo específico." },
  { key: "vendedor.closer", label: "Vendedor · Closer", role: "vendedor", cargo: "Closer" },
  { key: "vendedor.farmer", label: "Vendedor · Farmer", role: "vendedor", cargo: "Farmer" },
  { key: "vendedor.sdr", label: "Vendedor · SDR", role: "vendedor", cargo: "SDR" },
  { key: "gerente", label: "Gerente", role: "gerente" },
  { key: "diretor", label: "Diretor", role: "diretor" },
  { key: "marketing", label: "Marketing", role: "marketing" },
  { key: "admin", label: "Administrador", role: "admin" },
];

export const SCREENS: { key: ScreenKey; label: string; description: string }[] = [
  { key: "home", label: "Home", description: "Página inicial (saudação, KPIs, tarefas, pipeline)." },
  { key: "dashboards", label: "Dashboards", description: "Consolidados de vendas e metas." },
  { key: "clientes.segmentacao", label: "Clientes · Perfil do Cliente", description: "Visão de carteira e segmentos." },
];

export type ResolveContext = {
  role: AppRole | null; // maior prioridade (menor PRIORITY em use-auth)
  cargo: string | null; // cargo_tipo do perfil
  instance: InstanceId;
};

// Ordem determinística de match: mais específico → mais genérico.
// role+cargo+instance → role+cargo → role → default
export function resolveVariant(
  available: VariantKey[],
  ctx: ResolveContext,
  override?: VariantKey | null,
): VariantKey {
  const set = new Set(available);
  if (override && set.has(override)) return override;

  const candidates: VariantKey[] = [];
  if (ctx.role && ctx.cargo) {
    candidates.push(`${ctx.role}.${slug(ctx.cargo)}.${ctx.instance}`);
    candidates.push(`${ctx.role}.${slug(ctx.cargo)}`);
  }
  if (ctx.role) {
    candidates.push(`${ctx.role}.${ctx.instance}`);
    candidates.push(ctx.role);
  }
  candidates.push("default");
  for (const c of candidates) if (set.has(c)) return c;
  return available[0] ?? "default";
}

function slug(v: string) {
  return v.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
