import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { simularWebhookPixFn } from "@/lib/pagamentos-pix.functions";

const EXEMPLO = JSON.stringify(
  { pix: [{ txid: "2P050004ABC", endToEndId: "E1", valor: "1000.00", horario: new Date().toISOString() }] },
  null,
  2,
);

export function PixSimuladorPanel() {
  const [payload, setPayload] = useState(EXEMPLO);
  const [repeticoes, setRepeticoes] = useState(3);
  const simular = useServerFn(simularWebhookPixFn);

  const run = useMutation({
    mutationFn: () => simular({ data: { payload, repeticoes } }),
    onError: (e: any) => toast.error(e?.message ?? "Falha na simulação."),
  });

  const r = run.data;

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold">Simulador de webhook Pix (dry-run)</h2>
        <p className="text-sm text-muted-foreground">
          Reprocessa o mesmo payload várias vezes sobre uma cópia em memória dos pedidos para conferir
          a idempotência. Nenhum dado é gravado.
        </p>
      </header>

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <Textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          rows={10}
          spellCheck={false}
          className="font-mono text-xs"
          aria-label="Payload do webhook Pix"
        />
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-muted-foreground">Reentregas do mesmo payload</span>
            <Input
              type="number"
              min={1}
              max={20}
              value={repeticoes}
              onChange={(e) => setRepeticoes(Math.min(Math.max(Number(e.target.value) || 1, 1), 20))}
              className="mt-1"
            />
          </label>
          <Button onClick={() => run.mutate()} disabled={run.isPending} className="w-full">
            {run.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="mr-2 h-4 w-4" />
            )}
            Simular reprocessamento
          </Button>

          {r && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                r.idempotente ? "border-emerald-500/40 bg-emerald-500/10" : "border-destructive/40 bg-destructive/10"
              }`}
            >
              <p className="flex items-center gap-2 font-medium">
                {r.idempotente ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                )}
                {r.idempotente ? "Idempotente" : "Atualização duplicada detectada"}
              </p>
              <p className="mt-1 text-muted-foreground">
                {r.pedidosEncontrados} pedido(s) • {r.escritas} atualização(ões) em {r.repeticoes} entregas
              </p>
            </div>
          )}
        </div>
      </div>

      {r && (
        <div className="mt-4 space-y-2">
          {r.rodadas.map((rodada) => (
            <div key={rodada.rodada} className="rounded-lg border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">Entrega #{rodada.rodada}</span>
                <span className="text-muted-foreground">
                  {rodada.escritasNaRodada === 0
                    ? "sem alteração (evento já aplicado)"
                    : `${rodada.escritasNaRodada} pedido(s) atualizado(s)`}
                </span>
              </div>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {(rodada.resultado.detalhes ?? []).map((d, i) => (
                  <li key={i}>
                    {d.txid} • {d.tipo}
                    {d.skipped ? ` • ignorado: ${d.motivo}` : ` • ${d.de} → ${d.para}`}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {r.estadoFinal.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Estado final simulado:{" "}
              {r.estadoFinal
                .map((p) => `${p.numero ?? p.id}: ${p.status} (${p.pagamento_status ?? "-"})`)
                .join(" • ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
