import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, CheckCircle2, Info, Plus, Save, Trash2, TriangleAlert, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCpoConfig, useCpoProducts, useCpoUfs, useCpoInvalidate } from "@/hooks/use-cpo";
import {
  CPO_CONFIG_FALLBACK,
  calcularCpo,
  fmtBRL,
  fmtPct,
  novoEstado,
  novoItem,
  parseMoeda,
  precoSugerido,
  statusMB,
  type CpoItem,
  type CpoState,
} from "@/lib/cpo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/carregadores/propostas")({
  head: () => ({
    meta: [
      { title: "Nova Proposta CPO — Portal 2P Carregadores" },
      {
        name: "description",
        content: "Monte propostas CPO com cálculo de ICMS, DIFAL, impostos e margem bruta em tempo real.",
      },
      { property: "og:title", content: "Nova Proposta CPO — Portal 2P Carregadores" },
      {
        property: "og:description",
        content: "Motor de precificação CPO com DRE, DIFAL e política de margem da 2P Carregadores.",
      },
    ],
  }),
  component: PropostaCpoPage,
});

function PropostaCpoPage() {
  const produtosQ = useCpoProducts();
  const ufsQ = useCpoUfs();
  const configQ = useCpoConfig();
  const invalidate = useCpoInvalidate();

  const produtos = useMemo(() => (produtosQ.data ?? []).filter((p) => p.ativo), [produtosQ.data]);
  const ufs = ufsQ.data ?? [];
  const config = configQ.data ?? CPO_CONFIG_FALLBACK;

  const [state, setState] = useState<CpoState>(() => novoEstado());
  const [completa, setCompleta] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof CpoState>(k: K, v: CpoState[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  const setItem = (key: string, patch: Partial<CpoItem>) =>
    setState((s) => ({
      ...s,
      itens: s.itens.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    }));

  const d = calcularCpo(state, produtosQ.data ?? [], ufs, config);
  const st = statusMB(d.mbPct, config);
  const uf = ufs.find((u) => u.uf === state.uf);
  const abaixoPolitica = d.mbPct < config.politica_mb_min;

  // Ao trocar contribuinte, valores não editados manualmente voltam ao sugerido.
  const setContribuinte = (v: boolean) =>
    setState((s) => ({
      ...s,
      contribuinte: v,
      itens: s.itens.map((i) =>
        i.valorManual
          ? i
          : { ...i, valor: precoSugerido(produtos.find((p) => p.id === i.produtoId), v, config) },
      ),
    }));

  async function salvar() {
    if (!state.nome.trim()) return toast.error("Informe o nome do cliente.");
    if (!state.itens.some((i) => i.produtoId)) return toast.error("Adicione ao menos um produto.");
    if (abaixoPolitica) return toast.error("MB% abaixo da política mínima.");
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const numero = `CPO-${Date.now().toString().slice(-6)}`;
      const { error } = await supabase.from("cpo_proposals").insert({
        numero,
        cliente_nome: state.nome,
        cliente_telefone: state.telefone,
        cliente_email: state.email,
        cliente_doc: state.doc,
        cliente_ie: state.ie,
        uf: state.uf,
        contribuinte: state.contribuinte,
        frete_mod: state.freteMod,
        frete_valor: state.freteValor,
        itens: state.itens.map((i) => ({
          produtoId: i.produtoId,
          nome: produtos.find((p) => p.id === i.produtoId)?.nome ?? "",
          qtd: i.qtd,
          valor: i.valor,
        })),
        totais: {
          valorTotal: d.valorTotalProposta,
          valor: d.valor,
          icms: d.icms,
          icmsRate: d.icmsRate,
          ipi: d.ipiValor,
          pisCofins: d.pisCofins,
          rl: d.rl,
          custo: d.custoTotal,
          mb: d.mb,
          mbPct: d.mbPct,
          comissao: d.comValor,
        },
        created_by: userRes.user?.id ?? null,
      });
      if (error) throw error;
      toast.success(`Proposta ${numero} salva.`);
      invalidate();
      setState(novoEstado());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar proposta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <div className="max-w-[1700px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-primary font-semibold">Propostas CPO</div>
            <h1 className="text-3xl font-bold mt-1">Nova proposta CPO</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Visão resumida para a operação comercial, visão completa para a análise fiscal detalhada.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className={cn(!completa && "font-semibold")}>Resumida</span>
              <Switch checked={completa} onCheckedChange={setCompleta} />
              <span className={cn(completa && "font-semibold")}>Completa</span>
            </div>
            <Button onClick={salvar} disabled={saving || abaixoPolitica} className="gap-2">
              <Save className="h-4 w-4" /> Salvar proposta
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_.85fr] gap-5 items-start">
          {/* ENTRADAS */}
          <div className="glass rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Entradas da proposta</h2>
              <span className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">
                {completa ? "Visão completa" : "Visão resumida"}
              </span>
            </div>

            <Banner level={st.level} text={st.msg} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nome do cliente">
                <Input value={state.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Nome do cliente" />
              </Field>
              <Field label="Telefone">
                <Input value={state.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(00) 00000-0000" />
              </Field>
              <Field label="E-mail">
                <Input value={state.email} onChange={(e) => set("email", e.target.value)} placeholder="cliente@email.com" />
              </Field>
              <Field label="CNPJ / CPF">
                <Input value={state.doc} onChange={(e) => set("doc", e.target.value)} placeholder="00.000.000/0000-00" />
              </Field>
              <Field label="Estado (UF) de destino">
                <Select value={state.uf} onValueChange={(v) => set("uf", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ufs.map((u) => (
                      <SelectItem key={u.uf} value={u.uf}>
                        {u.uf} — {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Inscrição Estadual">
                <Input
                  value={state.ie}
                  onChange={(e) => set("ie", e.target.value)}
                  disabled={!state.contribuinte}
                  placeholder={state.contribuinte ? "IE do cliente" : "Cliente sem IE"}
                />
              </Field>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
              <div>
                <div className="font-semibold text-sm">Cliente contribuinte do ICMS</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Contribuinte: DIFAL por conta do destinatário. Não contribuinte: DIFAL absorvido na venda.
                </div>
              </div>
              <Switch checked={state.contribuinte} onCheckedChange={setContribuinte} />
            </div>

            <div className="flex gap-2 items-start rounded-xl border border-border bg-surface-2 px-4 py-3 text-xs text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
              <div>
                {state.contribuinte ? (
                  <>
                    <b className="text-foreground">Contribuinte.</b> O vendedor recolhe apenas o ICMS de origem (
                    {fmtPct(d.inter)}). DIFAL estimado do destinatário em {uf?.nome ?? state.uf}: {fmtBRL(d.difalEstimado)}{" "}
                    (interna {fmtPct(uf?.aliq_interna ?? 0)}
                    {uf?.fcp ? ` + FCP ${fmtPct(uf.fcp)}` : ""}).
                  </>
                ) : (
                  <>
                    <b className="text-foreground">Não contribuinte.</b> Carga efetiva = ICMS origem {fmtPct(d.inter)} +
                    DIFAL absorvido de {fmtBRL(d.difalAbs)} sobre o valor sem IPI, seguindo a carga interna de{" "}
                    {uf?.nome ?? state.uf}
                    {uf?.fcp ? ` (inclui FCP de ${fmtPct(uf.fcp)})` : ""}. Preço sugerido majorado em{" "}
                    {fmtPct(config.majoracao_sem_ie)}.
                  </>
                )}
              </div>
            </div>

            {/* Itens */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Produtos</h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setState((s) => ({ ...s, itens: [...s.itens, novoItem()] }))}
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar item
                </Button>
              </div>

              {state.itens.map((it) => {
                const prod = produtos.find((p) => p.id === it.produtoId);
                const sug = precoSugerido(prod, state.contribuinte, config);
                return (
                  <div key={it.key} className="rounded-xl border border-border p-3 space-y-3 bg-surface/40">
                    <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_.5fr] gap-3">
                      <Field label="Produto">
                        <Select
                          value={it.produtoId}
                          onValueChange={(v) => {
                            const p = produtos.find((x) => x.id === v);
                            setItem(it.key, {
                              produtoId: v,
                              valor: it.valorManual ? it.valor : precoSugerido(p, state.contribuinte, config),
                            });
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                          <SelectContent>
                            {produtos.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.nome}
                                {p.potencia ? ` · ${p.potencia}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Quantidade">
                        <Input
                          type="number"
                          min={1}
                          value={it.qtd}
                          onChange={(e) => setItem(it.key, { qtd: Math.max(1, Number(e.target.value) || 1) })}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Valor unitário (com IPI)">
                        <Input
                          value={it.valor ? fmtBRL(it.valor) : ""}
                          placeholder={sug ? fmtBRL(sug) : "R$ 0,00"}
                          onChange={(e) => setItem(it.key, { valor: parseMoeda(e.target.value), valorManual: true })}
                        />
                      </Field>
                      <div className="flex items-end justify-between gap-2">
                        <div className="text-xs text-muted-foreground">
                          Sugerido: <b className="text-foreground">{fmtBRL(sug)}</b>
                          {it.valorManual && (
                            <button
                              className="ml-2 text-primary hover:underline"
                              onClick={() => setItem(it.key, { valor: sug, valorManual: false })}
                            >
                              usar sugerido
                            </button>
                          )}
                          <div className="mt-1">Total item: <b className="text-foreground">{fmtBRL(it.valor * it.qtd)}</b></div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remover item"
                          onClick={() =>
                            setState((s) => ({
                              ...s,
                              itens: s.itens.length > 1 ? s.itens.filter((x) => x.key !== it.key) : s.itens,
                            }))
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="text-xs text-muted-foreground">
                Soma dos custos líquidos dos itens = <b className="text-foreground">{fmtBRL(d.custoTotal)}</b>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Modalidade de frete">
                <Select value={state.freteMod} onValueChange={(v) => set("freteMod", v as "FOB" | "CIF")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FOB">FOB — por conta do cliente</SelectItem>
                    <SelectItem value="CIF">CIF — por conta da 2P</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Valor do frete">
                <Input
                  value={state.freteValor ? fmtBRL(state.freteValor) : ""}
                  placeholder="R$ 0,00"
                  onChange={(e) => set("freteValor", parseMoeda(e.target.value))}
                />
              </Field>
            </div>
          </div>

          {/* PAINEL / DRE */}
          <div className="space-y-4">
            <div className="rounded-2xl p-5 text-white bg-gradient-to-br from-[oklch(0.3_0.13_265)] via-[oklch(0.45_0.19_265)] to-[oklch(0.6_0.17_265)] shadow-lg">
              <div className="text-[11px] uppercase tracking-widest opacity-80">Valor total da proposta</div>
              <div className="text-4xl font-extrabold mt-1">{fmtBRL(d.valorTotalProposta)}</div>
              <div className="text-xs opacity-80 mt-1">
                Itens {fmtBRL(d.valorItens)} · Frete {fmtBRL(state.freteValor)}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Kpi
                title="Margem bruta"
                value={fmtBRL(d.mb)}
                sub={`MB ${fmtPct(d.mbPct)} · mínimo ${fmtPct(config.politica_mb_min)}`}
                level={st.level}
              />
              <Kpi
                title="Comissão estimada"
                value={fmtBRL(d.comValor)}
                sub={`${fmtPct(d.comPct)} sobre ${config.comissao_base === "MB" ? "margem bruta" : "valor da venda"}`}
                level="info"
              />
            </div>

            <div className="glass rounded-2xl p-5 space-y-1.5">
              <h2 className="font-semibold mb-3">DRE da proposta</h2>
              <DreRow k="Valor dos itens (com IPI)" v={fmtBRL(d.valorItens)} tone="neutral" />
              <DreRow
                k="Valor do item (sem IPI)"
                sub={`Base fiscal — IPI de ${fmtPct(config.ipi)} removido`}
                v={fmtBRL(d.valorItem)}
                tone="neutral"
              />
              <DreRow
                k={`ICMS efetivo (${fmtPct(d.icmsRate)})`}
                sub={
                  state.contribuinte
                    ? `Origem ${fmtPct(d.inter)} — DIFAL por conta do destinatário`
                    : `Origem ${fmtBRL(d.origem)} + DIFAL absorvido ${fmtBRL(d.difalAbs)}`
                }
                v={`- ${fmtBRL(d.icms)}`}
                tone="sub"
              />
              <DreRow
                k={`PIS/COFINS (${fmtPct(config.pis_cofins)})`}
                sub="Sobre valor do item menos ICMS"
                v={`- ${fmtBRL(d.pisCofins)}`}
                tone="sub"
              />
              <DreRow k="Receita líquida" v={fmtBRL(d.rl)} tone="eq" />
              <DreRow k="Custo dos equipamentos" v={`- ${fmtBRL(d.custoTotal)}`} tone="sub" />
              <DreRow k="Margem bruta" sub={`MB% = ${fmtPct(d.mbPct)}`} v={fmtBRL(d.mb)} tone="add" />

              {completa && (
                <>
                  <div className="h-px bg-border my-3" />
                  <DreRow k={`IPI destacado (${fmtPct(config.ipi)})`} v={fmtBRL(d.ipiValor)} tone="neutral" />
                  <DreRow k="ICMS de origem (interestadual)" v={fmtBRL(d.origem)} tone="neutral" />
                  <DreRow
                    k={state.contribuinte ? "DIFAL estimado do destinatário" : "DIFAL absorvido pela 2P"}
                    v={fmtBRL(state.contribuinte ? d.difalEstimado : d.difalAbs)}
                    tone="neutral"
                  />
                  <DreRow
                    k="Alíquota interna da UF (+FCP)"
                    sub={uf ? `${uf.nome} — interna ${fmtPct(uf.aliq_interna)} · FCP ${fmtPct(uf.fcp)}` : undefined}
                    v={fmtPct(d.aliqInterna)}
                    tone="neutral"
                  />
                  <DreRow k="Frete" sub={`Modalidade ${state.freteMod} — fora da base de margem`} v={fmtBRL(state.freteValor)} tone="neutral" />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
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

function Banner({ level, text }: { level: "bad" | "warn" | "good"; text: string }) {
  const map = {
    bad: { cls: "border-destructive/40 bg-destructive/10 text-destructive", Icon: AlertCircle },
    warn: { cls: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400", Icon: TriangleAlert },
    good: { cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", Icon: CheckCircle2 },
  } as const;
  const { cls, Icon } = map[level];
  return (
    <div className={cn("flex gap-2 items-start rounded-xl border px-4 py-3 text-sm", cls)}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function Kpi({
  title,
  value,
  sub,
  level,
}: {
  title: string;
  value: string;
  sub: string;
  level: "bad" | "warn" | "good" | "info";
}) {
  const cls = {
    bad: "border-destructive/40 bg-destructive/10 text-destructive",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    good: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    info: "border-primary/30 bg-primary/10 text-primary",
  }[level];
  return (
    <div className={cn("rounded-xl border p-4", cls)}>
      <div className="text-[11px] uppercase tracking-wider font-bold flex items-center gap-1.5">
        <Zap className="h-3 w-3" /> {title}
      </div>
      <div className="text-2xl font-extrabold mt-1">{value}</div>
      <div className="text-[11px] opacity-80 mt-0.5">{sub}</div>
    </div>
  );
}

function DreRow({
  k,
  sub,
  v,
  tone,
}: {
  k: string;
  sub?: string;
  v: string;
  tone: "add" | "sub" | "eq" | "neutral";
}) {
  const cls = {
    add: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    sub: "bg-destructive/10 text-destructive",
    eq: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    neutral: "bg-surface-2 text-foreground",
  }[tone];
  return (
    <div className={cn("flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-sm", cls)}>
      <div>
        <div className="font-medium text-foreground">{k}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[340px]">{sub}</div>}
      </div>
      <div className="font-bold whitespace-nowrap">{v}</div>
    </div>
  );
}
