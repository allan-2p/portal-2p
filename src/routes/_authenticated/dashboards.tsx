import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useState } from "react";
import { VendedorFilter } from "@/components/vendedor-filter";
import { GoalsPanel } from "@/components/goals-panel";
import { CARTEIRA_OWNER_IDS } from "@/lib/salespeople";

export const Route = createFileRoute("/_authenticated/dashboards")({
  head: () => ({ meta: [{ title: "Dashboards — Portal 2P" }] }),
  component: DashboardsPage,
});

type View = "dashboard" | "metas";

function DashboardsPage() {
  const [ownerId, setOwnerId] = useState<string>("all");
  const [view, setView] = useState<View>("dashboard");

  const tabs: { key: View; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "metas", label: "Metas" },
  ];

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Pessoal</div>
            <h1 className="text-3xl font-bold mt-1">Meus Dashboards</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Acompanhe suas próprias metas, comissões e indicadores.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <VendedorFilter value={ownerId} onChange={setOwnerId} allowedIds={[...CARTEIRA_OWNER_IDS]} />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground mr-2">Visão:</span>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                view === t.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-surface border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {view === "dashboard" ? (
          <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
            Dashboard principal em breve.
          </div>
        ) : (
          <GoalsPanel ownerId={ownerId} />
        )}
      </div>
    </AppLayout>
  );
}
