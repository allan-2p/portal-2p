import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logModeration } from "@/lib/moderation-audit";
import { useCarregadoresConfig, useCarregadoresInvalidate } from "@/hooks/use-carregadores";
import type { CarregadoresConfig } from "@/lib/carregadores";

export function CarregadoresConfigTab() {
  const { data } = useCarregadoresConfig();
  const invalidate = useCarregadoresInvalidate();
  const [form, setForm] = useState<CarregadoresConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  if (!form) return <div className="glass rounded-2xl p-6 text-muted-foreground">Carregando…</div>;

  const pct = (k: keyof CarregadoresConfig) => ((form[k] as number) * 100).toFixed(2);
  const setPct = (k: keyof CarregadoresConfig, v: string) => setForm({ ...form, [k]: Number(v) / 100 });

  async function salvar() {
    if (!form) return;
    setSaving(true);
    const { error } = await supabase.from("carregadores_config").update({ ...form }).eq("id", 1);
    setSaving(false);
    if (error) return toast.error(error.message);
    void logModeration({
      area: "carregadores_regras",
      action: "atualizou",
      target: "Política tributária",
      summary: "Política tributária e comercial atualizada",
      details: {
        ipi: form.ipi,
        pis_cofins: form.pis_cofins,
        aliq_inter: form.aliq_inter,
        politica_mb_min: form.politica_mb_min,
        cmv_max: form.cmv_max,
      },
    });
    invalidate();
    toast.success("Política tributária atualizada.");
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="glass rounded-2xl p-5 grid sm:grid-cols-2 gap-4">
        <Field label="IPI (%)">
          <Input type="number" step="0.01" value={pct("ipi")} onChange={(e) => setPct("ipi", e.target.value)} />
        </Field>
        <Field label="PIS/COFINS (%)">
          <Input type="number" step="0.01" value={pct("pis_cofins")} onChange={(e) => setPct("pis_cofins", e.target.value)} />
        </Field>
        <Field label="Alíquota interestadual de origem (%)">
          <Input type="number" step="0.01" value={pct("aliq_inter")} onChange={(e) => setPct("aliq_inter", e.target.value)} />
        </Field>
        <Field label="MB mínima de política (%)">
          <Input type="number" step="0.01" value={pct("politica_mb_min")} onChange={(e) => setPct("politica_mb_min", e.target.value)} />
        </Field>
        <Field label="Base da comissão">
          <Select
            value={form.comissao_base}
            onValueChange={(v) => setForm({ ...form, comissao_base: v as "MB" | "VALOR" })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="MB">Sobre a margem bruta</SelectItem>
              <SelectItem value="VALOR">Sobre o valor da venda</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Comissão (%)">
          <Input type="number" step="0.01" value={pct("comissao_pct")} onChange={(e) => setPct("comissao_pct", e.target.value)} />
        </Field>
      </div>
      <Button onClick={salvar} disabled={saving} className="gap-2">
        <Save className="h-4 w-4" /> Salvar política
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
