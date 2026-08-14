import { Clock } from "lucide-react";

/** Card "em breve" dos insights do Atlas, reaproveitado nas telas de Marketing. */
export function AtlasSoonCard() {
  return (
    <div className="relative glass rounded-2xl p-5 overflow-hidden">
      <div aria-hidden className="absolute inset-0 blur-sm pointer-events-none select-none opacity-50 p-5">
        <div className="text-xs uppercase tracking-wider text-primary">Insights do Atlas</div>
        <div className="mt-2 space-y-1 text-sm">
          <div>• Aumentar 15% do budget em criativos com CPA &lt; R$ 150</div>
          <div>• Retomar 3 leads MQL sem resposta há mais de 7 dias</div>
          <div>• Publicar case do cliente Vertice — historicamente melhor CTR</div>
        </div>
      </div>
      <div className="relative flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-[oklch(0.65_0.2_30)] flex items-center justify-center">
          <Clock className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-primary font-semibold">Em breve</div>
          <div className="font-medium">Insights automáticos do Atlas para Marketing</div>
        </div>
      </div>
    </div>
  );
}
