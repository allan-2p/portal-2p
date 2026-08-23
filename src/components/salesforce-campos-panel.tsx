import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Eye, Loader2, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  getSalesforceFieldMap,
  saveSalesforceFieldMap,
  previewSalesforcePayload,
} from "@/lib/salesforce-campos.functions";
import { camposDoObjeto, resolverMapeamento, type MapeamentoItem, type SfObjeto } from "@/lib/salesforce-campos";

const OBJETOS: { id: SfObjeto; titulo: string; sub: string }[] = [
  { id: "Account", titulo: "Account (cadastro de cliente)", sub: "Enviado ao salvar/sincronizar um cadastro de cliente." },
  { id: "Opportunity", titulo: "Opportunity (proposta / pedido)", sub: "Enviado ao salvar e ao concluir uma proposta." },
];

function valorTexto(v: string | number | boolean | null) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return String(v);
  const s = String(v);
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

export function SalesforceCamposPanel() {
  const [objeto, setObjeto] = useState<SfObjeto>("Account");
  return (
    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="font-semibold">Campos enviados ao Salesforce</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Confira cada campo do portal e marque o campo correspondente da org. O envio real usa exatamente esta
          configuração.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {OBJETOS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setObjeto(o.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              objeto === o.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {o.titulo}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{OBJETOS.find((o) => o.id === objeto)?.sub}</p>

      <ObjetoMap key={objeto} objeto={objeto} />
    </section>
  );
}

function ObjetoMap({ objeto }: { objeto: SfObjeto }) {
  const carregar = useServerFn(getSalesforceFieldMap);
  const salvar = useServerFn(saveSalesforceFieldMap);
  const prever = useServerFn(previewSalesforcePayload);

  const q = useQuery({
    queryKey: ["sf-field-map", objeto],
    queryFn: () => carregar({ data: { objeto } }),
    refetchOnWindowFocus: false,
  });

  const [rascunho, setRascunho] = useState<Record<string, MapeamentoItem>>({});

  useEffect(() => {
    if (!q.data) return;
    const resolvido = resolverMapeamento(objeto, q.data.overrides as MapeamentoItem[]);
    const inicial: Record<string, MapeamentoItem> = {};
    for (const r of resolvido) {
      inicial[r.campo.chave] = { campo_portal: r.campo.chave, sf_field: r.sfField, ativo: r.ativo };
    }
    setRascunho(inicial);
  }, [q.data, objeto]);

  const itens = useMemo(() => Object.values(rascunho), [rascunho]);
  const camposOrg = q.data?.camposOrg ?? [];
  const nomesOrg = useMemo(() => new Set(camposOrg.map((c) => c.name)), [camposOrg]);

  const preview = useMutation({
    mutationFn: () => prever({ data: { objeto, itens } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar a prévia"),
  });

  const gravar = useMutation({
    mutationFn: () => salvar({ data: { objeto, itens } }),
    onSuccess: () => {
      toast.success("Mapeamento salvo — o próximo envio já usa estes campos.");
      q.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const catalogo = camposDoObjeto(objeto);
  const linhasPreview = preview.data?.linhas ?? [];
  const previewPorChave = new Map(linhasPreview.map((l) => [l.chave, l]));

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando campos…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {q.data?.erroOrg && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Não foi possível listar os campos da org ({q.data.erroOrg}). Você ainda pode digitar o nome de API do campo
            manualmente.
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => gravar.mutate()} disabled={gravar.isPending}>
          {gravar.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Salvar mapeamento
        </Button>
        <Button size="sm" variant="outline" onClick={() => preview.mutate()} disabled={preview.isPending}>
          {preview.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />}
          Prévia com registro real
        </Button>
        <Button size="sm" variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${q.isFetching ? "animate-spin" : ""}`} /> Recarregar campos da org
        </Button>
      </div>

      {preview.data && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
          <div className="font-medium">
            Prévia de {preview.data.registro?.rotulo ?? "registro"} — {Object.keys(preview.data.payload).length} campos
            seriam enviados.
          </div>
          {preview.data.aviso && <div className="text-amber-700">{preview.data.aviso}</div>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[840px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
              <th className="py-2 pr-3 font-medium">Campo do portal</th>
              <th className="py-2 pr-3 font-medium">Campo no Salesforce (API name)</th>
              <th className="py-2 pr-3 font-medium">Valor de exemplo</th>
              <th className="py-2 pr-3 font-medium text-right">Enviar</th>
            </tr>
          </thead>
          <tbody>
            {catalogo.map((c) => {
              const item = rascunho[c.chave] ?? { campo_portal: c.chave, sf_field: c.sfPadrao, ativo: Boolean(c.sfPadrao) };
              const p = previewPorChave.get(c.chave);
              const existeNaOrg = !item.sf_field || nomesOrg.size === 0 || nomesOrg.has(item.sf_field);
              return (
                <tr key={c.chave} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3">
                    <div className="font-medium">
                      {c.rotulo}
                      {c.obrigatorio && <span className="text-destructive ml-1">*</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{c.origem}</div>
                    {c.ajuda && <div className="text-[11px] text-muted-foreground mt-0.5">{c.ajuda}</div>}
                  </td>
                  <td className="py-2 pr-3 w-[280px]">
                    <Input
                      list={`sf-campos-${objeto}`}
                      className="font-mono text-xs h-8"
                      placeholder="Não enviado"
                      value={item.sf_field ?? ""}
                      onChange={(e) =>
                        setRascunho((r) => ({
                          ...r,
                          [c.chave]: { ...item, sf_field: e.target.value || null, ativo: item.ativo || Boolean(e.target.value) },
                        }))
                      }
                    />
                    {item.sf_field && !existeNaOrg && (
                      <div className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Campo não encontrado na org
                      </div>
                    )}
                    {item.sf_field && existeNaOrg && nomesOrg.size > 0 && (
                      <div className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {camposOrg.find((f) => f.name === item.sf_field)?.label ?? "OK"}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground max-w-[280px] break-words whitespace-pre-wrap">
                    {p ? valorTexto(p.valor) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Switch
                      checked={Boolean(item.ativo && item.sf_field)}
                      disabled={c.obrigatorio || !item.sf_field}
                      onCheckedChange={(v) => setRascunho((r) => ({ ...r, [c.chave]: { ...item, ativo: v } }))}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <datalist id={`sf-campos-${objeto}`}>
          {camposOrg.map((f) => (
            <option key={f.name} value={f.name}>
              {f.label} ({f.type})
            </option>
          ))}
        </datalist>
      </div>

      <p className="text-xs text-muted-foreground">
        * Campos obrigatórios do Salesforce: podem ser remapeados, mas não desligados. Campos deixados em branco não são
        enviados. Se a org recusar um campo, ele é removido automaticamente e o restante continua sendo gravado.
      </p>
    </div>
  );
}
