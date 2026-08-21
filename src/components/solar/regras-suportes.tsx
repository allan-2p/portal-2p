/**
 * Regras de quantificação por suporte (2P Solar).
 *
 * Mostra, para cada suporte cadastrado, exatamente o que o quantificador faz
 * com ele (`src/lib/solar-quantificador.ts`): tipo de fixação, códigos de
 * de/para (fixador, complemento e mini-trilho), múltiplo, se recebe kit
 * parafuso Smart, se soma microinversores na 1ª fileira e qual terminal é
 * emitido. Os campos de código e múltiplo são editáveis aqui mesmo.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logModeration } from "@/lib/moderation-audit";
import { useSolarSuportes } from "@/hooks/use-solar-catalogo";
import type { SolarSuporte } from "@/lib/solar-calculadora";
import { resolverProduto } from "@/lib/solar-sku";
import { useSapCatalogoCodigos } from "@/components/solar/sap-codigo";

/** Suportes que recebem o kit parafuso Smart (php:2861). */
export const SUPORTES_KIT_PARAFUSO = [9, 10, 15, 16, 17, 20];
/** Mini-trilhos que somam microinversores na 1ª fileira (famílias MTL/MINI). */
const REGEX_MINI_SOMA_MICRO = /^2P-(MTL|MINI)/i;

type Edit = {
  codigo_sap: string;
  cod_extra: string;
  cod_mini_trilho: string;
  multiplo: string;
};

function regraDoSuporte(s: SolarSuporte) {
  const leg = s.legado_id ?? 0;
  const smart = !!s.smart || s.usa_barra === false;
  if (!smart)
    return {
      tipo: "Trilho (2P-TC)",
      emite: "Barras do trilho + junção + grampos + terminal de aterramento + fixador"
        + (s.cod_extra ? " + complemento" : ""),
      terminal: "ZMI (ou M8 com otimizador / micro modelo 5)",
    };
  if (leg === 13)
    return {
      tipo: "Smart — LAJE 10",
      emite: "Dois itens próprios (código SAP e complemento), cada um com metade dos grampos",
      terminal: "ZMIL (dobrado nos micros modelo 1–3); não recebe ZMI nem M8",
    };
  if (leg === 14)
    return {
      tipo: "Smart — Zipado",
      emite: "Produto próprio (grampos + microinversores nos geradores 1, 2 e 4)",
      terminal: "ZMI",
    };
  return {
    tipo: "Smart — mini-trilho",
    emite: "Mini-trilho (grampos" +
      (REGEX_MINI_SOMA_MICRO.test(String(s.cod_mini_trilho ?? s.codigo_sap ?? "")) ? " + microinversores da 1ª fileira" : "") +
      ")",
    terminal: "ZMI (ou M8 com otimizador / micro modelo 5)",
  };
}

