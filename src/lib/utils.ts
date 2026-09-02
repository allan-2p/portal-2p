import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Abrevia um nome de pessoa: "Allan Rocha da Silva" → "Allan R.".
 * Mantém o primeiro nome e a inicial do segundo (ignorando preposições).
 */
export function abreviaNome(nome?: string | null): string {
  const partes = String(nome ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return "";
  const primeiro = partes[0] as string;
  const conectores = new Set(["da", "de", "do", "das", "dos", "e"]);
  const segundo = partes.slice(1).find((p) => !conectores.has(p.toLowerCase()));
  if (!segundo) return primeiro;
  return `${primeiro} ${segundo.charAt(0).toUpperCase()}.`;
}
