import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getClienteLogo, saveClienteLogo, deleteClienteLogo } from "@/lib/cliente-logos.functions";

const MAX_BYTES = 600_000;

/** Redimensiona para no máximo 600px de largura e devolve um data URL leve. */
async function arquivoParaDataUrl(file: File): Promise<string> {
  const bruto = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    fr.readAsDataURL(file);
  });
  if (file.type === "image/svg+xml") return bruto;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Imagem inválida."));
    el.src = bruto;
  });
  const escala = Math.min(1, 600 / (img.width || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * escala));
  canvas.height = Math.max(1, Math.round(img.height * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) return bruto;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export function ClienteLogoUpload({ doc }: { doc: string }) {
  const carregar = useServerFn(getClienteLogo);
  const gravar = useServerFn(saveClienteLogo);
  const remover = useServerFn(deleteClienteLogo);
  const inputRef = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const digits = (doc ?? "").replace(/\D/g, "");

  useEffect(() => {
    let vivo = true;
    if (!digits) return setLogo(null);
    void carregar({ data: { doc: digits } })
      .then((r) => { if (vivo) setLogo((r as any)?.data_url ?? null); })
      .catch(() => undefined);
    return () => { vivo = false; };
  }, [digits, carregar]);

  async function selecionar(file: File | undefined) {
    if (!file || !digits) return;
    setBusy(true);
    try {
      const dataUrl = await arquivoParaDataUrl(file);
      if (dataUrl.length > MAX_BYTES) throw new Error("Arquivo muito grande — use uma imagem menor que 500KB.");
      await gravar({ data: { doc: digits, dataUrl } });
      setLogo(dataUrl);
      toast.success("Logomarca salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar a logomarca.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function excluir() {
    if (!digits) return;
    setBusy(true);
    try {
      await remover({ data: { doc: digits } });
      setLogo(null);
      toast.success("Logomarca removida.");
    } catch {
      toast.error("Falha ao remover a logomarca.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sm:col-span-2">
      <Label className="text-xs">Logomarca da empresa</Label>
      <div className="mt-1 flex items-center gap-4 rounded-xl border border-border p-3">
        <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
          {logo ? (
            <img src={logo} alt="Logomarca do cliente" className="max-h-14 max-w-24 object-contain" />
          ) : (
            <ImageUp className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">
            PNG, JPG, WEBP ou SVG. Usada nas propostas em PDF quando a opção “Logomarca” estiver ativa.
          </p>
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy || !digits} onClick={() => inputRef.current?.click()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageUp className="mr-2 h-4 w-4" />}
              {logo ? "Trocar" : "Enviar"}
            </Button>
            {logo ? (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void excluir()}>
                <Trash2 className="mr-2 h-4 w-4" /> Remover
              </Button>
            ) : null}
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => void selecionar(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
