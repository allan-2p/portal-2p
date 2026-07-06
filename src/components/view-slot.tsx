import { type ReactNode } from "react";
import { useViewVariant } from "@/hooks/use-view-variant";
import type { ScreenKey } from "@/lib/view-screens";

/**
 * Renderiza a variante correta de um "bloco" de tela.
 *
 * Uso:
 *   <ViewSlot
 *     screen="home"
 *     variants={{
 *       "default": <HeroDefault />,
 *       "vendedor.closer": <HeroCloser />,
 *       "diretor": <HeroDiretor />,
 *     }}
 *   />
 *
 * O ViewSlot NUNCA contém lógica de negócio — apenas mapeia chave → JSX.
 */
export function ViewSlot({
  screen,
  variants,
  fallback = null,
}: {
  screen: ScreenKey;
  variants: Record<string, ReactNode>;
  fallback?: ReactNode;
}) {
  const keys = Object.keys(variants);
  const { variant } = useViewVariant(screen, keys);
  return <>{variants[variant] ?? fallback ?? variants["default"] ?? null}</>;
}
