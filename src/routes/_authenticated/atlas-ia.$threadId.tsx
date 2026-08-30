import { createFileRoute, Link } from "@tanstack/react-router";
import { Radar, Sparkles } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { AtlasChat } from "@/components/atlas/atlas-chat";

export const Route = createFileRoute("/_authenticated/atlas-ia/$threadId")({
  head: () => ({
    meta: [
      { title: "Atlas — Insights e planos de ação | Portal 2P" },
      {
        name: "description",
        content:
          "Converse com o Atlas para obter insights por cliente e por período e montar planos de ação comerciais no Portal 2P.",
      },
      { property: "og:title", content: "Atlas — Insights e planos de ação | Portal 2P" },
      {
        property: "og:description",
        content: "Assistente de inteligência comercial do Grupo 2P com dados de clientes, pedidos e metas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AtlasThreadPage,
});

function AtlasThreadPage() {
  const { threadId } = Route.useParams();
  return (
    <AppLayout>
      <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold">Atlas</h1>
          <Button variant="outline" size="sm" className="ml-auto" asChild>
            <Link to="/atlas-ia/radar">
              <Radar className="mr-1.5 h-4 w-4" />
              Radar
            </Link>
          </Button>
        </header>
        <div className="min-h-0 flex-1">
          <AtlasChat threadId={threadId} />
        </div>
      </div>
    </AppLayout>
  );
}
