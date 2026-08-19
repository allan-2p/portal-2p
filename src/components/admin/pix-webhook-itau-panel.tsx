import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Copy, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cadastrarWebhookPixFn,
  consultarWebhookPixFn,
  excluirWebhookPixFn,
  urlWebhookPixFn,
} from "@/lib/pix-webhook-itau.functions";

export function PixWebhookItauPanel() {
  const sugerida = useServerFn(urlWebhookPixFn);
  const consultar = useServerFn(consultarWebhookPixFn);
  const cadastrar = useServerFn(cadastrarWebhookPixFn);
  const excluir = useServerFn(excluirWebhookPixFn);
  const [url, setUrl] = useState("");
  const [indisponibilidade, setIndisponibilidade] = useState<string | null>(null);

  const sugestao = useQuery({ queryKey: ["pix-webhook-url"], queryFn: () => sugerida({}) });

  useEffect(() => {
    if (sugestao.data?.url && !url) setUrl(sugestao.data.url);
  }, [sugestao.data, url]);

  const atual = useMutation({
    mutationFn: () => consultar({}),
    onSuccess: (result) => {
      if (!result.ok) {
        setIndisponibilidade(result.message);
        toast.warning("O serviço Pix do Itaú está temporariamente indisponível.");
        return;
      }
      setIndisponibilidade(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao consultar o webhook."),
  });
  const salvar = useMutation({
    mutationFn: () => cadastrar({ data: { webhookUrl: url } }),
    onSuccess: (result) => {
      if (!result.ok) {
        setIndisponibilidade(result.message);
        toast.warning("O serviço Pix do Itaú está temporariamente indisponível.");
        return;
      }
      setIndisponibilidade(null);
      toast.success("Webhook cadastrado no Itaú.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao cadastrar o webhook."),
  });
  const remover = useMutation({
    mutationFn: () => excluir({}),
    onSuccess: (result) => {
      if (!result.ok) {
        setIndisponibilidade(result.message);
        toast.warning("O serviço Pix do Itaú está temporariamente indisponível.");
        return;
      }
      setIndisponibilidade(null);
      toast.success("Webhook removido no Itaú.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover o webhook."),
  });

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold">Webhook Pix no Itaú</h2>
        <p className="text-sm text-muted-foreground">
          O portal do Itaú não tem tela de cadastro: o webhook é registrado pela API
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">PUT /webhook/&#123;chave&#125;</code>.
          O Itaú acrescenta o sufixo <code className="rounded bg-muted px-1 py-0.5 text-xs">/pix</code> à URL,
          por isso o token vai no caminho.
        </p>
      </header>

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://portal.2pgroup.app/api/public/hooks/pix-itau/<token>"
            className="font-mono text-xs"
            aria-label="URL do webhook Pix"
          />
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(url);
              toast.success("URL copiada.");
            }}
          >
            <Copy className="mr-2 h-4 w-4" /> Copiar
          </Button>
        </div>

        {sugestao.data && !sugestao.data.configurada && (
          <p className="text-sm text-amber-600">
            Segredo ITAU_PIX_WEBHOOK_SECRET ainda não configurado — substitua o marcador antes de cadastrar.
          </p>
        )}

        {indisponibilidade && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">Serviço Pix temporariamente indisponível</p>
              <p className="mt-1 text-muted-foreground">
                O Itaú respondeu HTTP 503 mesmo após as tentativas automáticas. O cadastro não foi alterado;
                tente novamente quando a manutenção terminar.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || !url}>
            {salvar.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Cadastrar no Itaú
          </Button>
          <Button variant="outline" onClick={() => atual.mutate()} disabled={atual.isPending}>
            {atual.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Consultar cadastro
          </Button>
          <Button variant="ghost" onClick={() => remover.mutate()} disabled={remover.isPending}>
            <Trash2 className="mr-2 h-4 w-4" /> Remover
          </Button>
        </div>

        {((atual.data?.ok && atual.data.data) ||
          (salvar.data?.ok && salvar.data.data) ||
          (remover.data?.ok && remover.data.data)) && (
          <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">
            {JSON.stringify(
              remover.data?.ok
                ? remover.data.data
                : salvar.data?.ok
                  ? salvar.data.data
                  : atual.data?.ok
                    ? atual.data.data
                    : null,
              null,
              2,
            )}
          </pre>
        )}

        {salvar.data?.ok && (
          <p className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> O Itaú passará a chamar {url}/pix
          </p>
        )}
      </div>
    </section>
  );
}
