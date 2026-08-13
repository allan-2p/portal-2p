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
import { AlertCircle, Check, CheckCircle2, ChevronsUpDown, FileDown, Info, Plus, Save, Trash2, TriangleAlert, Users, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { Textarea } from "@/components/ui/textarea";
import { useCpoConfig, useCpoNcms, useCpoProducts, useCpoUfs, useCpoInvalidate } from "@/hooks/use-cpo";
import {
  CPO_CONFIG_FALLBACK,
  calcularCpo,
  fmtBRL,
  fmtPct,
  labelFinalidadeUso,
  OBSERVACOES_PADRAO,
  FRETE_ABSORVIDO,
  labelFreteMod,
  novoEstado,
  novoItem,
  parseMoeda,
  statusMB,
  type CpoFinalidadeUso,
  type CpoItem,
  type CpoFreteMod,
  type CpoState,
  textoDifalContribuinte,
} from "@/lib/cpo";

import { buildPropostaPdfHtml } from "@/lib/cpo-proposta-pdf";
import { MoneyInput } from "@/components/money-input";
import { CpoCatalogoModelos } from "@/components/cpo-catalogo-modelos";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/carregadores/propostas/nova")({
  validateSearch: (s: Record<string, unknown>): { id?: string; dup?: string } => ({
    ...(typeof s.id === "string" ? { id: s.id } : {}),
    ...(typeof s.dup === "string" ? { dup: s.dup } : {}),
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

/** Arredonda para centavos exatos, evitando resíduo de ponto flutuante ao salvar/reabrir. */
const money2 = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
};





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
  const ncmsQ = useCpoNcms();
  const invalidate = useCpoInvalidate();

  const produtos = useMemo(() => (produtosQ.data ?? []).filter((p) => p.ativo), [produtosQ.data]);
  const ufs = ufsQ.data ?? [];
  const config = configQ.data ?? CPO_CONFIG_FALLBACK;

  // Nova proposta sempre começa vazia; só carrega dados ao editar/duplicar uma proposta salva.
  const [state, setState] = useState<CpoState>(() => novoEstado());
  const [openCli, setOpenCli] = useState(false);
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [tentouAvancar, setTentouAvancar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [propostaId, setPropostaId] = useState<string | null>(editId ?? null);
  const [numeroAtual, setNumeroAtual] = useState<string | null>(null);
  const [autosaveAt, setAutosaveAt] = useState<Date | null>(null);
  const [revisao, setRevisao] = useState<null | "salvar" | "concluir">(null);
  const carregado = useRef(false);

  // Limpa qualquer rascunho local antigo ao abrir uma nova proposta
  useEffect(() => {
    if (!carregandoExistente) limparRascunho();
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
          valor: money2(i.valor ?? 0),
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
        finalidadeUso: ((data.finalidade_uso as CpoState["finalidadeUso"]) ?? "uso_consumo"),
        freteMod: (data.frete_mod === "CIF" || data.frete_mod === "DEDICADO"
          ? data.frete_mod
          : "FOB") as CpoFreteMod,
        freteValor: money2(data.frete_valor ?? 0),
        observacoes: (data.observacoes as string | null) ?? OBSERVACOES_PADRAO,
        itens: itens.length ? itens : [novoItem()],
      });
      setNumeroAtual(editId ? data.numero : null);
      setEtapa(2);
      toast.success(editId ? `Proposta ${data.numero ?? ""} carregada.` : "Proposta duplicada — salve para gerar um novo número.");
    })();
  }, [editId, dupId]);


  // Sem autosave local: cada nova proposta parte do zero.



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
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
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

  const d = calcularCpo(state, produtosQ.data ?? [], ufs, config, ncmsQ.data ?? []);
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
  const podeSalvar = clienteOk && temProduto && !abaixoPolitica && !d.cmvExcedido;

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
  const itensSemProduto = state.itens.filter((i) => !i.produtoId && i.valor > 0);

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
  if (FRETE_ABSORVIDO.includes(state.freteMod) && !(state.freteValor > 0))
    errosFechamento.push(`Frete ${state.freteMod} sem valor informado — necessário para fechar os totais.`);
  if (temProduto && !(d.valorTotalProposta > 0))
    errosFechamento.push("Total da proposta zerado — revise valores e quantidades.");
  if (temProduto && abaixoPolitica) errosFechamento.push(`Margem bruta abaixo da política (${fmtPct(config.politica_mb_min)}).`);
  if (temProduto && d.cmvExcedido)
    errosFechamento.push(`CMV de ${fmtPct(d.cmv)} acima do limite de ${fmtPct(config.cmv_max)} — exige aprovação da diretoria.`);
  const podeFechar = errosFechamento.length === 0;

  // ---- Bloqueios de salvamento ----
  const errosSalvar: string[] = [];
  errosCliente.forEach((e) => errosSalvar.push(e.msg));
  if (!temProduto) errosSalvar.push("Adicione ao menos um produto à proposta.");
  if (itensSemProduto.length) errosSalvar.push(`${itensSemProduto.length} linha(ns) sem produto selecionado.`);
  if (temProduto && abaixoPolitica) errosSalvar.push(`Margem bruta abaixo da política (${fmtPct(config.politica_mb_min)}).`);
  if (temProduto && d.cmvExcedido)
    errosSalvar.push(`CMV de ${fmtPct(d.cmv)} acima do limite de ${fmtPct(config.cmv_max)} — exige aprovação da diretoria.`);



  type Alerta = { level: "err" | "warn"; titulo: string; motivo: string; corrigir: string };
  const alertas: Alerta[] = [];
  if (temProduto && abaixoPolitica)
    alertas.push({
      level: "err",
      titulo: `Fora da política — MB ${fmtPct(d.mbPct)}`,
      motivo: `A margem bruta está abaixo do mínimo de ${fmtPct(config.politica_mb_min)} exigido pela política comercial.`,
      corrigir: "Aumente o valor unitário dos produtos ou reduza o frete absorvido (CIF/Dedicado).",
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
  if (FRETE_ABSORVIDO.includes(state.freteMod) && !(state.freteValor > 0))
    alertas.push({
      level: "warn",
      titulo: `Frete ${state.freteMod} sem valor informado`,
      motivo: "Nessa modalidade a 2P absorve o frete; sem valor a margem fica superestimada.",
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

  // Abre a revisão final antes de salvar/enviar; bloqueia com mensagens se houver pendências
  function pedirRevisao(acao: "salvar" | "concluir") {
    const erros = acao === "salvar" ? errosSalvar : errosFechamento;
    if (erros.length) {
      setTentouAvancar(true);
      if (etapa === 1 && !clienteOk) setEtapa(1);
      toast.error(erros[0], {
        description: erros.length > 1 ? `+ ${erros.length - 1} pendência(s) a corrigir.` : undefined,
      });
      return;
    }
    setRevisao(acao);
  }

  function confirmarRevisao() {
    const acao = revisao;
    setRevisao(null);
    if (acao === "concluir") concluirPedido();
    else void salvar();
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
          codigo: produtos.find((p) => p.id === i.produtoId)?.codigo ?? null,
          nome: produtos.find((p) => p.id === i.produtoId)?.nome ?? "",
          qtd: i.qtd,
          valor: i.valor,
        })),
      freteMod: state.freteMod,
      freteValor: state.freteValor,
      observacoes: state.observacoes,
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
    if (d.cmvExcedido)
      return toast.error(`CMV de ${fmtPct(d.cmv)} acima do limite de ${fmtPct(config.cmv_max)}. Necessária aprovação especial da diretoria.`);
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
        finalidade_uso: state.finalidadeUso,
        frete_mod: state.freteMod,
        frete_valor: money2(state.freteValor),
        observacoes: state.observacoes?.trim() || null,
        itens: state.itens.map((i) => ({
          produtoId: i.produtoId,
          codigo: produtos.find((p) => p.id === i.produtoId)?.codigo ?? null,
          nome: produtos.find((p) => p.id === i.produtoId)?.nome ?? "",
          qtd: i.qtd,
          valor: money2(i.valor),
        })),
        totais: {
          valorTotal: d.valorTotalProposta,
          valor: d.valor,
          icms: d.icms,
          icmsRate: d.icmsRate,
          ipi: d.ipiValor,
          pisCofins: d.pisCofins,
          rl: d.rl,
          custo: 0,
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

        </div>

        <CpoCatalogoModelos
          produtos={produtos}
          onSelecionar={(produtoId) => {
            setState((s) => {
              const vazio = s.itens.find((i) => !i.produtoId);
              if (vazio) {
                return {
                  ...s,
                  itens: s.itens.map((i) =>
                    i.key === vazio.key ? { ...i, produtoId, qtd: i.qtd || 1 } : i,
                  ),
                };
              }
              return { ...s, itens: [...s.itens, { ...novoItem(), produtoId, qtd: 1 }] };
            });
            setEtapa(2);
            toast.success("Modelo adicionado à proposta");
          }}
        />

        {/* Indicador de progresso: etapa atual x total */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              {[
                { n: 1 as const, label: "Cliente", go: () => setEtapa(1) },
                { n: 2 as const, label: "Produtos, frete e margem", go: irParaEtapa2 },
              ].map((s, i) => {
                const atual = etapa === s.n;
                const concluida = etapa > s.n;
                return (
                  <div key={s.n} className="flex items-center gap-2">
                    {i > 0 && <div className="h-px w-6 bg-border" />}
                    <button
                      onClick={s.go}
                      aria-current={atual ? "step" : undefined}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors",
                        atual
                          ? "border-primary bg-primary/10 text-primary font-semibold"
                          : concluida
                            ? "border-primary/40 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "h-5 w-5 rounded-full grid place-items-center text-[11px] font-bold",
                          atual || concluida ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground",
                        )}
                      >
                        {concluida ? <Check className="h-3 w-3" /> : s.n}
                      </span>
                      {s.label}
                    </button>
                  </div>
                );
              })}
            </div>
            <span className="text-xs font-medium text-muted-foreground shrink-0">
              Etapa {etapa} de 2
            </span>
          </div>
          <div
            className="h-1.5 rounded-full bg-surface-2 overflow-hidden"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={2}
            aria-valuenow={etapa}
            aria-label={`Etapa ${etapa} de 2`}
          >
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(etapa / 2) * 100}%` }}
            />
          </div>
        </div>

        <div
          className={cn(
            "grid grid-cols-1 gap-5 items-start",
            etapa === 2 ? "xl:grid-cols-[1.15fr_.85fr]" : "max-w-3xl",
          )}
        >
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
                            value={[c.cliente_nome, c.cliente_doc, c.uf].filter(Boolean).join(" ")}
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

            {state.nome ? (
              <Field label="Finalidade de uso">
                <Select
                  value={state.finalidadeUso}
                  onValueChange={(v) => set("finalidadeUso", v as CpoFinalidadeUso)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uso_consumo">{labelFinalidadeUso.uso_consumo}</SelectItem>
                    <SelectItem value="revenda">{labelFinalidadeUso.revenda}</SelectItem>
                    <SelectItem value="industrializacao">{labelFinalidadeUso.industrializacao}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Define a destinação da mercadoria e pode afetar o tratamento fiscal da operação.
                </p>
              </Field>
            ) : null}

            {etapa === 2 ? (
              <>
            {temProduto ? <Banner level={st.level} text={st.msg} /> : null}



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
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="font-semibold text-sm">Produtos</h3>
                <div className="flex items-center gap-3">
                  
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setState((s) => ({ ...s, itens: [...s.itens, novoItem()] }))}
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar item
                  </Button>
                </div>
              </div>


              {state.itens.map((it) => {
                const semValor = !!it.produtoId && !(it.valor > 0);
                const semQtd = !!it.produtoId && !(it.qtd > 0);
                const semProduto = !it.produtoId && it.valor > 0;
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
                                {p.codigo ? `${p.codigo} — ` : ""}
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
                        <MoneyInput
                          value={it.valor}
                          placeholder="R$ 0,00"
                          maxValue={10000000}
                          className={cn(semValor && "border-destructive focus-visible:ring-destructive")}
                          onValueChange={(n: number) => setItem(it.key, { valor: n, valorManual: true })}
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
                Soma dos valores dos itens = <b className="text-foreground">{fmtBRL(d.valorItens)}</b>
              </div>

            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Modalidade de frete">
                <Select value={state.freteMod} onValueChange={(v) => set("freteMod", v as CpoFreteMod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FOB">{labelFreteMod.FOB}</SelectItem>
                    <SelectItem value="CIF">{labelFreteMod.CIF}</SelectItem>
                    <SelectItem value="DEDICADO">{labelFreteMod.DEDICADO}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Valor do frete">
                <MoneyInput
                  value={state.freteValor}
                  placeholder="R$ 0,00"
                  maxValue={1000000}
                  className={cn(
                    FRETE_ABSORVIDO.includes(state.freteMod) &&
                      !(state.freteValor > 0) &&
                      "border-amber-500 focus-visible:ring-amber-500",
                  )}
                  onValueChange={(n: number) => set("freteValor", n)}
                />


                {FRETE_ABSORVIDO.includes(state.freteMod) && !(state.freteValor > 0) ? (
                  <p className="text-[11px] text-amber-600 mt-1">
                    Frete {state.freteMod === "DEDICADO" ? "dedicado" : "CIF"} é absorvido pela 2P — informe o valor.
                  </p>
                ) : null}
              </Field>
            </div>

            <Field label="Observações">
              <Textarea
                rows={3}
                value={state.observacoes}
                placeholder="Observações da proposta"
                onChange={(e) => set("observacoes", e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Texto padrão incluído automaticamente — pode ser editado.
              </p>
            </Field>

            {/* TOTAIS AO VIVO — recalculam a cada mudança de preço/quantidade/frete */}
            <div className="sticky bottom-2 z-10 rounded-2xl border border-border bg-background/90 backdrop-blur px-4 py-3 shadow-lg">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Totais ao vivo</span>
                <span className="text-[11px] text-emerald-600">atualiza automaticamente</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <LiveTotal label="Itens" value={fmtBRL(d.valorItens)} />
                <LiveTotal label={`Frete (${state.freteMod})`} value={fmtBRL(state.freteValor)} />
                <LiveTotal label="Total da proposta" value={fmtBRL(d.valorTotalProposta)} strong />
                <LiveTotal label="Comissão estimada" value={fmtBRL(d.comValor)} hint={fmtPct(d.comPct)} />
              </div>
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
              <DreRow
                k="Valor total da proposta"
                sub="Itens + frete"
                v={fmtBRL(d.valorTotalProposta)}
                tone="neutral"
              />
              <DreRow
                k="Frete"
                sub={`Modalidade ${state.freteMod}`}
                v={fmtBRL(state.freteValor)}
                tone="neutral"
              />
              <DreRow
                k="Valor total dos itens"
                sub="Valor dos produtos com IPI"
                v={fmtBRL(d.valorItens)}
                tone="neutral"
              />
              <DreRow
                k="IPI destacado"
                sub="Valor do IPI destacado na NF"
                v={fmtBRL(d.ipiValor)}
                tone="neutral"
              />
              <DreRow
                k="Valor total dos itens sem IPI"
                sub="Base fiscal sem IPI"
                v={fmtBRL(d.valorItem)}
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
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <SumItem label="Valor" value={fmtBRL(d.valor)} />
                <SumItem label="Valor com frete" value={fmtBRL(d.valorItens + state.freteValor)} />
                <SumItem label="Total NF" value={fmtBRL(d.valorItens + state.freteValor)} />
                <SumItem label="Margem bruta %" value={fmtPct(d.mbPct)} hint={fmtBRL(d.mb)} />
                <SumItem label="Comissão estimada" value={fmtBRL(d.comValor)} hint={fmtPct(d.comPct)} />
                <SumItem
                  label="Margem após comissão %"
                  value={fmtPct(d.valor > 0 ? (d.mb - d.comValor) / d.valor : 0)}
                  hint={fmtBRL(d.mb - d.comValor)}
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






            <div className="glass rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={exportarPdf} disabled={!podeFechar} className="gap-2 flex-1 min-w-[160px]">
                  <FileDown className="h-4 w-4" /> Baixar PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={() => pedirRevisao("concluir")}
                  disabled={saving}
                  className="gap-2 flex-1 min-w-[160px]"
                >
                  <CheckCircle2 className="h-4 w-4" /> Concluir pedido
                </Button>
              </div>
            </div>
          </div>
          ) : null}
        </div>

        {/* Barra de ações fixa no rodapé */}
        <div className="sticky bottom-0 z-20 mt-6 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-background/95 backdrop-blur border-t border-border">
          <div className="flex items-center gap-3 flex-wrap justify-between">
            {!podeFechar ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 max-w-xl">
                <p className="text-sm font-semibold text-destructive">
                  Corrija antes de exportar ou concluir o pedido
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs text-destructive space-y-0.5">
                  {errosFechamento.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4" /> Proposta dentro da política comercial.
              </div>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" onClick={() => setEtapa(1)} disabled={etapa === 1} className="gap-2">
                Voltar
              </Button>
              <Button variant="outline" onClick={irParaEtapa2} disabled={etapa === 2} className="gap-2">
                Próximo
              </Button>
              <Button onClick={() => pedirRevisao("salvar")} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" /> Salvar proposta
              </Button>
            </div>
          </div>
        </div>

        {/* Revisão final antes de salvar / concluir */}
        <Dialog open={revisao !== null} onOpenChange={(o) => !o && setRevisao(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {revisao === "concluir" ? "Revisar e concluir pedido" : "Revisar e salvar proposta"}
              </DialogTitle>
              <DialogDescription>
                Confira os dados abaixo antes de {revisao === "concluir" ? "enviar o pedido" : "salvar a proposta"}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-sm max-h-[55vh] overflow-y-auto pr-1">
              <div className="rounded-xl border border-border p-3 space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Cliente</p>
                <p className="font-semibold">{state.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {state.doc} · {state.uf} · {state.contribuinte ? "Contribuinte" : "Não contribuinte"}
                  {state.email ? ` · ${state.email}` : ""}
                </p>
              </div>

              <div className="rounded-xl border border-border p-3 space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Itens ({state.itens.filter((i) => i.produtoId).length})
                </p>
                {state.itens
                  .filter((i) => i.produtoId)
                  .map((i) => (
                    <div key={i.key} className="flex items-center justify-between gap-3">
                      <span className="truncate">
                        {produtos.find((p) => p.id === i.produtoId)?.nome ?? "—"} × {i.qtd}
                      </span>
                      <span className="tabular-nums font-medium">{fmtBRL(i.qtd * i.valor)}</span>
                    </div>
                  ))}
                <div className="flex items-center justify-between gap-3 pt-1 border-t border-border">
                  <span className="text-muted-foreground">Frete ({state.freteMod})</span>
                  <span className="tabular-nums">{fmtBRL(state.freteValor)}</span>
                </div>
              </div>

              <div className="rounded-xl border border-border p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Valor da proposta</span>
                  <span className="tabular-nums font-semibold">{fmtBRL(d.valorTotalProposta)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total NF (com frete)</span>
                  <span className="tabular-nums">{fmtBRL(d.valorItens + state.freteValor)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Margem bruta</span>
                  <span className="tabular-nums">
                    {fmtBRL(d.mb)} ({fmtPct(d.mbPct)})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Comissão estimada</span>
                  <span className="tabular-nums">{fmtBRL(d.comValor)}</span>
                </div>
              </div>

              {alertas.length ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Atenção</p>
                  <ul className="mt-1 list-disc pl-5 text-xs space-y-0.5">
                    {alertas.map((a, i) => (
                      <li key={i}>{a.titulo}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setRevisao(null)}>
                Voltar e editar
              </Button>
              <Button onClick={confirmarRevisao} disabled={saving} className="gap-2">
                {revisao === "concluir" ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Confirmar pedido
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Confirmar e salvar
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
    <div
      className={cn(
        "flex h-full min-w-0 flex-col justify-between rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm",
        className,
      )}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] opacity-80 truncate">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-xl font-bold tabular-nums truncate">{value}</span>
        {hint ? <span className="text-xs font-semibold opacity-85 shrink-0">{hint}</span> : null}
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

function LiveTotal({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("tabular-nums", strong ? "text-lg font-bold text-primary" : "text-sm font-semibold")}>
        {value}
      </div>
      {hint ? <div className="text-[10px] text-muted-foreground tabular-nums">{hint}</div> : null}
    </div>
  );
}
