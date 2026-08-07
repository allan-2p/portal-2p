import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  
  statusMB,
  type CpoItem,
  type CpoState,
} from "@/lib/cpo";
import { buildPropostaPdfHtml } from "@/lib/cpo-proposta-pdf";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/carregadores/propostas/nova")({
  validateSearch: (s: Record<string, unknown>) => ({
    id: typeof s.id === "string" ? s.id : undefined,
    dup: typeof s.dup === "string" ? s.dup : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Nova proposta — Portal 2P Carregadores" },
      {
        name: "description",
        content: "Monte uma nova proposta com cálculo de ICMS, DIFAL, impostos e margem bruta em tempo real.",
      },
      { property: "og:title", content: "Nova proposta — Portal 2P Carregadores" },
      {
        property: "og:description",
        content: "Nova proposta com DRE, DIFAL e política de margem da 2P Carregadores.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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

const DRAFT_KEY = "cpo-proposta-rascunho";

type Rascunho = { state: CpoState; etapa: 1 | 2; ts: number };

function lerRascunho(): Rascunho | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Rascunho;
    if (!parsed?.state || !Array.isArray(parsed.state.itens)) return null;
    return { ...parsed, etapa: parsed.etapa === 2 ? 2 : 1 };
  } catch {
    return null;
  }
}

function limparRascunho() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage indisponível */
  }
}


