import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getIntegrationsHealth } from "@/lib/integrations-health.functions";
import { cn } from "@/lib/utils";

export type IntegrationHealthItem = {
  slug: string;
  status: "ok" | "error" | "off";
  detail: string;
  lastSync: string | null;
};

/** Estado de conexão de todas as integrações (compartilhado entre menu e página). */
export function useIntegrationsHealth(enabled = true) {
  const fetchHealth = useServerFn(getIntegrationsHealth);
  return useQuery({
    queryKey: ["integrations", "health"],
    queryFn: () => fetchHealth(),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useIntegrationHealthMap(enabled = true) {
  const q = useIntegrationsHealth(enabled);
  const map = new Map<string, IntegrationHealthItem>();
  for (const i of (q.data?.items ?? []) as IntegrationHealthItem[]) map.set(i.slug, i);
  return { ...q, map };
}

const DOT: Record<IntegrationHealthItem["status"], string> = {
  ok: "bg-emerald-500",
  error: "bg-destructive",
  off: "bg-muted-foreground/50",
};

const LABEL: Record<IntegrationHealthItem["status"], string> = {
  ok: "Conectado",
  error: "Com erro",
  off: "Não configurado",
};

export function formatLastSync(iso: string | null | undefined) {
  if (!iso) return "sem sincronização registrada";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins} min`;
  if (mins < 60 * 24) return `há ${Math.round(mins / 60)} h`;
  return d.toLocaleString("pt-BR");
}

export function IntegrationStatusDot({
  item,
  loading,
  className,
}: {
  item?: IntegrationHealthItem;
  loading?: boolean;
  className?: string;
}) {
  if (loading && !item) {
    return <span className={cn("h-2 w-2 rounded-full bg-muted animate-pulse shrink-0", className)} />;
  }
  if (!item) return null;
  return (
    <span
      title={`${LABEL[item.status]} · ${formatLastSync(item.lastSync)}`}
      className={cn("h-2 w-2 rounded-full shrink-0", DOT[item.status], item.status === "ok" && "shadow-[0_0_0_3px] shadow-emerald-500/15", className)}
    />
  );
}

export function IntegrationStatusBadge({ item, loading }: { item?: IntegrationHealthItem; loading?: boolean }) {
  if (loading && !item) {
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Verificando…</span>;
  }
  if (!item) return null;
  const cls =
    item.status === "ok"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : item.status === "error"
        ? "bg-destructive/15 text-destructive"
        : "bg-surface-2 text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full font-medium", cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[item.status])} />
      {LABEL[item.status]}
    </span>
  );
}
