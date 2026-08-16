import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** Miniatura da foto do produto, com placeholder quando não há imagem. */
export function ProdutoFoto({
  url,
  alt,
  className,
}: {
  url?: string | null;
  alt?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "shrink-0 rounded-md border border-border bg-surface/60 overflow-hidden flex items-center justify-center",
        "h-12 w-14",
        className,
      )}
    >
      {url ? (
        <img src={url} alt={alt ?? "Foto do produto"} loading="lazy" className="h-full w-full object-contain" />
      ) : (
        <ImageOff className="h-4 w-4 text-muted-foreground/60" aria-hidden />
      )}
    </div>
  );
}