function PropostaCpoPage() {
  const { id: editId, dup: dupId } = Route.useSearch();
  const carregandoExistente = !!(editId || dupId);
  const produtosQ = useCpoProducts();
  const ufsQ = useCpoUfs();
  const configQ = useCpoConfig();
  const invalidate = useCpoInvalidate();

  const produtos = useMemo(() => (produtosQ.data ?? []).filter((p) => p.ativo), [produtosQ.data]);
  const ufs = ufsQ.data ?? [];
  const config = configQ.data ?? CPO_CONFIG_FALLBACK;

  const [state, setState] = useState<CpoState>(() =>
    carregandoExistente ? novoEstado() : lerRascunho()?.state ?? novoEstado(),
  );
  const [openCli, setOpenCli] = useState(false);
  const [etapa, setEtapa] = useState<1 | 2>(() => (carregandoExistente ? 1 : lerRascunho()?.etapa ?? 1));
  const [tentouAvancar, setTentouAvancar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [propostaId, setPropostaId] = useState<string | null>(editId ?? null);
  const [numeroAtual, setNumeroAtual] = useState<string | null>(null);
  const [autosaveAt, setAutosaveAt] = useState<Date | null>(() =>
    !carregandoExistente && lerRascunho()?.ts ? new Date(lerRascunho()!.ts) : null,
  );
  const [revisao, setRevisao] = useState<null | "salvar" | "concluir">(null);
  const rascunhoRestaurado = useRef(false);
  const carregado = useRef(false);

  // Aviso único quando um rascunho é restaurado
  useEffect(() => {
    if (carregandoExistente || rascunhoRestaurado.current) return;
    rascunhoRestaurado.current = true;
    const r = lerRascunho();
    if (r?.state?.nome || r?.state?.itens?.some((i) => i.produtoId)) {
      toast.info("Rascunho restaurado automaticamente.");
    }
  }, [carregandoExistente]);

  // Carrega uma proposta salva para continuar a edição ou duplicar
  useEffect(() => {
    const alvo = editId ?? dupId;
    if (!alvo || carregado.current) return;
    carregado.current = true;
    (async () => {
      const { data, error } = await supabase
        .from("cpo_proposals")
        .select("*")
        .eq("id", alvo)
        .maybeSingle();
      if (error || !data) {
        toast.error("Não foi possível carregar a proposta.");
        return;
      }
      const itens = ((data.itens as { produtoId?: string; qtd?: number; valor?: number }[]) ?? [])
        .filter((i) => i.produtoId)
        .map((i) => ({
          key: Math.random().toString(36).slice(2),
          produtoId: i.produtoId as string,
          qtd: Number(i.qtd ?? 1),
          valor: Number(i.valor ?? 0),
          valorManual: true,
        }));
      setState({
        nome: dupId ? `${data.cliente_nome}` : data.cliente_nome,
        telefone: data.cliente_telefone ?? "",
        email: data.cliente_email ?? "",
        doc: data.cliente_doc ?? "",
        ie: data.cliente_ie ?? "",
        uf: data.uf,
        contribuinte: data.contribuinte,
        freteMod: (data.frete_mod === "CIF" ? "CIF" : "FOB") as CpoState["freteMod"],
        freteValor: Number(data.frete_valor ?? 0),
        itens: itens.length ? itens : [novoItem()],
      });
      setNumeroAtual(editId ? data.numero : null);
      setEtapa(2);
      toast.success(editId ? `Proposta ${data.numero ?? ""} carregada.` : "Proposta duplicada — salve para gerar um novo número.");
    })();
  }, [editId, dupId]);


  // Autosave local enquanto o usuário avança nas etapas
  useEffect(() => {
    const t = setTimeout(() => {
      const vazio = !state.nome.trim() && !state.itens.some((i) => i.produtoId);
      if (vazio) {
        limparRascunho();
        setAutosaveAt(null);
        return;
      }
      const ts = Date.now();
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ state, etapa, ts }));
        setAutosaveAt(new Date(ts));
      } catch {
        /* storage indisponível */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [state, etapa]);


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
    setState((s) => ({
      ...s,
      nome: c.cliente_nome,
      telefone: c.cliente_telefone ?? "",
      email: c.cliente_email ?? "",
      doc: c.cliente_doc ?? "",
      ie: c.cliente_ie ?? "",
      uf: c.uf || s.uf,
      contribuinte: c.contribuinte ?? s.contribuinte,
    }));




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
  // ---- Validação da etapa 1 (dados obrigatórios do cliente) ----
  const soDigitos = (v: string) => (v || "").replace(/\D/g, "");
  const errosCliente: { campo: string; msg: string }[] = [];
  if (!state.nome.trim()) errosCliente.push({ campo: "nome", msg: "Selecione um cliente." });
  const docDigits = soDigitos(state.doc);
  if (!docDigits) errosCliente.push({ campo: "doc", msg: "CNPJ/CPF não informado no cadastro do cliente." });
  else if (docDigits.length !== 11 && docDigits.length !== 14)
    errosCliente.push({ campo: "doc", msg: "CNPJ/CPF inválido (11 ou 14 dígitos)." });
  if (!state.uf) errosCliente.push({ campo: "uf", msg: "UF de destino não informada." });
  else if (!ufs.some((u) => u.uf === state.uf))
    errosCliente.push({ campo: "uf", msg: "UF sem alíquota cadastrada." });
  if (state.contribuinte && !state.ie.trim())
    errosCliente.push({ campo: "ie", msg: "Cliente contribuinte precisa de Inscrição Estadual." });
  if (state.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(state.email.trim()))
    errosCliente.push({ campo: "email", msg: "E-mail do cliente é inválido." });

  const clienteOk = errosCliente.length === 0;
  const campoInvalido = (c: string) => errosCliente.some((e) => e.campo === c);
  const temProduto = state.itens.some((i) => i.produtoId);
  const podeSalvar = clienteOk && temProduto && !abaixoPolitica;

  function irParaEtapa2() {
    if (!clienteOk) {
      setTentouAvancar(true);
      toast.error(errosCliente[0]?.msg ?? "Preencha os dados obrigatórios do cliente.");
      return;
    }
    setEtapa(2);
  }


  // ---- Alertas automáticos de política ----

  const itensSemValor = state.itens.filter((i) => i.produtoId && !(i.valor > 0));
  const itensSemQtd = state.itens.filter((i) => i.produtoId && !(i.qtd > 0));
  const itensSemProduto = state.itens.filter((i) => !i.produtoId && (i.valor > 0 || i.qtd > 0));

  // ---- Bloqueios de fechamento (exportar PDF / concluir pedido) ----
  const errosFechamento: string[] = [];
  if (!clienteOk) errosFechamento.push(errosCliente[0]?.msg ?? "Complete os dados do cliente.");
  if (!temProduto) errosFechamento.push("Adicione ao menos um produto à proposta.");
  if (itensSemProduto.length)
    errosFechamento.push(`${itensSemProduto.length} linha(ns) sem produto selecionado.`);
  if (itensSemValor.length)
    errosFechamento.push(`${itensSemValor.length} item(ns) sem valor unitário.`);
  if (itensSemQtd.length)
    errosFechamento.push(`${itensSemQtd.length} item(ns) sem quantidade informada.`);
  if (state.freteMod === "CIF" && !(state.freteValor > 0))
    errosFechamento.push("Frete CIF sem valor informado — necessário para fechar os totais.");
  if (temProduto && !(d.valorTotalProposta > 0))
    errosFechamento.push("Total da proposta zerado — revise valores e quantidades.");
  if (abaixoPolitica) errosFechamento.push(`Margem bruta abaixo da política (${fmtPct(config.politica_mb_min)}).`);
  const podeFechar = errosFechamento.length === 0;

  // ---- Bloqueios de salvamento ----
  const errosSalvar: string[] = [];
  errosCliente.forEach((e) => errosSalvar.push(e.msg));
  if (!temProduto) errosSalvar.push("Adicione ao menos um produto à proposta.");
  if (itensSemProduto.length) errosSalvar.push(`${itensSemProduto.length} linha(ns) sem produto selecionado.`);
  if (abaixoPolitica) errosSalvar.push(`Margem bruta abaixo da política (${fmtPct(config.politica_mb_min)}).`);



  type Alerta = { level: "err" | "warn"; titulo: string; motivo: string; corrigir: string };
  const alertas: Alerta[] = [];
  if (temProduto && abaixoPolitica)
    alertas.push({
      level: "err",
      titulo: `Fora da política — MB ${fmtPct(d.mbPct)}`,
      motivo: `A margem bruta está abaixo do mínimo de ${fmtPct(config.politica_mb_min)} exigido pela política comercial.`,
      corrigir: "Aumente o valor unitário dos produtos ou reduza o frete absorvido (CIF).",
    });
  else if (temProduto && d.mbPct < config.mb_atencao)
    alertas.push({
      level: "warn",
      titulo: `Margem em atenção — ${fmtPct(d.mbPct)}`,
      motivo: `Abaixo do patamar de conforto de ${fmtPct(config.mb_atencao)}.`,
      corrigir: "Revise o valor unitário dos produtos antes de concluir o pedido.",
    });
  if (itensSemValor.length)
    alertas.push({
      level: "err",
      titulo: `${itensSemValor.length} item(ns) sem valor unitário`,
      motivo: "Itens sem preço não entram no cálculo fiscal nem na margem.",
      corrigir: "Preencha o campo Valor unitário (com IPI) dos itens destacados.",
    });
  if (itensSemQtd.length)
    alertas.push({
      level: "err",
      titulo: `${itensSemQtd.length} item(ns) sem quantidade`,
      motivo: "Sem quantidade não é possível fechar os totais da proposta.",
      corrigir: "Informe a quantidade (mínimo 1) dos itens destacados.",
    });
  if (itensSemProduto.length)
    alertas.push({
      level: "err",
      titulo: `${itensSemProduto.length} linha(ns) sem produto`,
      motivo: "Há linhas preenchidas sem produto selecionado.",
      corrigir: "Selecione o produto ou remova a linha.",
    });
  if (state.freteMod === "CIF" && !(state.freteValor > 0))
    alertas.push({
      level: "warn",
      titulo: "Frete CIF sem valor informado",
      motivo: "No CIF a 2P absorve o frete; sem valor a margem fica superestimada.",
      corrigir: "Preencha o campo Valor do frete.",
    });
  if (!state.contribuinte && d.difalAbs > 0 && d.mbPct < config.mb_atencao)
    alertas.push({
      level: "warn",
      titulo: "DIFAL absorvido pressionando a margem",
      motivo: `Cliente não contribuinte em ${uf?.nome ?? state.uf}: ${fmtBRL(d.difalAbs)} de DIFAL por conta da 2P.`,
      corrigir: "Considere majorar o valor unitário para repassar o DIFAL.",
    });

  const ReadField = ({ label, value, invalid }: { label: string; value: string; invalid?: boolean }) => (
    <div className={cn("min-w-0 rounded-md", invalid && "border border-destructive/50 bg-destructive/5 px-2 py-1")}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-medium truncate", invalid && "text-destructive")}>{value || "—"}</div>
    </div>
  );



  function concluirPedido() {
    if (!podeFechar) return toast.error(errosFechamento[0] ?? "Complete a proposta antes de concluir o pedido.");
    void salvar("Aguardando Pagamento");
  }

  function exportarPdf() {
    if (!podeFechar) return toast.error(errosFechamento[0] ?? "Complete a proposta antes de exportar o PDF.");
    const html = buildPropostaPdfHtml({
      cliente: {
        nome: state.nome,
        doc: state.doc,
        ie: state.ie,
        email: state.email,
        telefone: state.telefone,
        uf: state.uf,
        contribuinte: state.contribuinte,
      },
      itens: state.itens
        .filter((i) => i.produtoId)
        .map((i) => ({
          nome: produtos.find((p) => p.id === i.produtoId)?.nome ?? "",
          qtd: i.qtd,
          valor: i.valor,
        })),
      freteMod: state.freteMod,
      freteValor: state.freteValor,
      impostos: {
        ipiRate: config.ipi,
        ipiValor: d.ipiValor,
        icmsRate: d.icmsRate,
        icms: d.icms,
        pisCofinsRate: config.pis_cofins,
        pisCofins: d.pisCofins,
      },
      totalNf: d.valorItens + state.freteValor,
      valorTotal: d.valorTotalProposta,
      valor: d.valor,
      interno: {
        mb: d.mb,
        mbPct: d.mbPct,
        comissao: d.comValor,
        comissaoPct: d.comPct,
      },
    });
    const w = window.open("", "_blank");
    if (!w) return toast.error("Permita pop-ups para exportar o PDF.");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  }

  async function salvar(status: string = "Salvo") {
    if (!state.nome.trim()) return toast.error("Informe o nome do cliente.");
    if (!state.itens.some((i) => i.produtoId)) return toast.error("Adicione ao menos um produto.");
    if (abaixoPolitica) return toast.error("MB% abaixo da política mínima.");
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const numero = numeroAtual ?? `CPO-${Date.now().toString().slice(-6)}`;
      const payload = {
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
      };

      if (propostaId) {
        const { error } = await supabase.from("cpo_proposals").update(payload).eq("id", propostaId);
        if (error) throw error;
        toast.success(status === "Salvo" ? `Proposta ${numero} atualizada.` : `Pedido ${numero} concluído.`);
        setNumeroAtual(numero);
        invalidate();
        limparRascunho();
        setAutosaveAt(null);
        return;
      }

      const { data: inserida, error } = await supabase
        .from("cpo_proposals")
        .insert({ ...payload, created_by: userRes.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      toast.success(
        status === "Salvo" ? `Proposta ${numero} salva.` : `Pedido ${numero} concluído.`,
      );
      invalidate();
      limparRascunho();
      setAutosaveAt(null);
      if (status === "Salvo" && inserida?.id) {
        // segue editando a mesma proposta em vez de duplicar ao salvar de novo
        setPropostaId(inserida.id);
        setNumeroAtual(numero);
      } else {
        setState(novoEstado());
        setEtapa(1);
      }
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
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <Link to="/carregadores/propostas" className="text-primary hover:underline">Propostas</Link>
              <span>/</span>
              <span>{propostaId ? "Editar proposta" : "Nova proposta"}</span>
            </div>
            <h1 className="text-3xl font-bold mt-1">
              {propostaId ? `Editar proposta${numeroAtual ? ` ${numeroAtual}` : ""}` : "Nova proposta"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Cálculo fiscal completo da proposta em tempo real.
            </p>

            {autosaveAt ? (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Rascunho salvo automaticamente às{" "}
                {autosaveAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setEtapa(1)} disabled={etapa === 1} className="gap-2">
              Voltar
            </Button>
            <Button variant="outline" onClick={irParaEtapa2} disabled={etapa === 2} className="gap-2">
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
            onClick={irParaEtapa2}



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

            {etapa === 1 && errosCliente.length > 0 && (state.nome.trim() || tentouAvancar) ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <p className="font-semibold text-destructive mb-1">
                  Complete os campos obrigatórios para avançar
                </p>
                <ul className="list-disc pl-5 space-y-0.5 text-destructive/90">
                  {errosCliente.map((e) => (
                    <li key={e.campo + e.msg}>{e.msg}</li>
                  ))}
                </ul>
                <p className="text-xs text-destructive/80 mt-2">
                  Dados fiscais incompletos? Ajuste em Clientes › Cadastros.
                </p>
              </div>
            ) : etapa === 1 && !state.nome.trim() ? (
              <div className="rounded-xl border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
                Comece escolhendo o cliente. Os dados fiscais (CNPJ, IE, UF e contribuinte) são
                puxados automaticamente do cadastro e definem os impostos da proposta.
              </div>
            ) : null}




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
                        <div className="px-3 py-4 text-center text-sm text-muted-foreground space-y-2">
                          <p>{clientesQ.isLoading ? "Carregando..." : "Nenhum cliente encontrado."}</p>
                          {!clientesQ.isLoading ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => { window.location.href = "/carregadores/clientes/cadastros"; }}
                            >
                              Cadastrar cliente
                            </Button>
                          ) : null}
                        </div>
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
                  <ReadField label="E-mail" value={state.email} invalid={campoInvalido("email")} />
                  <ReadField label="CNPJ / CPF" value={state.doc} invalid={campoInvalido("doc")} />
                  <ReadField label="Estado (UF) de destino" value={uf ? `${uf.uf} — ${uf.nome}` : state.uf} invalid={campoInvalido("uf")} />
                  <ReadField label="Inscrição Estadual" value={state.ie || "Cliente sem IE"} invalid={campoInvalido("ie")} />

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
                const semValor = !!it.produtoId && !(it.valor > 0);
                const semQtd = !!it.produtoId && !(it.qtd > 0);
                const semProduto = !it.produtoId && (it.valor > 0 || it.qtd > 0);
                const bloqueado = semValor || semQtd || semProduto;
                return (
                  <div
                    key={it.key}
                    className={cn(
                      "rounded-xl border p-3 space-y-3 bg-surface/40",
                      bloqueado ? "border-destructive/60 ring-1 ring-destructive/25" : "border-border",
                    )}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_.5fr] gap-3">
                      <Field label="Produto">
                        <Select
                          value={it.produtoId}
                          onValueChange={(v) => setItem(it.key, { produtoId: v })}
                        >
                          <SelectTrigger
                            className={cn(semProduto && "border-destructive focus-visible:ring-destructive")}
                          >
                            <SelectValue placeholder="Selecione o produto" />
                          </SelectTrigger>
                          <SelectContent>
                            {produtos.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.nome}
                                {p.potencia ? ` · ${p.potencia}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {semProduto ? (
                          <p className="text-[11px] text-destructive mt-1">Selecione o produto ou remova a linha.</p>
                        ) : null}
                      </Field>
                      <Field label="Quantidade">
                        <Input
                          type="number"
                          min={1}
                          value={it.qtd === 0 ? "" : it.qtd}
                          className={cn(semQtd && "border-destructive focus-visible:ring-destructive")}
                          onChange={(e) => setItem(it.key, { qtd: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                        />
                        {semQtd ? (
                          <p className="text-[11px] text-destructive mt-1">Informe a quantidade (mínimo 1).</p>
                        ) : null}
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Valor unitário (com IPI)">
                        <Input
                          value={it.valor ? fmtBRL(it.valor) : ""}
                          placeholder="R$ 0,00"
                          className={cn(semValor && "border-destructive focus-visible:ring-destructive")}
                          onChange={(e) => setItem(it.key, { valor: parseMoeda(e.target.value), valorManual: true })}
                        />
                        {semValor ? (
                          <p className="text-[11px] text-destructive mt-1">Informe o valor unitário deste item.</p>
                        ) : null}
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
                  className={cn(
                    state.freteMod === "CIF" &&
                      !(state.freteValor > 0) &&
                      "border-amber-500 focus-visible:ring-amber-500",
                  )}
                  onChange={(e) => set("freteValor", parseMoeda(e.target.value))}
                />
                {state.freteMod === "CIF" && !(state.freteValor > 0) ? (
                  <p className="text-[11px] text-amber-600 mt-1">Frete CIF é absorvido pela 2P — informe o valor.</p>
                ) : null}
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
            <div className="rounded-2xl p-6 text-white bg-gradient-to-br from-[oklch(0.28_0.12_265)] via-[oklch(0.42_0.18_265)] to-[oklch(0.58_0.17_265)] shadow-xl space-y-5">
              <div className="border-b border-white/20 pb-4">
                <div className="text-[11px] uppercase tracking-[0.2em] opacity-75">Valor total da proposta</div>
                <div className="text-[2.6rem] leading-none font-extrabold mt-2 tabular-nums">
                  {fmtBRL(d.valorTotalProposta)}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SumItem label="Valor" value={fmtBRL(d.valor)} />
                <SumItem label="Valor com frete" value={fmtBRL(d.valorItens + state.freteValor)} />
                <SumItem label="Total NF" value={fmtBRL(d.valorItens + state.freteValor)} />
                <SumItem label="Margem bruta" value={fmtBRL(d.mb)} hint={fmtPct(d.mbPct)} />
                <SumItem
                  label="Comissão estimada"
                  value={fmtBRL(d.comValor)}
                  hint={fmtPct(d.comPct)}
                  className="sm:col-span-2"
                />
              </div>

              {/* ALERTAS AUTOMÁTICOS DE POLÍTICA */}
              {alertas.length ? (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] opacity-80">
                    <TriangleAlert className="h-3.5 w-3.5" />
                    {abaixoPolitica ? "Proposta fora da política" : "Pontos de atenção"}
                  </div>
                  {alertas.map((a, i) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-xl border px-4 py-3 bg-white/10 backdrop-blur-sm",
                        a.level === "err" ? "border-red-300/70" : "border-amber-200/60",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                            a.level === "err" ? "bg-red-500 text-white" : "bg-amber-400 text-amber-950",
                          )}
                        >
                          {a.level === "err" ? "Bloqueio" : "Atenção"}
                        </span>
                        <span className="text-sm font-semibold">{a.titulo}</span>
                      </div>
                      <p className="text-xs opacity-90 mt-1.5">{a.motivo}</p>
                      <p className="text-xs font-medium mt-1">Corrigir: {a.corrigir}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4" /> Proposta dentro da política comercial.
                </div>
              )}
            </div>

            {/* QUEBRA DETALHADA DA COMISSÃO */}
            <div className="glass rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Quebra da comissão estimada</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Regra, base de cálculo e impacto no resultado da proposta.
                </p>
              </div>

              <div className="rounded-xl border bg-muted/30 px-4 py-3 text-xs leading-relaxed">
                <span className="font-medium">Regra aplicada: </span>
                {fmtPct(d.comPct)} sobre {config.comissao_base === "VALOR" ? "o valor da venda" : "a margem bruta (MB)"}
                {" — "}
                comissão = base × percentual.
              </div>

              <div className="divide-y rounded-xl border">
                <ComRow
                  k="Percentual da regra"
                  sub={config.comissao_base === "VALOR" ? "Incide sobre a venda" : "Incide sobre a MB"}
                  v={fmtPct(d.comPct)}
                />
                <ComRow
                  k="Base de cálculo"
                  sub={config.comissao_base === "VALOR" ? "Valor da venda (sem frete)" : "Margem bruta da proposta"}
                  v={fmtBRL(config.comissao_base === "VALOR" ? d.valor : d.mb)}
                />
                <ComRow k="Comissão estimada" sub="Base × percentual" v={fmtBRL(d.comValor)} strong />
                <ComRow
                  k="Impacto sobre o valor da venda"
                  sub="Comissão ÷ valor da venda"
                  v={fmtPct(d.valor > 0 ? d.comValor / d.valor : 0)}
                />
                <ComRow
                  k="Impacto sobre a margem bruta"
                  sub="Comissão ÷ MB"
                  v={fmtPct(d.mb > 0 ? d.comValor / d.mb : 0)}
                />
                <ComRow
                  k="Margem após comissão"
                  sub={`MB ${fmtBRL(d.mb)} − comissão ${fmtBRL(d.comValor)}`}
                  v={`${fmtBRL(d.mb - d.comValor)} · ${fmtPct(d.valor > 0 ? (d.mb - d.comValor) / d.valor : 0)}`}
                  strong
                />
              </div>

              {d.comPct === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum percentual de comissão configurado em Moderação › Comissões — o valor estimado fica zerado.
                </p>
              ) : null}
            </div>



            <div className="glass rounded-2xl p-4 space-y-3">
              {!podeFechar ? (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
                  <p className="text-sm font-semibold text-destructive">
                    Corrija antes de exportar ou concluir o pedido
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-xs text-destructive space-y-0.5">
                    {errosFechamento.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => salvar()} disabled={saving || !podeSalvar} className="gap-2 flex-1 min-w-[160px]">
                  <Save className="h-4 w-4" /> Salvar proposta
                </Button>
                <Button variant="outline" onClick={exportarPdf} disabled={!podeFechar} className="gap-2 flex-1 min-w-[160px]">
                  <FileDown className="h-4 w-4" /> Baixar PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={concluirPedido}
                  disabled={saving || !podeFechar}
                  className="gap-2 flex-1 min-w-[160px]"
                >
                  <CheckCircle2 className="h-4 w-4" /> Concluir pedido
                </Button>
              </div>
            </div>
          </div>
          ) : null}
        </div>
      </div>
    </AppLayout>
  );
}

function SumItem({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm", className)}>
      <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">{label}</div>
      <div className="mt-1 flex items-baseline gap-2 flex-wrap">
        <span className="text-xl font-bold tabular-nums">{value}</span>
        {hint ? <span className="text-xs font-semibold opacity-85">{hint}</span> : null}
      </div>
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

function ComRow({ k, sub, v, strong }: { k: string; sub?: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div>
        <div className={cn("text-sm", strong ? "font-semibold" : "font-medium")}>{k}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[340px]">{sub}</div>}
      </div>
      <div className={cn("whitespace-nowrap tabular-nums", strong ? "text-base font-bold" : "text-sm font-semibold")}>
        {v}
      </div>
    </div>
  );
}
