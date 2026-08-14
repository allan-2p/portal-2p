import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock, Save, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { integrationBySlug } from "@/lib/integrations-catalog";
import {
  DEFAULT_STALE_MINUTES,
  listIntegrationAlertSettings,
  saveIntegrationAlertSetting,
  type IntegrationAlertSetting,
} from "@/lib/integration-alerts.functions";
import { formatLastSync, useIntegrationsHealth, type IntegrationHealthItem } from "./integration-status";

export type IntegrationAlertLevel = "error" | "stale" | "off";

export type IntegrationAlert = {
  slug: string;
  name: string;
  level: IntegrationAlertLevel;
  message: string;
  lastSync: string | null;
  staleMinutes: number;
};

export function useIntegrationAlertSettings(enabled = true) {
  const fetchSettings = useServerFn(listIntegrationAlertSettings);
  return useQuery({
    queryKey: ["integrations", "alert-settings"],
    queryFn: () => fetchSettings(),
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

function settingFor(items: IntegrationAlertSetting[] | undefined, slug: string): IntegrationAlertSetting {
  return (
    items?.find((s) => s.slug === slug) ?? {
      slug,
      alert_enabled: true,
      stale_minutes: DEFAULT_STALE_MINUTES,
    }
  );
}

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.round((Date.now() - t) / 60000);
}

export function describeStaleLimit(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % (60 * 24) === 0) return `${minutes / (60 * 24)} dia(s)`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${Math.round((minutes / 60) * 10) / 10} h`;
}

/** Avalia uma integração contra o limite configurado. `null` = tudo certo. */
export function evaluateIntegration(
  item: IntegrationHealthItem | undefined,
  setting: IntegrationAlertSetting,
): IntegrationAlert | null {
  if (!item || !setting.alert_enabled) return null;
  const name = integrationBySlug(item.slug)?.name ?? item.slug;
  const base = { slug: item.slug, name, lastSync: item.lastSync, staleMinutes: setting.stale_minutes };

  if (item.status === "error") {
    return { ...base, level: "error", message: item.detail || "Integração desconectada." };
  }
  if (item.status === "off") {
    return { ...base, level: "off", message: item.detail || "Integração não configurada." };
  }
  const mins = minutesSince(item.lastSync);
  if (mins !== null && mins > setting.stale_minutes) {
    return {
      ...base,
      level: "stale",
      message: `Última sincronização ${formatLastSync(item.lastSync)} — acima do limite de ${describeStaleLimit(setting.stale_minutes)}.`,
    };
  }
  return null;
}

/**
 * Alertas ativos das integrações (desconectadas, não configuradas ou com a
 * última sincronização atrasada além do limite configurável).
 */
export function useIntegrationAlerts(enabled = true) {
  const health = useIntegrationsHealth(enabled);
  const settings = useIntegrationAlertSettings(enabled);

  const items = (health.data?.items ?? []) as IntegrationHealthItem[];
  const alerts: IntegrationAlert[] = [];
  const byslug = new Map<string, IntegrationAlert>();
  for (const item of items) {
    const alert = evaluateIntegration(item, settingFor(settings.data?.items, item.slug));
    if (alert) {
      alerts.push(alert);
      byslug.set(alert.slug, alert);
    }
  }

  return {
    alerts,
    bySlug: byslug,
    settings: settings.data?.items ?? [],
    isLoading: health.isLoading || settings.isLoading,
  };
}

/** Dispara um toast por integração com problema, uma vez por sessão. */
export function useIntegrationAlertNotifications(alerts: IntegrationAlert[]) {
  const notified = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const a of alerts) {
      const key = `${a.slug}:${a.level}`;
      if (notified.current.has(key)) continue;
      notified.current.add(key);
      const title =
        a.level === "error"
          ? `${a.name} desconectada`
          : a.level === "stale"
            ? `${a.name} com sincronização atrasada`
            : `${a.name} não configurada`;
      const show = a.level === "error" ? toast.error : toast.warning;
      show(title, { description: a.message, duration: 8000 });
    }
  }, [alerts]);
}

const LEVEL_STYLE: Record<IntegrationAlertLevel, string> = {
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  stale: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  off: "border-border bg-surface-2 text-muted-foreground",
};

export function IntegrationAlertBadge({ alert }: { alert?: IntegrationAlert | null }) {
  if (!alert) return null;
  const Icon = alert.level === "error" ? XCircle : alert.level === "stale" ? Clock : AlertTriangle;
  const label = alert.level === "error" ? "Desconectada" : alert.level === "stale" ? "Atrasada" : "Não configurada";
  return (
    <span
      title={alert.message}
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full font-medium border",
        LEVEL_STYLE[alert.level],
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

/** Faixa de alertas exibida no topo da página de Integrações. */
export function IntegrationAlertsBanner({ notify = true }: { notify?: boolean }) {
  const { alerts, isLoading } = useIntegrationAlerts();
  useIntegrationAlertNotifications(notify ? alerts : []);

  if (isLoading || !alerts.length) return null;
  const critical = alerts.filter((a) => a.level !== "off");

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 space-y-3",
        critical.length ? LEVEL_STYLE[critical[0]!.level] : LEVEL_STYLE.off,
      )}
      role="alert"
    >
      <div className="flex items-center gap-2 font-semibold text-sm">
        <AlertTriangle className="h-4 w-4" />
        {alerts.length} integração(ões) precisam de atenção
      </div>
      <ul className="space-y-1.5">
        {alerts.map((a) => (
          <li key={a.slug} className="text-sm flex flex-wrap items-center gap-2">
            <Link to="/admin/integracoes/$slug" params={{ slug: a.slug }} className="font-medium underline underline-offset-2">
              {a.name}
            </Link>
            <IntegrationAlertBadge alert={a} />
            <span className="text-foreground/80">{a.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Card de configuração do alerta de uma integração (somente admin salva). */
export function IntegrationAlertSettingsCard({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const settings = useIntegrationAlertSettings();
  const save = useServerFn(saveIntegrationAlertSetting);

  const current = settingFor(settings.data?.items, slug);
  const [enabled, setEnabled] = useState(current.alert_enabled);
  const [minutes, setMinutes] = useState(String(current.stale_minutes));
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current || settings.isLoading) return;
    hydrated.current = true;
    setEnabled(current.alert_enabled);
    setMinutes(String(current.stale_minutes));
  }, [settings.isLoading, current.alert_enabled, current.stale_minutes]);

  const mutation = useMutation({
    mutationFn: () =>
      save({ data: { slug, alert_enabled: enabled, stale_minutes: Number(minutes) || DEFAULT_STALE_MINUTES } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations", "alert-settings"] });
      toast.success("Alertas atualizados");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar alertas"),
  });

  const invalid = !Number(minutes) || Number(minutes) < 5;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div>
        <h2 className="font-semibold">Alertas</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Avisar quando a integração ficar desconectada ou a última sincronização passar do limite abaixo.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={`alert-${slug}`} className="text-sm font-normal">
          Alertas ativos
        </Label>
        <Switch id={`alert-${slug}`} checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`stale-${slug}`}>Limite de atraso (minutos)</Label>
        <Input
          id={`stale-${slug}`}
          type="number"
          min={5}
          step={5}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="max-w-[200px]"
        />
        <p className="text-xs text-muted-foreground">
          {invalid ? "Informe ao menos 5 minutos." : `Equivale a ${describeStaleLimit(Number(minutes))}.`}
        </p>
      </div>

      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || invalid} size="sm" className="gap-2">
        <Save className="h-4 w-4" /> Salvar alertas
      </Button>
    </div>
  );
}
