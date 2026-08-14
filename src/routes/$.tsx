import { createFileRoute, Link, redirect } from "@tanstack/react-router";

/**
 * Caminhos legados → caminho padronizado (Solar em /solar, administração em /admin).
 * Links salvos, favoritos e e-mails antigos continuam funcionando.
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

export const Route = createFileRoute("/$")({
  head: () => ({
    meta: [
      { title: "Página não encontrada — Portal 2P" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: ({ location }) => {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    for (const [from, to] of LEGACY_PREFIXES) {
      if (path === from || path.startsWith(`${from}/`)) {
        throw redirect({ href: to + path.slice(from.length) + location.searchStr, replace: true });
      }
    }
  },
  component: NotFoundPage,
});

function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <p className="max-w-md text-muted-foreground">
        O endereço acessado não existe mais ou foi movido. Os caminhos do portal foram
        padronizados em <code>/solar</code>, <code>/carregadores</code>, <code>/marketing</code> e{" "}
        <code>/admin</code>.
      </p>
      <Link to="/" className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">
        Voltar para a Home
      </Link>
    </main>
  );
}
