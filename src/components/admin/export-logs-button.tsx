import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/permission-gate";
import { exportLogsCsv } from "@/lib/logs-export.functions";

/**
 * Exporta os registros de um log em CSV. Só aparece para perfis com a
 * permissão "Logs • Exportar registros"; o servidor revalida a permissão.
 */
export function ExportLogsButton({
  source,
  days = 90,
  label = "Exportar CSV",
}: {
  source: "atividade" | "integracoes" | "moderacao";
  days?: number;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const run = useServerFn(exportLogsCsv);

  async function baixar() {
    setLoading(true);
    try {
      const { csv, filename, rows } = await run({ data: { source, days, limit: 5000 } });
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${rows} registro(s) exportado(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível exportar os registros.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PermissionGate feature="admin.logs.exportar">
      <Button variant="outline" size="sm" onClick={() => void baixar()} disabled={loading} className="gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {label}
      </Button>
    </PermissionGate>
  );
}
