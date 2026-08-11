import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminSecurityAlerts } from "@/lib/activity.functions";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Globe, Loader2, Mail, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

function fmtTime(d: string) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function SecurityAlerts() {
  const run = useServerFn(adminSecurityAlerts);
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [failThreshold, setFailThreshold] = useState(5);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-security-alerts", windowMinutes, failThreshold],
    queryFn: () => run({ data: { windowMinutes, failThreshold } }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const alerts = data?.alerts ?? [];
  const high = alerts.filter((a) => a.severity === "alta").length;

  return (
    <div
      className={cn(
        "glass rounded-xl overflow-hidden",
        high > 0 && "ring-1 ring-destructive/40",
      )}
    >
      <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2 flex-wrap">
        <div className="font-semibold text-sm flex items-center gap-2">
          {alerts.length > 0 ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-primary" />
          )}
          Alertas de segurança
        </div>
        {alerts.length > 0 && (
          <Badge variant="outline" className="text-[11px] border-destructive/40 text-destructive">
            {alerts.length} alerta{alerts.length === 1 ? "" : "s"}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Select value={String(windowMinutes)} onValueChange={(v) => setWindowMinutes(Number(v))}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">Últimos 15min</SelectItem>
              <SelectItem value="60">Última hora</SelectItem>
              <SelectItem value="360">Últimas 6h</SelectItem>
              <SelectItem value="1440">Últimas 24h</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(failThreshold)} onValueChange={(v) => setFailThreshold(Number(v))}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">A partir de 3 falhas</SelectItem>
              <SelectItem value="5">A partir de 5 falhas</SelectItem>
              <SelectItem value="10">A partir de 10 falhas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="p-6 text-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mx-auto" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground text-center">
          Nenhum padrão suspeito de login no período monitorado.
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {alerts.map((a) => (
            <li key={a.id} className="px-4 py-3 flex items-start gap-3">
              <div
                className={cn(
                  "h-8 w-8 rounded-lg grid place-items-center shrink-0",
                  a.severity === "alta"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-amber-500/15 text-amber-500",
                )}
              >
                {a.kind.startsWith("ip") ? <Globe className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{a.message}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {fmtTime(a.firstAt)} → {fmtTime(a.lastAt)}
                  {a.samples.length > 0 ? ` • ${a.samples.join(", ")}` : ""}
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-[11px] shrink-0",
                  a.severity === "alta"
                    ? "border-destructive/40 text-destructive"
                    : "border-amber-500/40 text-amber-500",
                )}
              >
                {a.severity === "alta" ? "Alta" : "Média"}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
