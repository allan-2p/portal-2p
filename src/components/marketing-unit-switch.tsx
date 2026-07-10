import { useMarketingUnit } from "./instance-provider";
import { cn } from "@/lib/utils";

/**
 * Sub-switch que aparece apenas dentro da instância Marketing para alternar
 * a visão entre 2P Solar e 2P Carregadores. Não afeta a instância global.
 */
export function MarketingUnitSwitch() {
  const { marketingUnit, setMarketingUnit } = useMarketingUnit();
  return (
    <div className="flex bg-surface-2 rounded-lg p-0.5 border border-border text-xs h-9 items-center">
      <button
        onClick={() => setMarketingUnit("solar")}
        className={cn(
          "px-3 h-8 rounded-md font-medium transition-colors flex items-center gap-1.5",
          marketingUnit === "solar"
            ? "bg-[oklch(0.68_0.2_47)] text-white shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="h-2 w-2 rounded-sm bg-[oklch(0.68_0.2_47)]" />
        2P Solar
      </button>
      <button
        onClick={() => setMarketingUnit("carregadores")}
        className={cn(
          "px-3 h-8 rounded-md font-medium transition-colors flex items-center gap-1.5",
          marketingUnit === "carregadores"
            ? "bg-[oklch(0.5_0.19_265)] text-white shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="h-2 w-2 rounded-sm bg-[oklch(0.5_0.19_265)]" />
        2P Carregadores
      </button>
    </div>
  );
}
