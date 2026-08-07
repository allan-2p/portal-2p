import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppLayout } from "@/components/app-layout";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ChevronsUpDown, FileDown, Info, Plus, Save, Trash2, TriangleAlert, Users, Zap } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/carregadores/propostas/nova")({
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

type ClienteCadastro = {
  cliente_nome: string;
  cliente_telefone: string | null;
  cliente_email: string | null;
  cliente_doc: string | null;
  cliente_ie: string | null;
  uf: string;
  contribuinte: boolean;
};

function PropostaCpoPage() {
  const produtosQ = useCpoProducts();
  const ufsQ = useCpoUfs();
  const configQ = useCpoConfig();
  const invalidate = useCpoInvalidate();

  const produtos = useMemo(() => (produtosQ.data ?? []).filter((p) => p.ativo), [produtosQ.data]);
  const ufs = ufsQ.data ?? [];
  const config = configQ.data ?? CPO_CONFIG_FALLBACK;

  const [state, setState] = useState<CpoState>(() => novoEstado());
  const [openCli, setOpenCli] = useState(false);
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);

  // Clientes vindos do cadastro completo (Clientes > Cadastros)
  const clientesQ = useQuery({
    queryKey: ["cpo-clientes-cadastro"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cpo_clientes")
        .select("razao_social,nome_fantasia,telefone,email,doc,ie,uf,contribuinte")
        .eq("ativo", true)
        .order("razao_social");
      if (error) throw error;
      return (data ?? []).map((c) => ({
        cliente_nome: c.nome_fantasia?.trim() || c.razao_social,
        cliente_telefone: c.telefone,
        cliente_email: c.email,
        cliente_doc: c.doc,
        cliente_ie: c.ie,
        uf: c.uf,
        contribuinte: c.contribuinte,
      })) as ClienteCadastro[];
    },
  });


  const aplicarCliente = (c: ClienteCadastro) =>
    setState((s) => {
      const contribuinte = c.contribuinte ?? s.contribuinte;
      return {
        ...s,
        nome: c.cliente_nome,
        telefone: c.cliente_telefone ?? "",
        email: c.cliente_email ?? "",
        doc: c.cliente_doc ?? "",
        ie: c.cliente_ie ?? "",
        uf: c.uf || s.uf,
        contribuinte,
        itens: s.itens.map((i) =>
          i.valorManual
            ? i
            : { ...i, valor: precoSugerido(produtos.find((p) => p.id === i.produtoId), contribuinte, config) },
        ),
      };
    });



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
  const clienteOk = !!state.nome;
  const temProduto = state.itens.some((i) => i.produtoId);
  const podeSalvar = clienteOk && temProduto && !abaixoPolitica;

  const ReadField = ({ label, value }: { label: string; value: string }) => (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium truncate">{value || "—"}</div>
    </div>
  );


  function exportarPdf() {
    if (!podeSalvar) return toast.error("Selecione o cliente e ao menos um produto.");
    const linhas = state.itens
      .filter((i) => i.produtoId)
      .map((i) => {
        const nome = produtos.find((p) => p.id === i.produtoId)?.nome ?? "";
        return `<tr><td>${nome}</td><td style="text-align:center">${i.qtd}</td><td style="text-align:right">${fmtBRL(i.valor)}</td><td style="text-align:right">${fmtBRL(i.valor * i.qtd)}</td></tr>`;
      })
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Proposta CPO — ${state.nome}</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;padding:32px;color:#111}h1{font-size:20px;margin:0 0 4px}
      h2{font-size:14px;margin:24px 0 8px;text-transform:uppercase;letter-spacing:.08em;color:#555}
      table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid #ddd;padding:7px 6px}
      th{text-align:left;background:#f5f5f5}.tot{font-size:16px;font-weight:700;margin-top:16px}</style></head><body>
      <h1>Proposta CPO</h1><div style="font-size:12px;color:#666">Emitida em ${new Date().toLocaleDateString("pt-BR")}</div>
      <h2>Cliente</h2>
      <div style="font-size:13px">${state.nome}<br>${state.doc || ""} ${state.ie ? "· IE " + state.ie : ""}<br>${state.email || ""} ${state.telefone || ""}<br>UF ${state.uf} · ${state.contribuinte ? "Contribuinte ICMS" : "Não contribuinte"}</div>
      <h2>Produtos</h2>
      <table><thead><tr><th>Produto</th><th style="text-align:center">Qtd</th><th style="text-align:right">Unitário</th><th style="text-align:right">Total</th></tr></thead><tbody>${linhas}</tbody></table>
      <h2>Frete</h2><div style="font-size:13px">${state.freteMod} — ${fmtBRL(state.freteValor)}</div>
      <h2>Impostos</h2>
      <table><tbody>
        <tr><td>IPI (${fmtPct(config.ipi)})</td><td style="text-align:right">${fmtBRL(d.ipiValor)}</td></tr>
        <tr><td>ICMS efetivo (${fmtPct(d.icmsRate)})</td><td style="text-align:right">${fmtBRL(d.icms)}</td></tr>
        <tr><td>PIS/COFINS (${fmtPct(config.pis_cofins)})</td><td style="text-align:right">${fmtBRL(d.pisCofins)}</td></tr>
      </tbody></table>
      <div class="tot">Total NF: ${fmtBRL(d.valorItens + state.freteValor)}</div>
      <div class="tot">Valor total da proposta: ${fmtBRL(d.valorTotalProposta)}</div>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast.error("Permita pop-ups para exportar o PDF.");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  async function salvar(status: string = "Salvo") {
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
        status,
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
      toast.success(
        status === "Salvo" ? `Proposta ${numero} salva.` : `Pedido ${numero} concluído.`,
      );
      invalidate();
      setState(novoEstado());
      setEtapa(1);
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
            <div className="text-xs uppercase tracking-wider text-primary font-semibold">Propostas</div>
            <h1 className="text-3xl font-bold mt-1">Nova proposta</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Cálculo fiscal completo da proposta em tempo real.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setEtapa(1)} disabled={etapa === 1} className="gap-2">
              Voltar
            </Button>
            <Button variant="outline" onClick={() => setEtapa(2)} disabled={etapa === 2 || !clienteOk} className="gap-2">
              Próximo
            </Button>
            <Button onClick={() => salvar()} disabled={saving || !podeSalvar} className="gap-2">
              <Save className="h-4 w-4" /> Salvar proposta
            </Button>
          </div>

        </div>

        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setEtapa(1)}
            className={cn(
              "px-3 py-1.5 rounded-full border transition-colors",
              etapa === 1 ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground",
            )}
          >
            1. Cliente
          </button>
          <div className="h-px w-6 bg-border" />
          <button
            onClick={() => clienteOk && setEtapa(2)}
            disabled={!clienteOk}
            className={cn(
              "px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50",
              etapa === 2 ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground",
            )}
          >
            2. Produtos, frete e margem
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_.85fr] gap-5 items-start">
          {/* ENTRADAS */}
          <div className="glass rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                {etapa === 1 ? "Etapa 1 — Cliente" : "Etapa 2 — Produtos, frete e margem"}
              </h2>
            </div>


            <Field label="Cliente já cadastrado">
              <Popover open={openCli} onOpenChange={setOpenCli}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    <span className="flex items-center gap-2 truncate">
                      <Users className="h-4 w-4 text-primary shrink-0" />
                      {state.nome ? state.nome : "Selecionar cliente do cadastro"}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar cliente..." />
                    <CommandList>
                      <CommandEmpty>
                        {clientesQ.isLoading ? "Carregando..." : "Nenhum cliente em Clientes > Cadastros."}
                      </CommandEmpty>
                      <CommandGroup>
                        {(clientesQ.data ?? []).map((c) => (
                          <CommandItem
                            key={c.cliente_nome}
                            value={c.cliente_nome}
                            onSelect={() => {
                              aplicarCliente(c);
                              setOpenCli(false);
                            }}
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium">{c.cliente_nome}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {[c.cliente_doc, c.uf, c.cliente_email].filter(Boolean).join(" · ") || "Sem dados adicionais"}
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-[11px] text-muted-foreground mt-1">
                Os dados fiscais vêm direto do cadastro do cliente.
              </p>

            </Field>

            {state.nome ? (
              <div className="rounded-xl border border-border bg-surface-2 p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  <ReadField label="Nome do cliente" value={state.nome} />
                  <ReadField label="Telefone" value={state.telefone} />
                  <ReadField label="E-mail" value={state.email} />
                  <ReadField label="CNPJ / CPF" value={state.doc} />
                  <ReadField label="Estado (UF) de destino" value={uf ? `${uf.uf} — ${uf.nome}` : state.uf} />
                  <ReadField label="Inscrição Estadual" value={state.ie || "Cliente sem IE"} />
                </div>
                <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
                  <b className="text-foreground">
                    {state.contribuinte ? "Cliente contribuinte do ICMS" : "Cliente não contribuinte do ICMS"}
                  </b>{" "}
                  <span className="text-muted-foreground">
                    {state.contribuinte
                      ? "DIFAL por conta do destinatário."
                      : "DIFAL absorvido na venda."}
                  </span>
                </div>
              </div>
            ) : null}

            {etapa === 2 ? (
              <>
            <Banner level={st.level} text={st.msg} />



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
                    {uf?.fcp ? ` (inclui FCP de ${fmtPct(uf.fcp)})` : ""}.
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
                          Total item: <b className="text-foreground">{fmtBRL(it.valor * it.qtd)}</b>
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
            </>
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Etapa 1: selecione o cliente. Produtos, frete e impostos ficam na etapa 2.
              </div>
            )}
          </div>

          {/* PAINEL / DRE */}
          {etapa === 2 ? (
          <div className="space-y-4">
            <div className="glass rounded-2xl p-5 space-y-1.5">
              <h2 className="font-semibold mb-3">Impostos da proposta</h2>
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


            </div>

            {/* RESUMO FINAL DESTACADO */}
            <div className="rounded-2xl p-5 text-white bg-gradient-to-br from-[oklch(0.3_0.13_265)] via-[oklch(0.45_0.19_265)] to-[oklch(0.6_0.17_265)] shadow-lg space-y-4">
              <div>
                <div className="text-[11px] uppercase tracking-widest opacity-80">Valor total da proposta</div>
                <div className="text-4xl font-extrabold mt-1">{fmtBRL(d.valorTotalProposta)}</div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <SumItem label="Valor" value={fmtBRL(d.valor)} />
                <SumItem label="Valor com frete" value={fmtBRL(d.valorItens + state.freteValor)} />
                <SumItem label="Total NF" value={fmtBRL(d.valorItens + state.freteValor)} />
                <SumItem label="Margem bruta" value={`${fmtBRL(d.mb)} · ${fmtPct(d.mbPct)}`} />
                <SumItem label="Comissão estimada" value={`${fmtBRL(d.comValor)} · ${fmtPct(d.comPct)}`} />
              </div>
            </div>

            <div className="glass rounded-2xl p-4 flex flex-wrap gap-2">
              <Button onClick={() => salvar()} disabled={saving || !podeSalvar} className="gap-2 flex-1 min-w-[160px]">
                <Save className="h-4 w-4" /> Salvar proposta
              </Button>
              <Button variant="outline" onClick={exportarPdf} disabled={!podeSalvar} className="gap-2 flex-1 min-w-[160px]">
                <FileDown className="h-4 w-4" /> Exportar PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => salvar("Aguardando Pagamento")}
                disabled={saving || !podeSalvar}
                className="gap-2 flex-1 min-w-[160px]"
              >
                <CheckCircle2 className="h-4 w-4" /> Concluir pedido
              </Button>
            </div>
          </div>
          ) : null}
        </div>
      </div>
    </AppLayout>
  );
}

function SumItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-widest opacity-75">{label}</div>
      <div className="text-base font-bold truncate">{value}</div>
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
