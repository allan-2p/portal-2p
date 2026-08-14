import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { legacyTarget } from "@/lib/routes";

export const Route = createFileRoute("/$")({
  head: () => ({
    meta: [
      { title: "Página não encontrada — Portal 2P" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: ({ location }) => {
    const target = legacyTarget(location.pathname);
    if (target) throw redirect({ href: target + location.searchStr, replace: true });
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
