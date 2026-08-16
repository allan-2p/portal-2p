import { useCallback, useRef, useState } from "react";
import { Plus, Trash2, Sparkles, Pin } from "lucide-react";
import type { ClientNoteCard } from "@/lib/client-notes.functions";
import { cn } from "@/lib/utils";

const COLORS: Record<ClientNoteCard["color"], string> = {
  amber: "bg-amber-400/15 border-amber-400/40 text-foreground",
  sky: "bg-sky-400/15 border-sky-400/40 text-foreground",
  emerald: "bg-emerald-400/15 border-emerald-400/40 text-foreground",
  rose: "bg-rose-400/15 border-rose-400/40 text-foreground",
  violet: "bg-violet-400/15 border-violet-400/40 text-foreground",
};

const DOT: Record<ClientNoteCard["color"], string> = {
  amber: "bg-amber-400",
  sky: "bg-sky-400",
  emerald: "bg-emerald-400",
  rose: "bg-rose-400",
  violet: "bg-violet-400",
};

const ORDER: ClientNoteCard["color"][] = ["amber", "sky", "emerald", "rose", "violet"];

/**
 * Mapa mental do cliente: cartões livres que o vendedor arrasta pelo quadro.
 * Tudo o que estiver aqui vira contexto para o Atlas.
 */
export function AtlasBoard({
  cards,
  onChange,
}: {
  cards: ClientNoteCard[];
  onChange: (next: ClientNoteCard[]) => void;
}) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const offset = useRef({ x: 0, y: 0 });

  const update = useCallback(
    (id: string, patch: Partial<ClientNoteCard>) =>
      onChange(cards.map((c) => (c.id === id ? { ...c, ...patch } : c))),
    [cards, onChange],
  );

  const addCard = () => {
    const idx = cards.length;
    onChange([
      ...cards,
      {
        id: `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        text: "",
        color: ORDER[idx % ORDER.length]!,
        x: 6 + ((idx * 17) % 60),
        y: 8 + ((idx * 23) % 55),
      },
    ]);
  };

  const onPointerDown = (e: React.PointerEvent, card: ClientNoteCard) => {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    offset.current = {
      x: ((e.clientX - rect.left) / rect.width) * 100 - card.x,
      y: ((e.clientY - rect.top) / rect.height) * 100 - card.y,
    };
    setDragging(card.id);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100 - offset.current.x;
    const y = ((e.clientY - rect.top) / rect.height) * 100 - offset.current.y;
    update(dragging, {
      x: Math.min(88, Math.max(0, x)),
      y: Math.min(88, Math.max(0, y)),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Mapa mental do cliente</h3>
        <span className="text-[11px] text-muted-foreground">
          arraste os cartões · tudo vira contexto para o Atlas
        </span>
        <button
          onClick={addCard}
          className="ml-auto inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> Novo cartão
        </button>
      </div>

      <div
        ref={boardRef}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
        className="relative h-[460px] rounded-xl border border-border bg-background/40 overflow-hidden touch-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--color-muted-foreground) 22%, transparent) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      >
        {cards.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-2 px-6 pointer-events-none">
            <Sparkles className="h-6 w-6 text-primary/60" />
            <div className="text-sm text-muted-foreground max-w-xs">
              Quadro vazio. Crie cartões com decisores, dores, concorrentes, próximos passos —
              o Atlas lê tudo isso.
            </div>
          </div>
        )}

        {cards.map((card) => (
          <div
            key={card.id}
            onPointerDown={(e) => onPointerDown(e, card)}
            className={cn(
              "absolute w-[210px] rounded-lg border p-2 shadow-sm backdrop-blur-sm select-none",
              COLORS[card.color],
              dragging === card.id ? "cursor-grabbing ring-2 ring-primary/50 z-10" : "cursor-grab",
            )}
            style={{ left: `${card.x}%`, top: `${card.y}%` }}
          >
            <div className="flex items-center gap-1 mb-1.5">
              {ORDER.map((c) => (
                <button
                  key={c}
                  data-no-drag
                  onClick={() => update(card.id, { color: c })}
                  aria-label={`Cor ${c}`}
                  className={cn(
                    "h-2.5 w-2.5 rounded-full transition-transform",
                    DOT[c],
                    card.color === c ? "scale-125 ring-1 ring-foreground/40" : "opacity-50",
                  )}
                />
              ))}
              <button
                data-no-drag
                onClick={() => update(card.id, { pinned: !card.pinned })}
                className={cn(
                  "ml-auto p-1 rounded hover:bg-background/60",
                  card.pinned ? "text-primary" : "text-muted-foreground",
                )}
                aria-label="Fixar cartão"
              >
                <Pin className="h-3 w-3" />
              </button>
              <button
                data-no-drag
                onClick={() => onChange(cards.filter((c) => c.id !== card.id))}
                className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-background/60"
                aria-label="Remover cartão"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <textarea
              data-no-drag
              value={card.text}
              onChange={(e) => update(card.id, { text: e.target.value })}
              placeholder="Escreva aqui…"
              className="w-full h-20 bg-transparent text-xs resize-none focus:outline-none placeholder:text-muted-foreground/70"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
