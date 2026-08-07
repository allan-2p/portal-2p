import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { CpoConfigTab } from "@/components/cpo-config-tab";

export const Route = createFileRoute("/_authenticated/carregadores/comissoes")({
  head: () => ({
    meta: [
      { title: "Comissões CPO — Portal 2P Carregadores" },
      { name: "description", content: "Política tributária e regras de comissão das propostas de carregadores." },
      { property: "og:title", content: "Comissões CPO — Portal 2P Carregadores" },
      { property: "og:description", content: "Defina base e percentual de comissão, IPI, PIS/COFINS e margens mínimas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComissoesCpoPage,
});

function ComissoesCpoPage() {
  return (
    <AppLayout>
      <div className="max-w-[1700px] mx-auto space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-primary font-semibold">Moderação</div>
          <h1 className="text-3xl font-bold mt-1">Comissões</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Base de comissão, percentual e parâmetros tributários usados no DRE das propostas.
          </p>
        </div>
        <CpoConfigTab />
      </div>
    </AppLayout>
  );
}
