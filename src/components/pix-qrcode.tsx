import { useEffect, useState } from "react";

/**
 * QR code do Pix gerado no navegador a partir do payload "copia e cola"
 * (BR Code). Evita depender de imagem devolvida pelo banco.
 */
export function PixQrCode({ valor, size = 168 }: { valor: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    setSrc(null);
    setErro(false);
    (async () => {
      try {
        const QR = (await import("qrcode")).default;
        const url = await QR.toDataURL(valor, { margin: 1, width: size * 2, errorCorrectionLevel: "M" });
        if (vivo) setSrc(url);
      } catch {
        if (vivo) setErro(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [valor, size]);

  if (erro) return null;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex items-center justify-center rounded-xl border border-border bg-white p-2"
        style={{ width: size + 16, height: size + 16 }}
      >
        {src ? (
          <img src={src} alt="QR code do Pix para pagamento" width={size} height={size} />
        ) : (
          <span className="text-[11px] text-muted-foreground">Gerando…</span>
        )}
      </div>
      <span className="text-[11px] text-muted-foreground">Aponte a câmera do app do banco</span>
    </div>
  );
}
