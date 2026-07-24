import { useMarketingUnit } from "./instance-provider";
import { cn } from "@/lib/utils";

/**
 * Switch de organização dentro do Marketing: Solar, Carregadores e Station.
 * Solar fica isolado à esquerda; Carregadores e Station ficam agrupados à direita
 * porque compartilham o mesmo conjunto de brands/relatórios de veículos.
 */
export function MarketingUnitSwitch() {
  const { marketingUnit, setMarketingUnit } = useMarketingUnit();
  const Btn = ({ id, label, color }: { id: "solar" | "carregadores" | "station"; label: string; color: string }) => (
    <button
      onClick={() => setMarketingUnit(id)}
      className={cn(
        "px-3 h-8 rounded-md font-medium transition-colors flex items-center gap-1.5",
        marketingUnit === id
          ? "text-white shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
      style={marketingUnit === id ? { background: color } : undefined}
    >
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-1">
      <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-xs h-9 items-center">
        <Btn id="solar" label="2P Solar" color="oklch(0.68 0.2 47)" />
      </div>
      <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-xs h-9 items-center">
        <Btn id="carregadores" label="2P Carregadores" color="oklch(0.5 0.19 265)" />
        <Btn id="station" label="Station" color="oklch(0.78 0.14 90)" />
      </div>
    </div>
  );
}
