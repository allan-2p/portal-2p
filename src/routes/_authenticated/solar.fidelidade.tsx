import { createFileRoute } from "@tanstack/react-router";
import { Gift, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/solar/fidelidade")({
  head: () => ({
    meta: [
      { title: "Plano Fidelidade 2P — Portal 2P" },
      { name: "description", content: "Programa de fidelidade do Grupo 2P: pontos, faturamento elegível e brindes. Em breve." },
      { property: "og:title", content: "Plano Fidelidade 2P — Portal 2P" },
      { property: "og:description", content: "Programa de fidelidade do Grupo 2P. Em breve." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SolarFidelidadePage,
});

function SolarFidelidadePage() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.62_0.22_30)] flex items-center justify-center shadow-lg">
          <Gift className="h-7 w-7 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-display font-bold text-2xl">Plano Fidelidade 2P</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Acompanhe seus pontos, faturamento elegível e brindes disponíveis para presentear seus clientes.
          </p>
        </div>
      </div>

      <div className="relative glass rounded-2xl p-8 overflow-hidden">
        <div className="relative">
          <div className="grid md:grid-cols-4 gap-4 select-none pointer-events-none">
            {[
              { l: "Pontos disponíveis", v: "12.840", s: "Atualizado hoje" },
              { l: "Faturamento elegível", v: "R$ 482k", s: "Acumulado 2026" },
              { l: "Brindes resgatados", v: "8", s: "Nos últimos 90 dias" },
              { l: "Próximo nível", v: "+R$ 60k", s: "Para nível Prata" },
            ].map((c) => (
              <div key={c.l} className="rounded-xl bg-surface-2 p-5">
                <div className="text-xs text-muted-foreground">{c.l}</div>
                <div className="font-display font-bold text-2xl mt-2">{c.v}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{c.s}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid md:grid-cols-3 gap-4 select-none pointer-events-none">
            {[
              { l: "Brinde disponível", v: "Kit Limpeza Premium", s: "Custo: 2.400 pts" },
              { l: "Brinde disponível", v: "Voucher Distribuidor", s: "Custo: 4.000 pts" },
              { l: "Brinde disponível", v: "Viagem técnica 2P", s: "Custo: 10.000 pts" },
            ].map((c, idx) => (
              <div key={idx} className="rounded-xl bg-surface-2 p-5 border border-border">
                <div className="text-xs text-muted-foreground">{c.l}</div>
                <div className="font-display font-bold text-lg mt-1">{c.v}</div>
                <div className="text-[11px] text-primary mt-1 font-medium">{c.s}</div>
              </div>
            ))}
          </div>
          <div className="absolute inset-0 backdrop-blur-md bg-background/40 flex items-center justify-center rounded-xl">
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-background/80 border border-border shadow-lg">
              <Lock className="h-4 w-4 text-primary" />
              <span className="font-display font-semibold text-sm">Em breve</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
