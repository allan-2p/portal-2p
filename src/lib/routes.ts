/**
 * Fonte única de verdade para caminhos do portal.
 *
 * `AppPath` é derivado da árvore de rotas gerada pelo TanStack Router, então
 * qualquer link (menu, breadcrumb, redirect) tipado como `AppPath` quebra o
 * typecheck se a rota deixar de existir — nada de link quebrado em produção.
 */
import type { FileRoutesByFullPath } from "@/routeTree.gen";

type RawPath = keyof FileRoutesByFullPath;
type StripTrailingSlash<T extends string> = T extends "/"
  ? "/"
  : T extends `${infer R}/`
    ? R
    : T;

/** Todos os caminhos válidos do app (sem barra final, exceto a raiz). */
export type AppPath = StripTrailingSlash<RawPath>;

/**
 * Caminhos legados → caminho padronizado.
 * Solar usa o prefixo /solar e a administração usa /admin (Carregadores e
 * Marketing já seguiam o padrão). Mantemos o redirecionamento para não quebrar
 * links salvos, favoritos e e-mails antigos.
 */
export const LEGACY_PREFIXES: Array<[string, AppPath]> = [
  ["/orcamentos", "/solar/propostas"],
  ["/atlas", "/solar/atlas"],
  ["/tarefas", "/solar/tarefas"],
  ["/pedidos", "/solar/pedidos"],
  ["/cupons", "/solar/cupons"],
  ["/dashboards", "/solar/dashboards"],
  ["/clientes", "/solar/clientes"],
  ["/usuarios", "/admin/usuarios"],
  ["/integracoes", "/admin/integracoes"],
];

/** Retorna o caminho novo equivalente a um caminho legado, ou null. */
export function legacyTarget(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const [from, to] of LEGACY_PREFIXES) {
    if (path === from || path.startsWith(`${from}/`)) {
      return to + path.slice(from.length);
    }
  }
  return null;
}

/** Helper tipado para montar links de integrações (rota com parâmetro). */
export function integracaoPath(slug: string): string {
  return `/admin/integracoes/${slug}`;
}
