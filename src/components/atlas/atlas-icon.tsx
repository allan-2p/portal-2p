import { cn } from "@/lib/utils";

export function AtlasIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5", className)}
      aria-hidden="true"
    >
      {/* Globo com meridianos */}
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
      <path d="M5.6 6.5c2.8 1.4 11.6 1.4 14.4 0" />
      <path d="M5.6 17.5c2.8-1.4 11.6-1.4 14.4 0" />
      {/* Brilho de IA no topo direito */}
      <path d="M17 4l.6 1.4L19 6l-1.4.6L17 8l-.6-1.4L15 6l1.4-.6L17 4z" />
      <circle cx="17" cy="6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
