import { Sparkles } from "lucide-react";
import { useState } from "react";
import { AtlasPanel } from "./atlas-panel";
import { atlasInsights } from "@/lib/mock-data";

export function AtlasFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-40 group flex items-center gap-3 pl-3 pr-4 py-3 rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.62_0.22_30)] text-primary-foreground shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
        title="Abrir Atlas"
      >
        <span className="relative h-9 w-9 rounded-xl bg-background/20 backdrop-blur flex items-center justify-center">
          <Sparkles className="h-5 w-5" />
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-background text-primary text-[10px] font-bold flex items-center justify-center border border-primary/30">
            {atlasInsights.length}
          </span>
        </span>
        <span className="text-left leading-tight hidden sm:block">
          <span className="block text-[11px] uppercase tracking-wider opacity-80">Atlas AI</span>
          <span className="block text-sm font-semibold">{atlasInsights.length} sugestões</span>
        </span>
      </button>
      <AtlasPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
