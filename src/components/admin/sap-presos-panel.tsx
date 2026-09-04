import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { pedidosPresosSap } from "@/lib/sap-presos.functions";

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const ROTULO: Record<string, string> = {
  "consulta-vazia": "SAP sem progresso",
  "consulta-erro": "Consulta com erro",
  "consulta-sem-avanco": "Sinal já refletido",
  avancou: "Avançou",
};

export function SapPresosPanel() {
  const buscar = useServerFn(pedidosPresosSap);
  const [dias, setDias] = useState(1);
  const q = useQuery({
    queryKey: ["sap-presos", dias],
    queryFn: () => buscar({ data: { dias } }),
  });

  const d = q.data;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-amber-500" /> Pedidos parados com OV no SAP
        </CardTitle>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Dias sem avanço</Label>
            <Input
              type="number"
              min={1}
              max={60}
              className="h-9 w-24"
              value={dias}
              onChange={(e) => setDias(Math.min(60, Math.max(1, Number(e.target.value) || 1)))}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => void q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${q.isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isError && (
          <p className="text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {(q.error as Error).message}
          </p>
        )}
        {d && (
          <div className="flex flex-wrap gap-4 text-sm">
            <span><strong>{d.total}</strong> parados há {d.dias}+ dia(s)</span>
            <span className="text-muted-foreground"><strong>{d.semSinal}</strong> sem sinal do SAP</span>
            <span className="text-destructive"><strong>{d.comErro}</strong> com erro de consulta</span>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                <th className="text-left px-3 py-2">Pedido</th>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">OV</th>
                <th className="text-right px-3 py-2">Dias</th>
                <th className="text-left px-3 py-2">Última consulta</th>
              </tr>
            </thead>
            <tbody>
              {(d?.pedidos ?? []).map((p) => (
                <tr key={p.id} className="border-b border-border/50 align-top">
                  <td className="px-3 py-2 font-medium">{p.numero ?? "—"}</td>
                  <td className="px-3 py-2 max-w-[220px] truncate">{p.cliente ?? "—"}</td>
                  <td className="px-3 py-2">{p.status ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{p.ov ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.diasParado}</td>
                  <td className="px-3 py-2">
                    <div className={p.ultimoEvento === "consulta-erro" ? "text-destructive" : ""}>
                      {p.ultimoEvento ? (ROTULO[p.ultimoEvento] ?? p.ultimoEvento) : "sem registro"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {dataHora(p.ultimaConsulta)}
                      {p.ultimaMensagem ? ` • ${p.ultimaMensagem}` : ""}
                    </div>
                  </td>
                </tr>
              ))}
              {!q.isLoading && !(d?.pedidos ?? []).length && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhum pedido parado além do prazo.
                  </td>
                </tr>
              )}
              {q.isLoading && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
