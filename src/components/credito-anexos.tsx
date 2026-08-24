import { useRef, useState } from "react";
import { Loader2, Paperclip, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CREDITO_ANEXOS_BUCKET, type CreditoAnexo } from "@/lib/credito";

const MAX_BYTES = 20 * 1024 * 1024;

const tamanhoBR = (b: number | null | undefined) =>
  b == null ? "" : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/** Abre o arquivo do bucket privado por link assinado. */
export async function abrirAnexoCredito(path: string) {
  const { data, error } = await supabase.storage
    .from(CREDITO_ANEXOS_BUCKET)
    .createSignedUrl(path, 120);
  if (error || !data?.signedUrl) {
    toast.error(error?.message ?? "Não foi possível abrir o arquivo.");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

/** Lista somente leitura dos anexos de uma análise. */
export function CreditoAnexosLista({ anexos }: { anexos: CreditoAnexo[] }) {
  if (!anexos.length) return <span className="text-muted-foreground">Sem anexos</span>;
  return (
    <ul className="space-y-1">
      {anexos.map((a) => (
        <li key={a.path} className="flex items-center gap-2">
          <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <button
            type="button"
            className="text-left underline underline-offset-2 hover:text-primary truncate"
            onClick={() => void abrirAnexoCredito(a.path)}
          >
            {a.nome}
          </button>
          <span className="text-xs text-muted-foreground">{tamanhoBR(a.tamanho)}</span>
          <Download className="h-3.5 w-3.5 text-muted-foreground" />
        </li>
      ))}
    </ul>
  );
}

/** Upload de documentos de apoio (balanço, contrato social, etc.). */
export function CreditoAnexosUpload({
  doc,
  anexos,
  onChange,
}: {
  doc: string;
  anexos: CreditoAnexo[];
  onChange: (v: CreditoAnexo[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function enviar(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const novos: CreditoAnexo[] = [];
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name}: arquivo maior que 20 MB.`);
          continue;
        }
        const limpo = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${doc || "sem-doc"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${limpo}`;
        const { error } = await supabase.storage
          .from(CREDITO_ANEXOS_BUCKET)
          .upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (error) throw new Error(error.message);
        novos.push({ path, nome: file.name, tamanho: file.size, tipo: file.type || null });
      }
      if (novos.length) onChange([...anexos, ...novos]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remover(a: CreditoAnexo) {
    await supabase.storage.from(CREDITO_ANEXOS_BUCKET).remove([a.path]);
    onChange(anexos.filter((x) => x.path !== a.path));
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void enviar(e.target.files)}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
        Anexar arquivos
      </Button>
      {anexos.length > 0 && (
        <ul className="space-y-1 text-sm">
          {anexos.map((a) => (
            <li key={a.path} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1">
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{a.nome}</span>
              <span className="text-xs text-muted-foreground">{tamanhoBR(a.tamanho)}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="ml-auto h-7 w-7 text-destructive"
                onClick={() => void remover(a)}
                aria-label={`Remover ${a.nome}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
