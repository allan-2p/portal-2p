import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { WizardActionBar } from "@/components/wizard-action-bar";
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
import { useServerFn } from "@tanstack/react-start";
import { listClientesFn } from "@/lib/clientes.functions";
import { getClienteLogo } from "@/lib/cliente-logos.functions";


import { AlertCircle, Check, Eye, CheckCircle2, ChevronsUpDown, FileDown, Info, Loader2, Plus, Save, Trash2, TriangleAlert, Users, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

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
import { registrarConclusao } from "@/lib/cpo-conclusao-log";


import { buildPropostaPdfHtml } from "@/lib/cpo-proposta-pdf";
import { MoneyInput } from "@/components/money-input";

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
  id: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  cliente_email: string | null;
  cliente_doc: string | null;
  cliente_ie: string | null;
  uf: string;
  contribuinte: boolean;
  cliente_updated_at: string | null;
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
  const [etapa, setEtapa] = useState<1 | 2 | 3 | 4>(1);
  const [tentouAvancar, setTentouAvancar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [propostaId, setPropostaId] = useState<string | null>(editId ?? null);
  const [numeroAtual, setNumeroAtual] = useState<string | null>(null);
  const [autosaveAt, setAutosaveAt] = useState<Date | null>(null);
  const [revisao, setRevisao] = useState<null | "salvar" | "concluir">(null);
  const [confirmarConclusao, setConfirmarConclusao] = useState(false);
  const [previewAberto, setPreviewAberto] = useState(false);
  const [usarLogoCliente, setUsarLogoCliente] = useState(true);

  const [propostaUpdatedAt, setPropostaUpdatedAt] = useState<string | null>(null);
  const [statusProposta, setStatusProposta] = useState<string>("Salvo");
  const submitLock = useRef(false);
  const numeroRef = useRef<string | null>(null);
  const carregado = useRef(false);

  // Bloqueia navegação interna enquanto a proposta está sendo salva/concluída
  useBlocker({
    shouldBlockFn: () => saving,
    withResolver: false,
    enableBeforeUnload: false,
  });

  // Alerta nativo do navegador (refresh, fechar aba, voltar) durante o processamento
  useEffect(() => {
    if (!saving) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saving]);

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
      setPropostaUpdatedAt((data.updated_at as string) ?? null);
      setStatusProposta((data.status as string) ?? "Salvo");
      setEtapa(2);
      toast.success(editId ? `Proposta ${data.numero ?? ""} carregada.` : "Proposta duplicada — salve para gerar um novo número.");
    })();
  }, [editId, dupId]);


  // Sem autosave local: cada nova proposta parte do zero.


  // Logomarca do cliente (cadastro) usada opcionalmente no PDF
  const buscarLogoCliente = useServerFn(getClienteLogo);
  const docLogo = (state.doc ?? "").replace(/\D/g, "");
  const logoQ = useQuery({
    queryKey: ["cliente-logo", docLogo],
    queryFn: () => buscarLogoCliente({ data: { doc: docLogo } }),
    enabled: docLogo.length >= 11,
  });
  const logoCliente = ((logoQ.data as any)?.data_url as string | undefined) ?? null;

  // Clientes vindos do cadastro universal (Clientes > Cadastros)

  const listClientes = useServerFn(listClientesFn);
  const clientesQ = useQuery({
    queryKey: ["cpo-clientes-cadastro"],
    queryFn: async () => {
      const res = await listClientes({ data: { instancia: "carregadores" } });
      const lista: ClienteCadastro[] = (res.clientes ?? [])
        .filter((c: Record<string, any>) => c["ativo"] !== false)
        .map((c: Record<string, any>) => ({
          id: String(c["id"]),
          cliente_nome:
            (c["nome_fantasia"] as string)?.trim() || (c["razao_social"] as string) || "—",
          cliente_telefone: (c["telefone"] as string) ?? null,
          cliente_email: (c["email"] as string) ?? null,
          cliente_doc: (c["doc"] as string) ?? null,
          cliente_ie: (c["ie"] as string) ?? null,
          uf: (c["uf"] as string) ?? "",
          contribuinte: c["contribuinte"] !== false,
          cliente_updated_at: (c["updated_at"] as string) ?? null,
        }));
      return lista.sort((a, b) => a.cliente_nome.localeCompare(b.cliente_nome, "pt-BR"));


    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  // Revalida o cadastro do cliente ao abrir uma proposta existente (nunca usa dados antigos)
  const revalidado = useRef(false);
  useEffect(() => {
    const alvo = editId ?? dupId;
    if (!alvo || revalidado.current) return;
    if (!state.doc && !state.nome) return;
    const lista = clientesQ.data;
    if (!lista?.length) return;
    const soDigitos = (v?: string | null) => (v ?? "").replace(/\D/g, "");
    const atual =
      lista.find((c) => soDigitos(c.cliente_doc) && soDigitos(c.cliente_doc) === soDigitos(state.doc)) ??
      lista.find((c) => c.cliente_nome.trim().toLowerCase() === state.nome.trim().toLowerCase());
    revalidado.current = true;
    if (!atual) return;
    const mudou =
      atual.cliente_nome !== state.nome ||
      (atual.cliente_telefone ?? "") !== state.telefone ||
      (atual.cliente_email ?? "") !== state.email ||
      (atual.cliente_ie ?? "") !== state.ie ||
      (atual.uf || "") !== state.uf ||
      atual.contribuinte !== state.contribuinte;
    if (!mudou) return;
    setState((s) => ({
      ...s,
      nome: atual.cliente_nome,
      telefone: atual.cliente_telefone ?? "",
      email: atual.cliente_email ?? "",
      doc: atual.cliente_doc ?? s.doc,
      ie: atual.cliente_ie ?? "",
      uf: atual.uf || s.uf,
      contribuinte: atual.contribuinte,
    }));
    toast.info("Dados do cliente atualizados conforme o cadastro atual.");
  }, [clientesQ.data, editId, dupId, state.doc, state.nome, state.telefone, state.email, state.ie, state.uf, state.contribuinte]);

  // Aviso visual quando o cadastro do cliente foi atualizado depois da última edição da proposta
  const avisoClienteAtualizado = useMemo(() => {
    if (!editId || !state.doc || !propostaUpdatedAt || !clientesQ.data?.length) return null;
    const soDigitos = (v?: string | null) => (v ?? "").replace(/\D/g, "");
    const atual = clientesQ.data.find(
      (c) => soDigitos(c.cliente_doc) && soDigitos(c.cliente_doc) === soDigitos(state.doc),
    );
    if (!atual?.cliente_updated_at) return null;
    const dtCliente = new Date(atual.cliente_updated_at).getTime();
    const dtProposta = new Date(propostaUpdatedAt).getTime();
    if (dtCliente > dtProposta) {
      return {
        data: atual.cliente_updated_at,
        formatada: new Date(atual.cliente_updated_at).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    }
    return null;
  }, [editId, state.doc, propostaUpdatedAt, clientesQ.data]);



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


  function irParaEtapa(alvo: 1 | 2 | 3 | 4) {
    if (alvo === 1) return setEtapa(1);
    if (!clienteOk) {
      setTentouAvancar(true);
      toast.error(errosCliente[0]?.msg ?? "Preencha os dados obrigatórios do cliente.");
      return;
    }
    if (alvo >= 3 && !temProduto) {
      setTentouAvancar(true);
      toast.error("Adicione ao menos um produto à proposta.");
      return;
    }
    setEtapa(alvo);
  }

  function avancarEtapa() {
    if (etapa < 4) irParaEtapa((etapa + 1) as 2 | 3 | 4);
  }

  function voltarEtapa() {
    if (etapa > 1) setEtapa((etapa - 1) as 1 | 2 | 3);
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
    setStatusProposta("Aguardando Pagamento");
    setSaving(true);
    void salvar("Aguardando Pagamento");
  }

  function iniciarConclusao() {
    setStatusProposta("Aguardando Pagamento");
    setConfirmarConclusao(true);
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


  // HTML do PDF derivado do estado atual: qualquer mudança em itens, frete,
  // impostos, margem ou comissão reflete imediatamente na prévia e no download.
  const pdfHtml = useMemo(
    () =>
      buildPropostaPdfHtml({
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
        logoCliente: usarLogoCliente ? logoCliente : null,
      }),
    [state, produtos, config, d, usarLogoCliente, logoCliente],

  );

  function montarPdfHtml() {
    return pdfHtml;
  }

  function abrirPreviewPdf() {
    if (!podeFechar) return toast.error(errosFechamento[0] ?? "Complete a proposta antes de visualizar o PDF.");
    setPreviewAberto(true);
  }

  function exportarPdf() {
    if (!podeFechar) return toast.error(errosFechamento[0] ?? "Complete a proposta antes de exportar o PDF.");
    const html = montarPdfHtml();
    const w = window.open("", "_blank");
    if (!w) return toast.error("Permita pop-ups para exportar o PDF.");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  }

  async function salvar(status: string = "Salvo") {
    // Lock síncrono: bloqueia envios repetidos mesmo antes do estado re-renderizar
    if (submitLock.current) return;
    if (!state.nome.trim()) return toast.error("Informe o nome do cliente.");
    if (!state.itens.some((i) => i.produtoId)) return toast.error("Adicione ao menos um produto.");
    if (abaixoPolitica) return toast.error("MB% abaixo da política mínima.");
    if (d.cmvExcedido)
      return toast.error(`CMV de ${fmtPct(d.cmv)} acima do limite de ${fmtPct(config.cmv_max)}. Necessária aprovação especial da diretoria.`);
    submitLock.current = true;
    // Quem chama concluirPedido já setou saving e status; evita piscar
    if (!saving) setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      // Número idempotente: reenvios reutilizam o mesmo número (índice único no banco)
      if (!numeroRef.current) numeroRef.current = `CPO-${Date.now().toString().slice(-6)}`;
      const numero = numeroAtual ?? numeroRef.current;
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
        const concluindo = status !== "Salvo";
        const { status: _ignore, ...dados } = payload;
        const { error } = await supabase
          .from("cpo_proposals")
          .update(concluindo ? dados : payload)
          .eq("id", propostaId);
        if (error) throw error;

        if (concluindo) {
          // Lock idempotente no banco: só conclui se ainda estiver "Salvo"
          const { data: res, error: rpcErr } = await supabase.rpc("cpo_conclude_proposal", {
            _id: propostaId,
            _status: status,
            _origem: "portal",
            _etapa: etapa,
          });

          if (rpcErr) throw rpcErr;
          const linha = Array.isArray(res) ? res[0] : res;
          if (linha?.already_concluded) {
            toast.info(`Pedido ${numero} já havia sido concluído (${linha.status}).`);
            invalidate();
            return;
          }
        }


        toast.success(concluindo ? `Pedido ${numero} concluído.` : `Proposta ${numero} atualizada.`);
        setNumeroAtual(numero);
        invalidate();
        limparRascunho();
        setAutosaveAt(null);
        return;
      }

      // Sempre nasce como "Salvo": a conclusão passa obrigatoriamente pela
      // validação de etapa/completude no banco (cpo_conclude_proposal).
      const { data: inserida, error } = await supabase
        .from("cpo_proposals")
        .insert({ ...payload, status: "Salvo", created_by: userRes.user?.id ?? null })
        .select("id")
        .single();
      if (error) {
        // Índice único no número: reenvio duplicado não cria um segundo registro
        if ((error as { code?: string }).code === "23505") {
          if (status !== "Salvo") {
            void registrarConclusao({ numero, status, resultado: "duplicada", detalhe: "Reenvio com número já existente" });
          }
          toast.info(`Proposta ${numero} já registrada.`);
          invalidate();
          return;
        }
        throw error;
      }
      if (status !== "Salvo") {
        if (!inserida?.id) throw new Error("Não foi possível concluir: proposta não localizada.");
        const { data: res, error: rpcErr } = await supabase.rpc("cpo_conclude_proposal", {
          _id: inserida.id,
          _status: status,
          _origem: "portal",
          _etapa: etapa,
        });
        if (rpcErr) {
          setPropostaId(inserida.id);
          setNumeroAtual(numero);
          throw rpcErr;
        }
        const linha = Array.isArray(res) ? res[0] : res;
        if (linha?.already_concluded) {
          toast.info(`Pedido ${numero} já havia sido concluído (${linha.status}).`);
          invalidate();
          return;
        }
      }

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
        numeroRef.current = null;
        setState(novoEstado());
        setEtapa(1);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar proposta.");
      if (status !== "Salvo") {
        void registrarConclusao({
          propostaId,
          numero: numeroAtual ?? numeroRef.current,
          status,
          resultado: "erro",
          detalhe: e instanceof Error ? e.message : "Erro ao concluir pedido",
        });
      }
      // Em caso de falha no "Concluir pedido", reverte o status para o anterior
      if (status !== "Salvo") setStatusProposta("Salvo");
    } finally {

      submitLock.current = false;
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
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <h1 className="text-3xl font-bold">
                {propostaId ? `Editar proposta${numeroAtual ? ` ${numeroAtual}` : ""}` : "Nova proposta"}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border",
                  statusProposta === "Aguardando Pagamento"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : statusProposta === "Salvo"
                      ? "bg-surface-2 text-muted-foreground border-border"
                      : "bg-primary/10 text-primary border-primary/30",
                )}
              >
                {saving && statusProposta === "Aguardando Pagamento" ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                ) : null}
                {statusProposta}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Cálculo fiscal em tempo real.
            </p>

          </div>

        </div>


        {/* Indicador de progresso: etapa atual x total */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              {[
                { n: 1 as const, label: "Identificação", go: () => setEtapa(1) },
                { n: 2 as const, label: "Produtos", go: () => irParaEtapa(2) },
                { n: 3 as const, label: "Faturamento e frete", go: () => irParaEtapa(3) },
                { n: 4 as const, label: "Finalização", go: () => irParaEtapa(4) },
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
              Etapa {etapa} de 4
            </span>
          </div>
          <div
            className="h-1.5 rounded-full bg-surface-2 overflow-hidden"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={4}
            aria-valuenow={etapa}
            aria-label={`Etapa ${etapa} de 4`}
          >
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(etapa / 4) * 100}%` }}
            />
          </div>
        </div>

        {avisoClienteAtualizado ? (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm flex items-start gap-3">
            <Info className="h-4 w-4 text-sky-600 dark:text-sky-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-sky-700 dark:text-sky-300">
                Cadastro do cliente atualizado
              </p>
              <p className="text-sky-700/80 dark:text-sky-300/80">
                Os dados deste cliente foram sincronizados automaticamente com a versão mais
                recente do cadastro (atualizado em{" "}
                <span className="font-medium">{avisoClienteAtualizado.formatada}</span>). Revise
                as informações fiscais antes de finalizar.
              </p>
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            "grid grid-cols-1 gap-5 items-start",
            etapa >= 2 ? "xl:grid-cols-[1.15fr_.85fr]" : "max-w-3xl",
          )}
        >
          {/* ENTRADAS */}
          <div className="glass rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                {etapa === 1
                  ? "Etapa 1 — Identificação"
                  : etapa === 2
                    ? "Etapa 2 — Produtos"
                    : etapa === 3
                      ? "Etapa 3 — Faturamento e frete"
                      : "Etapa 4 — Finalização"}
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
                Escolha o cliente. Os dados fiscais vêm do cadastro.
              </div>
            ) : null}




            {etapa === 1 ? (
              <>
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
                            {(clientesQ.data ?? []).map((c: ClienteCadastro) => (
                              <CommandItem
                                key={c.id}
                                value={[c.cliente_nome, c.cliente_doc, c.uf].filter(Boolean).join(" ")}
                                className="group"
                                onSelect={() => {
                                  aplicarCliente(c);
                                  setOpenCli(false);
                                }}
                              >
                                <div className="min-w-0">
                                  <div className="truncate font-medium">{c.cliente_nome}</div>
                                  <div className="text-xs text-muted-foreground group-data-[selected=true]:text-accent-foreground truncate">
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
                  </Field>
                ) : null}
              </>
            ) : state.nome ? (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm">
                <Users className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{state.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {labelFinalidadeUso[state.finalidadeUso]}
                  </p>
                </div>
              </div>
            ) : null}

            {etapa >= 2 ? (
              <>
            {temProduto ? <Banner level={st.level} text={st.msg} /> : null}



            <div className="flex gap-2 items-start rounded-xl border border-border bg-surface-2 px-4 py-3 text-xs text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
              <div>
                {state.contribuinte ? (
                  <>
                    <b className="text-foreground">Contribuinte.</b> ICMS origem {fmtPct(d.inter)} · DIFAL estimado{" "}
                    {fmtBRL(d.difalEstimado)}.
                  </>
                ) : (
                  <>
                    <b className="text-foreground">Não contribuinte.</b> Carga efetiva: ICMS origem {fmtPct(d.inter)} +
                    DIFAL absorvido {fmtBRL(d.difalAbs)}.
                  </>
                )}
              </div>
            </div>

            {/* Itens */}
            {etapa === 2 ? (
            <>
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
            </>
            ) : null}

            {etapa === 3 ? (
            <>
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
                    Informe o valor do frete absorvido pela 2P.
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
            </Field>
            </>
            ) : null}

            {etapa === 4 ? (
              <div className="rounded-xl border border-border bg-surface-2 p-4 space-y-2 text-sm">
                <p className="font-semibold">Revisão final</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Cliente</span>
                  <b>{state.nome || "—"}</b>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Itens</span>
                  <b>{state.itens.filter((i) => i.produtoId).length}</b>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Frete ({state.freteMod})</span>
                  <b>{fmtBRL(state.freteValor)}</b>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Total da proposta</span>
                  <b>{fmtBRL(d.valorTotalProposta)}</b>
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  Confira os valores e finalize salvando a proposta ou concluindo o pedido.
                </p>
              </div>
            ) : null}

            {/* TOTAIS AO VIVO — recalculam a cada mudança de preço/quantidade/frete */}
            <div className="sticky bottom-2 z-10 rounded-2xl border border-border bg-background/90 backdrop-blur px-4 py-3 shadow-lg">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Totais ao vivo</span>
                <span className="text-[11px] text-emerald-600">atualiza automaticamente</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <LiveTotal label="Itens" value={fmtBRL(d.valorItens)} />
                <LiveTotal label={`Frete (${state.freteMod})`} value={fmtBRL(state.freteValor)} />
                <LiveTotal label="Total da proposta" value={fmtBRL(d.valorTotalProposta)} strong />
                <LiveTotal label="Margem bruta" value={fmtPct(d.mbPct)} hint={fmtBRL(d.mb)} />
                <LiveTotal label="Comissão estimada" value={fmtBRL(d.comValor)} hint={fmtPct(d.comPct)} />
              </div>
            </div>
            </>

            ) : null}

          </div>

          {/* PAINEL / DRE */}
          {etapa >= 2 ? (
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
              <div className="grid grid-cols-2 gap-3">
                <SumItem label="Margem bruta %" value={fmtPct(d.mbPct)} hint={fmtBRL(d.mb)} />
                <SumItem label="Comissão estimada" value={fmtBRL(d.comValor)} hint={fmtPct(d.comPct)} />
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






          </div>
          ) : null}
        </div>

        {/* Barra de ações fixa no rodapé */}
        <WizardActionBar
          step={etapa}
          totalSteps={4}
          stepLabel={
            ["Identificação", "Produtos", "Faturamento e frete", "Finalização"][etapa - 1]
          }
          onBack={voltarEtapa}
          onNext={avancarEtapa}
          backDisabled={etapa === 1 || saving}
          nextDisabled={etapa === 4 || saving}
          errors={errosFechamento}
          showErrors={!podeFechar && tentouAvancar}
          savedAt={autosaveAt}
          minimal={etapa === 1}
          actions={
            etapa === 4
              ? [
                  {
                    label: "Salvar proposta",
                    onClick: () => pedirRevisao("salvar"),
                    icon: <Save className="h-4 w-4" />,
                    loading: saving && statusProposta !== "Aguardando Pagamento",
                  },
                  {
                    label: "Proposta em PDF",
                    onClick: abrirPreviewPdf,
                    icon: <Eye className="h-4 w-4" />,
                    disabled: !podeFechar || saving,
                  },
                ]
              : []
          }

          primary={
            etapa === 1
              ? null
              : etapa === 4
                ? {
                    label: "Concluir pedido",
                    onClick: iniciarConclusao,
                    icon: <CheckCircle2 className="h-4 w-4" />,
                    loading: saving && statusProposta === "Aguardando Pagamento",
                    disabled: saving,
                  }
                : {
                    label: "Salvar proposta",
                    onClick: () => pedirRevisao("salvar"),
                    icon: <Save className="h-4 w-4" />,
                    loading: saving,
                    disabled: saving,
                  }
          }
        />

        {/* Proposta em PDF */}
        <Dialog open={previewAberto} onOpenChange={setPreviewAberto}>
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle>Proposta em PDF</DialogTitle>
              <DialogDescription>
                Documento gerado com os dados atuais. Revise antes de baixar ou concluir o pedido.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5">
              <div>
                <div className="text-sm font-medium">Logomarca</div>
                <div className="text-xs text-muted-foreground">
                  {logoCliente
                    ? "Exibir a logomarca do cliente no cabeçalho da proposta."
                    : "Este cliente ainda não possui logomarca no cadastro."}
                </div>
              </div>
              <Switch
                checked={usarLogoCliente && !!logoCliente}
                disabled={!logoCliente}
                onCheckedChange={setUsarLogoCliente}
              />
            </div>
            <div className="rounded-xl border border-border overflow-hidden bg-white">
              <iframe
                title="Proposta em PDF"
                srcDoc={pdfHtml}
                className="w-full h-[65vh]"
              />
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPreviewAberto(false)}>
                Continuar editando
              </Button>
              <Button
                onClick={() => {
                  setPreviewAberto(false);
                  exportarPdf();
                }}
                className="gap-2"
              >
                <FileDown className="h-4 w-4" /> Baixar PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirmação antes de concluir o pedido */}
        <Dialog open={confirmarConclusao} onOpenChange={(o) => !saving && !o && setConfirmarConclusao(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TriangleAlert className="h-5 w-5 text-amber-500" />
                Confirmar conclusão do pedido
              </DialogTitle>
              <DialogDescription>
                Você está prestes a concluir este pedido. Essa ação pode gerar registros no sistema e não deve ser feita acidentalmente.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Deseja continuar e revisar os dados antes de finalizar?
              </p>
              <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center justify-between">
                <span className="text-muted-foreground">Status que será aplicado</span>
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
                  Aguardando Pagamento
                </span>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setConfirmarConclusao(false); if (!propostaId) setStatusProposta("Salvo"); }}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  setConfirmarConclusao(false);
                  pedirRevisao("concluir");
                }}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                Sim, revisar e concluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Revisão final antes de salvar / concluir */}
        <Dialog open={revisao !== null} onOpenChange={(o) => !saving && !o && setRevisao(null)}>
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
              {revisao === "concluir" ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Status do pedido</span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Aguardando Pagamento
                  </span>
                </div>
              ) : null}
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
              <Button variant="outline" onClick={() => setRevisao(null)} disabled={saving}>
                Voltar e editar
              </Button>
              <Button onClick={confirmarRevisao} disabled={saving} className="gap-2">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : revisao === "concluir" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving
                  ? "Processando..."
                  : revisao === "concluir"
                    ? "Confirmar pedido"
                    : "Confirmar e salvar"}
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
  // Pisca discretamente sempre que o valor recalculado muda (itens, quantidade, frete...)
  const anterior = useRef(value);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (anterior.current === value) return;
    anterior.current = value;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 600);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 transition-colors duration-500",
        flash ? "border-primary/60 bg-primary/10" : "border-border/60 bg-muted/30",
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("tabular-nums", strong ? "text-lg font-bold text-primary" : "text-sm font-semibold")}>
        {value}
      </div>
      {hint ? <div className="text-[10px] text-muted-foreground tabular-nums">{hint}</div> : null}
    </div>
  );
}
