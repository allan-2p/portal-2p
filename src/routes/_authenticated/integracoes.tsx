import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, ExternalLink, Cloud, Loader2, ArrowLeft, Upload, FileSpreadsheet, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getSalesforceStatus, getSalesforceSample } from "@/lib/salesforce.functions";
import { SyncPanel } from "@/components/sync-panel";


export const Route = createFileRoute("/_authenticated/integracoes")({
  head: () => ({ meta: [{ title: "Integrações · Portal 2P" }] }),
  component: IntegracoesPage,
});

function IntegracoesPage() {
  const fetchStatus = useServerFn(getSalesforceStatus);
  const fetchSample = useServerFn(getSalesforceSample);

  const status = useQuery({
    queryKey: ["salesforce", "status"],
    queryFn: () => fetchStatus(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const sample = useMutation({
    mutationFn: () => fetchSample(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao buscar dados"),
    onSuccess: () => toast.success("Dados carregados do Salesforce"),
  });

  const connected = status.data?.connected === true;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <div>
        <h1 className="font-display text-2xl font-bold">Integrações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Conecte o Portal 2P a serviços externos. Autorizações são geridas de forma segura pela Lovable.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-6 flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-[#00A1E0]/15 flex items-center justify-center shrink-0">
            <Cloud className="h-6 w-6 text-[#00A1E0]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-lg">Salesforce</h2>
              <StatusBadge loading={status.isLoading} connected={connected} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Sincronize contas, oportunidades e casos da sua org Salesforce dentro do Portal.
            </p>

            {status.isLoading && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Verificando conexão…
              </div>
            )}

            {!status.isLoading && connected && (
              <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <Field label="Organização" value={status.data?.orgName ?? "—"} />
                <Field label="Usuário conectado" value={status.data?.username ?? "—"} />
                <Field label="Status" value={status.data?.outcome ?? "verified"} />
                <Field label="Latência" value={status.data?.latencyMs != null ? `${status.data.latencyMs} ms` : "—"} />
              </dl>
            )}

            {!status.isLoading && !connected && (
              <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {status.data?.reason ?? "Salesforce não está conectado."}
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => status.refetch()}
                disabled={status.isFetching}
              >
                <RefreshCw className={status.isFetching ? "animate-spin" : ""} />
                Testar conexão
              </Button>

              {connected ? (
                <Button
                  size="sm"
                  onClick={() => sample.mutate()}
                  disabled={sample.isPending}
                >
                  {sample.isPending ? <Loader2 className="animate-spin" /> : null}
                  Buscar contas de exemplo
                </Button>
              ) : (
                <a
                  href="https://lovable.dev/projects"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-8 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Autorizar Salesforce <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}

              {connected && (
                <a
                  href="https://lovable.dev/projects"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-8 px-3 rounded-md text-xs font-medium border border-border hover:bg-surface-2"
                >
                  Gerenciar / Desconectar <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>

            {sample.data?.records && sample.data.records.length > 0 && (
              <div className="mt-5 rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-2 text-xs font-semibold bg-surface-2 border-b border-border">
                  Últimas contas ({sample.data.records.length})
                </div>
                <ul className="divide-y divide-border text-sm">
                  {sample.data.records.map((r: any) => (
                    <li key={r.Id} className="px-3 py-2 flex items-center justify-between gap-3">
                      <span className="truncate font-medium">{r.Name}</span>
                      <span className="text-xs text-muted-foreground truncate">{r.Industry ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-3 border-t border-border bg-surface/40 text-xs text-muted-foreground">
          A autorização OAuth do Salesforce é feita e revogada pelo painel de conectores da Lovable.
          Ao desconectar por lá, esta página passará a exibir o Salesforce como desconectado.
        </div>
      </div>

      <SyncPanel />

      <Top20Card />
    </div>
  );
}

const TOP20_BUCKET = "top20";
const TOP20_PATH = "top20.csv";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Top20Card() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const file = useQuery({
    queryKey: ["top20-file"],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(TOP20_BUCKET).list("", { search: TOP20_PATH });
      if (error) throw error;
      return data?.find((f) => f.name === TOP20_PATH) ?? null;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  async function handleUpload(f: File) {
    if (!/\.csv$/i.test(f.name)) {
      toast.error("Envie um arquivo .csv");
      return;
    }
    setBusy(true);
    const { error } = await supabase.storage
      .from(TOP20_BUCKET)
      .upload(TOP20_PATH, f, { upsert: true, contentType: "text/csv" });
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("row-level") ? "Apenas administradores podem enviar o Top 20." : error.message);
      return;
    }
    toast.success("Top 20 atualizado");
    file.refetch();
  }

  async function handleDownload() {
    const { data, error } = await supabase.storage.from(TOP20_BUCKET).download(TOP20_PATH);
    if (error || !data) {
      toast.error("Não foi possível baixar o arquivo");
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = TOP20_PATH;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete() {
    setBusy(true);
    const { error } = await supabase.storage.from(TOP20_BUCKET).remove([TOP20_PATH]);
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("row-level") ? "Apenas administradores podem remover o Top 20." : error.message);
      return;
    }
    toast.success("Arquivo removido");
    file.refetch();
  }

  const current = file.data;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-6 flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-lg">Top 20</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Arquivo único em CSV com a lista Top 20. Um novo envio substitui o arquivo atual.
          </p>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleUpload(f);
            }}
            className="mt-4 rounded-xl border border-dashed border-border bg-surface/40 p-6 text-center"
          >
            <Upload className="h-5 w-5 mx-auto text-muted-foreground" />
            <p className="text-sm mt-2">Arraste o CSV aqui ou selecione um arquivo</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
            <Button size="sm" className="mt-3" onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Upload />}
              {current ? "Substituir arquivo" : "Enviar CSV"}
            </Button>
          </div>

          <div className="mt-4 text-sm">
            {file.isLoading ? (
              <span className="text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Verificando arquivo…
              </span>
            ) : current ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{current.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes((current.metadata as { size?: number } | null)?.size ?? 0)} ·{" "}
                    {current.updated_at ? new Date(current.updated_at).toLocaleString("pt-BR") : "—"}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={handleDownload}>
                    <Download /> Baixar
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDelete} disabled={busy}>
                    <Trash2 /> Remover
                  </Button>
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground">Nenhum arquivo enviado ainda.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium truncate mt-0.5">{value}</div>
    </div>
  );
}

function StatusBadge({ loading, connected }: { loading: boolean; connected: boolean }) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Verificando
      </span>
    );
  }
  return connected ? (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3" /> Conectado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">
      <XCircle className="h-3 w-3" /> Desconectado
    </span>
  );
}
