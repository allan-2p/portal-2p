import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Caminhos legados → caminho padronizado.
 * Solar usa o prefixo /solar, administração usa /admin (Carregadores e
 * Marketing já seguiam o padrão). Mantemos o redirecionamento para não
 * quebrar links salvos, favoritos e e-mails antigos.
 */
const LEGACY_PREFIXES: Array<[string, string]> = [
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

function legacyTarget(pathname: string): string | null {
  for (const [from, to] of LEGACY_PREFIXES) {
    if (pathname === from || pathname.startsWith(`${from}/`)) {
      return to + pathname.slice(from.length);
    }
  }
  return null;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const target = legacyTarget(location.pathname);
    if (target) throw redirect({ href: target + location.searchStr, replace: true });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { next: undefined } });
    return { user: data.user };
  },
  component: () => <Outlet />,
});