export function RegrasSuportes() {
  const qc = useQueryClient();
  const suportesQ = useSolarSuportes(true);
  const catalogo = useSapCatalogoCodigos().data ?? [];
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  const lista = useMemo(
    () =>
      [...(suportesQ.data ?? [])].sort(
        (a, b) => (a.legado_id ?? 999) - (b.legado_id ?? 999) || a.nome.localeCompare(b.nome),
      ),
    [suportesQ.data],
  );

  const valor = (s: SolarSuporte, k: keyof Edit) =>
    edits[s.id]?.[k] ??
    String((k === "multiplo" ? s.multiplo ?? 2 : (s as any)[k]) ?? "");

  const setValor = (s: SolarSuporte, k: keyof Edit, v: string) =>
    setEdits((p) => ({
      ...p,
      [s.id]: {
        codigo_sap: p[s.id]?.codigo_sap ?? s.codigo_sap ?? "",
        cod_extra: p[s.id]?.cod_extra ?? s.cod_extra ?? "",
        cod_mini_trilho: p[s.id]?.cod_mini_trilho ?? s.cod_mini_trilho ?? "",
        multiplo: p[s.id]?.multiplo ?? String(s.multiplo ?? 2),
        [k]: v,
      },
    }));

  async function salvar(s: SolarSuporte) {
    const e = edits[s.id];
    if (!e) return;
    setSalvando(s.id);
    const payload = {
      codigo_sap: e.codigo_sap.trim() || null,
      cod_extra: e.cod_extra.trim() || null,
      cod_mini_trilho: e.cod_mini_trilho.trim() || null,
      multiplo: Math.max(1, Number(e.multiplo) || 2),
    };
    const { error } = await supabase.from("solar_suportes").update(payload).eq("id", s.id);
    setSalvando(null);
    if (error) return toast.error(error.message);
    void logModeration({
      area: "produtos",
      action: "atualizou",
      target: s.nome,
      summary: `Regras de quantificação do suporte ${s.nome} atualizadas.`,
    });
    setEdits((p) => {
      const { [s.id]: _, ...resto } = p;
      return resto;
    });
    void qc.invalidateQueries({ queryKey: ["solar-suportes"] });
    toast.success("Suporte atualizado.");
  }

  const codigoInput = (s: SolarSuporte, k: keyof Edit, placeholder: string) => {
    const v = valor(s, k);
    const invalido = k !== "multiplo" && !!v.trim() && !resolverProduto(catalogo, v);
    return (
      <Input
        value={v}
        placeholder={placeholder}
        className={`h-8 text-xs ${invalido ? "border-destructive focus-visible:ring-destructive" : ""}`}
        onChange={(ev) => setValor(s, k, ev.target.value)}
      />
    );
  };

  return (
    <section className="glass rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="font-semibold">Regras por suporte (mini e micro)</h3>
        <p className="text-sm text-muted-foreground">
          O que o quantificador emite para cada fixação, com o de/para de mini-trilho e complemento.
          Campos em vermelho não existem no catálogo SAP.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-3">Suporte</th>
              <th className="py-2 pr-3">Regra</th>
              <th className="py-2 pr-3 w-[150px]">Código SAP</th>
              <th className="py-2 pr-3 w-[150px]">Complemento</th>
              <th className="py-2 pr-3 w-[150px]">Mini-trilho</th>
              <th className="py-2 pr-3 w-[70px]">Múlt.</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {lista.map((s) => {
              const r = regraDoSuporte(s);
              const leg = s.legado_id ?? 0;
              const kit = SUPORTES_KIT_PARAFUSO.includes(leg);
              const smart = !!s.smart || s.usa_barra === false;
              const sujo = !!edits[s.id];
              return (
                <tr key={s.id} className="border-t border-border align-top">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{s.nome}</div>
                    <div className="text-[11px] text-muted-foreground">
                      legado {s.legado_id ?? "—"} · {s.ativo ? "ativo" : "inativo"}
                    </div>
                  </td>
                  <td className="py-2 pr-3 max-w-[320px]">
                    <div className="flex flex-wrap gap-1 mb-1">
                      <Badge variant={smart ? "secondary" : "outline"}>{r.tipo}</Badge>
                      {kit && <Badge variant="outline">Kit parafuso Smart</Badge>}
                      {leg === 9 && <Badge variant="outline">GAT + micro</Badge>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{r.emite}</div>
                    <div className="text-[11px] text-muted-foreground">Terminal: {r.terminal}</div>
                  </td>
                  <td className="py-2 pr-3">{codigoInput(s, "codigo_sap", "—")}</td>
                  <td className="py-2 pr-3">{codigoInput(s, "cod_extra", "—")}</td>
                  <td className="py-2 pr-3">
                    {smart && leg !== 13 && leg !== 14 ? (
                      codigoInput(s, "cod_mini_trilho", "usa o código SAP")
                    ) : (
                      <span className="text-[11px] text-muted-foreground">não se aplica</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">{codigoInput(s, "multiplo", "2")}</td>
                  <td className="py-2">
                    <Button
                      size="sm"
                      variant={sujo ? "default" : "ghost"}
                      disabled={!sujo || salvando === s.id}
                      onClick={() => void salvar(s)}
                    >
                      {salvando === s.id ? "…" : "Salvar"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
