import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { propostaStatusStyle } from "@/lib/proposta-status";
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
import { PropostaIndicacao } from "@/components/proposta-indicacao";
import { CepInput } from "@/components/cep-input";
import { FreteCotacao } from "@/components/frete-cotacao";
import { ProdutoFoto } from "@/components/produto-foto";
import { useImagensPorPath } from "@/lib/produto-imagens";



import { AlertCircle, Check, Eye, CheckCircle2, ChevronsUpDown, FileDown, Info, Loader2, Plus, Save, Trash2, TriangleAlert, Users, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

import { useCarregadoresConfig, useCarregadoresNcms, useCarregadoresProducts, useCarregadoresUfs, useCarregadoresInvalidate } from "@/hooks/use-carregadores";
import {
  CARREGADORES_CONFIG_FALLBACK,
  calcularCarregadores,
  fmtBRL,
  fmtPct,
  labelFinalidadeUso,
  finalidadeUsoDoCadastro,
  OBSERVACOES_PADRAO,
  observacoesComDifal,
  FRETE_ABSORVIDO,
  labelFreteMod,
  labelTipoNf,
  labelFormaPagamento,
  novoEndereco,
  novoFaturamento,

  novoEstado,
  novoItem,
  parseMoeda,
  statusMB,
  type CarregadoresFinalidadeUso,
  type CarregadoresItem,
  type CarregadoresFreteMod,
  type CarregadoresState,
  textoDifalContribuinte,
  avisoDifalUsoConsumo,
  operacaoInterna,
  precoParaMargem,
} from "@/lib/carregadores";
import { ratearComissao, VALOR_INDICACAO, type Regime, type RateioLinha } from "@/lib/carregadores-comissao";
import { useAuth } from "@/hooks/use-auth";
import { registrarConclusao } from "@/lib/carregadores-conclusao-log";
import {
  salvarPropostaCarregadores,
  atribuirNumeroSapFn,
  obterPropostaFn,
  concluirPropostaFn,
} from "@/lib/propostas.functions";


import { buildPropostaPdfHtml } from "@/lib/carregadores-proposta-pdf";
import { MoneyInput } from "@/components/money-input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

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
  component: PropostaCarregadoresPage,
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
  /** Finalidade de uso definida no cadastro do cliente (fonte única de verdade). */
  finalidade?: string | null;
  regime_tributario?: string | null;
  cliente_updated_at: string | null;
  consultor_nome: string | null;
  /** Endereço do cadastro — base do frete quando a entrega não é diferente. */
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
};



const DRAFT_KEY = "carregadores-proposta-rascunho";

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


function PropostaCarregadoresPage() {
  const { id: editId, dup: dupId } = Route.useSearch();
  const carregandoExistente = !!(editId || dupId);
  const produtosQ = useCarregadoresProducts();
  const ufsQ = useCarregadoresUfs();
  const configQ = useCarregadoresConfig();
  const ncmsQ = useCarregadoresNcms();
  const invalidate = useCarregadoresInvalidate();

  const produtos = useMemo(() => (produtosQ.data ?? []).filter((p) => p.ativo), [produtosQ.data]);
  const fotosQ = useImagensPorPath(produtos.map((p) => p.imagem_path));
  const fotoDoProduto = (produtoId?: string) => {
    const path = produtos.find((p) => p.id === produtoId)?.imagem_path;
    return path ? (fotosQ.data ?? {})[path] : undefined;
  };
  const ufs = ufsQ.data ?? [];
  const config = configQ.data ?? CARREGADORES_CONFIG_FALLBACK;

  // Nova proposta sempre começa vazia; só carrega dados ao editar/duplicar uma proposta salva.
  const [state, setState] = useState<CarregadoresState>(() => novoEstado());
  // Itens cujo valor unitário acabou de ser atualizado pelo Preço Sugerido.
  const [precoChanges, setPrecoChanges] = useState<Record<string, { de: number; para: number }>>({});

  const [openCli, setOpenCli] = useState(false);
  const [etapa, setEtapa] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [tentouAvancar, setTentouAvancar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [propostaId, setPropostaId] = useState<string | null>(editId ?? null);
  const [numeroAtual, setNumeroAtual] = useState<string | null>(null);
  const [autosaveAt, setAutosaveAt] = useState<Date | null>(null);
  const [revisao, setRevisao] = useState<null | "concluir">(null);
  const [confirmarConclusao, setConfirmarConclusao] = useState(false);
  const [previewAberto, setPreviewAberto] = useState(false);
  const [usarLogoCliente, setUsarLogoCliente] = useState(true);
  // Consultor da proposta: vem do cadastro do cliente e é congelado ao salvar.
  const [consultorProposta, setConsultorProposta] = useState<string | null>(null);

  const { profile } = useAuth();
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
      const data = await obterPropostaFn({ data: { id: alvo } }).catch(() => null);
      if (!data) {
        toast.error("Não foi possível carregar a proposta.");
        return;
      }
      const itens = (
        (data.itens as { produtoId?: string; qtd?: number; valor?: number; valorManual?: boolean }[]) ?? []
      )
        .filter((i) => i.produtoId)
        .map((i) => {
          const valor = money2(i.valor ?? 0);
          return {
            key: Math.random().toString(36).slice(2),
            produtoId: i.produtoId as string,
            qtd: Number(i.qtd ?? 1),
            valor,
            // Sem valor salvo => não é um preço definido pelo vendedor,
            // então pode ser pré-preenchido com o Preço Sugerido do produto.
            valorManual: i.valorManual ?? valor > 0,
          };
        });

      setState({
        propostaNome: ((data as any).nome as string | null) ?? "",
        numeroSap: dupId ? "" : (((data as any).numero_sap as string | null) ?? ""),
        nome: dupId ? `${data.cliente_nome}` : data.cliente_nome,

        telefone: data.cliente_telefone ?? "",
        email: data.cliente_email ?? "",
        doc: data.cliente_doc ?? "",
        ie: data.cliente_ie ?? "",
        uf: data.uf,
        contribuinte: data.contribuinte,
        finalidadeUso: ((data.finalidade_uso as CarregadoresState["finalidadeUso"]) ?? "uso_consumo"),
        indicacao: !!(data as any).indicacao,
        padrinhoId: ((data as any).padrinho_id as string | null) ?? null,
        padrinhoNome: ((data as any).padrinho_nome as string | null) ?? "",
        previsaoFechamento: ((data as any).previsao_fechamento as string | null) ?? "",
        tipoNf: (((data as any).tipo_nf as string | null) ?? "venda") as CarregadoresState["tipoNf"],
        faturarClienteFinal: (data as any).faturar_cliente_final === true,
        faturamento: {
          ...novoFaturamento(data.uf),
          ...(((data as any).faturamento as Record<string, string | boolean>) ?? {}),
        } as CarregadoresState["faturamento"],
        formaPagamento: (((data as any).forma_pagamento as string | null) ?? "") as CarregadoresState["formaPagamento"],
        entregaDiferente: !!(data as any).entrega_diferente,
        entrega: { ...novoEndereco(data.uf), ...(((data as any).entrega as Record<string, string>) ?? {}) },
        freteMod: (data.frete_mod === "FOB" || data.frete_mod === "DEDICADO" || data.frete_mod === "CIF"
          ? data.frete_mod
          : "") as CarregadoresState["freteMod"],
        freteAreaRural: !!(data as any).frete_area_rural,
        freteValor: money2(data.frete_valor ?? 0),
        transportadora: (data as any).transportadora
          ? {
              id: ((data as any).transportadora_id as string | null) ?? "",
              nome: (data as any).transportadora as string,
              documento: ((data as any).transportadora_documento as string | null) ?? "",
              total: money2(data.frete_valor ?? 0),
              prazo: Number((data as any).frete_prazo ?? 0),
            }
          : null,

        observacoes: (data.observacoes as string | null) ?? OBSERVACOES_PADRAO,
        itens: itens.length ? itens : [novoItem()],
      });
      setConsultorProposta(((data as any).consultor_nome as string | null) ?? null);
      setNumeroAtual(editId ? data.numero : null);
      setPropostaUpdatedAt((data.updated_at as string) ?? null);
      setAutosaveAt(data.updated_at ? new Date(data.updated_at as string) : null);
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
  const salvarProposta = useServerFn(salvarPropostaCarregadores);
  const atribuirNumeroSap = useServerFn(atribuirNumeroSapFn);
  const clientesQ = useQuery({
    queryKey: ["carregadores-clientes-cadastro"],
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
          finalidade: (c["finalidade"] as string) ?? null,
          regime_tributario: (c["regime_tributario"] as string) ?? null,
          cliente_updated_at: (c["updated_at"] as string) ?? null,
          consultor_nome: (c["created_by_nome"] as string) ?? null,
          cep: (c["cep"] as string) ?? "",
          logradouro: (c["logradouro"] as string) ?? "",
          numero: (c["numero"] as string) ?? "",
          complemento: (c["complemento"] as string) ?? "",
          bairro: (c["bairro"] as string) ?? "",
          cidade: (c["cidade"] as string) ?? "",

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
      atual.contribuinte !== state.contribuinte ||
      finalidadeUsoDoCadastro(atual.finalidade) !== state.finalidadeUso;
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
      finalidadeUso: finalidadeUsoDoCadastro(atual.finalidade),
      regimeTributario: atual.regime_tributario ?? s.regimeTributario ?? null,
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



  const aplicarCliente = (c: ClienteCadastro) => {
    if (!editId) setConsultorProposta(c.consultor_nome ?? null);
    setState((s) => ({
      ...s,
      nome: c.cliente_nome,
      telefone: c.cliente_telefone ?? "",
      email: c.cliente_email ?? "",
      doc: c.cliente_doc ?? "",
      ie: c.cliente_ie ?? "",
      uf: c.uf || s.uf,
      contribuinte: c.contribuinte ?? s.contribuinte,
      // Finalidade de uso nunca é escolhida na proposta: vem sempre do cadastro.
      finalidadeUso: finalidadeUsoDoCadastro(c.finalidade),
      regimeTributario: c.regime_tributario ?? null,
      // Entrega parte do endereço do cadastro; o consultor ajusta se for diferente.
      entrega: s.entregaDiferente
        ? s.entrega
        : {
            ...s.entrega,
            cep: c.cep,
            logradouro: c.logradouro,
            numero: c.numero,
            complemento: c.complemento,
            bairro: c.bairro,
            cidade: c.cidade,
            uf: c.uf || s.uf,
            contato: s.entrega.contato,
            telefone: s.entrega.telefone || (c.cliente_telefone ?? ""),
          },
    }));
  };



  // Preço sugerido do item já considerando os impostos da operação, para que
  // a MB% da proposta nasça em 37% (e não abaixo da política de 33%).
  const precoSugeridoItem = (produtoId: string, s: CarregadoresState) =>
    money2(
      precoParaMargem(
        produtos.find((p) => p.id === produtoId),
        s,
        ufs,
        config,
        ncmsQ.data ?? [],
      ),
    );


  const set = <K extends keyof CarregadoresState>(k: K, v: CarregadoresState[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  /** Atualiza campos do endereço de entrega. */
  const setEntrega = (patch: Partial<CarregadoresState["entrega"]>) =>
    setState((s) => ({ ...s, entrega: { ...s.entrega, ...patch } }));

  /** Atualiza os dados do destinatário fiscal alternativo. */
  const setFaturamento = (patch: Partial<CarregadoresState["faturamento"]>) =>
    setState((s) => ({ ...s, faturamento: { ...s.faturamento, ...patch } }));

  /** Entrega precisa ficar no mesmo estado do faturamento. */
  const entregaUfInvalida =
    state.entregaDiferente &&
    !!state.entrega.uf.trim() &&
    state.entrega.uf.trim().toUpperCase() !== state.uf.trim().toUpperCase();

  /**
   * Endereço padrão de entrega — sempre o do cadastro do cliente. Enquanto a
   * opção de endereço alternativo estiver desativada, é ele que é persistido
   * e usado na cotação do frete.
   */
  const enderecoPadraoCliente = useMemo(() => {
    const soDigitos = (v?: string | null) => (v ?? "").replace(/\D/g, "");
    const c = (clientesQ.data ?? []).find(
      (x) => soDigitos(x.cliente_doc) && soDigitos(x.cliente_doc) === soDigitos(state.doc),
    );
    if (!c) return null;
    return {
      cep: c.cep ?? "",
      logradouro: c.logradouro ?? "",
      numero: c.numero ?? "",
      complemento: c.complemento ?? "",
      bairro: c.bairro ?? "",
      cidade: c.cidade ?? "",
      uf: c.uf || state.uf,
      contato: "",
      telefone: c.cliente_telefone ?? "",
    } satisfies CarregadoresState["entrega"];
  }, [clientesQ.data, state.doc, state.uf]);

  /** Endereço que efetivamente vale para a proposta. */
  const entregaEfetiva: CarregadoresState["entrega"] = state.entregaDiferente
    ? state.entrega
    : (enderecoPadraoCliente ?? { ...state.entrega, uf: state.entrega.uf || state.uf });

  /** Endereço efetivo de entrega — base da cotação de frete. */
  const destinoFrete = {
    uf: entregaEfetiva.uf || state.uf,
    cidade: entregaEfetiva.cidade,
    cep: entregaEfetiva.cep,
  };

  /**
   * Endereço/destinatário fiscal efetivo: quando a nota é emitida para outro
   * destinatário, valem os dados de faturamento; senão, o cadastro do cliente.
   */
  const faturamentoEfetivo = state.faturarClienteFinal
    ? {
        ...state.faturamento,
        nome: state.faturamento.nome || state.nome,
      }
    : {
        nome: state.nome,
        doc: state.doc,
        ie: state.ie,
        ...(enderecoPadraoCliente ?? novoEndereco(state.uf)),
      };

  /** Formata um endereço em linhas legíveis (usado no resumo e no PDF). */
  const linhasEndereco = (e: {
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
  }) =>
    [
      [e.logradouro, e.numero].filter(Boolean).join(", "),
      [e.complemento, e.bairro].filter(Boolean).join(" · "),
      [[e.cidade, e.uf || state.uf].filter(Boolean).join(" / "), e.cep].filter(Boolean).join(" · "),
    ].filter((l) => l && l.trim());


  const setItem = (key: string, patch: Partial<CarregadoresItem>) =>
    setState((s) => ({
      ...s,
      itens: s.itens.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    }));

  // Mantém o valor unitário sincronizado com o Preço Sugerido do produto
  // enquanto o vendedor não definir um valor manualmente. Reage a mudanças do
  // preço sugerido (catálogo) e recalcula os totais automaticamente.
  useEffect(() => {
    if (!produtos.length) return;
    const mudancas: Record<string, { de: number; para: number }> = {};
    setState((s) => {
      let mudou = false;
      const itens = s.itens.map((i) => {
        if (!i.produtoId) return i;
        const sugerido = precoSugeridoItem(i.produtoId, s);
        if (!(sugerido > 0) || sugerido === i.valor) return i;
        // Só substitui quando o item não tem preço manual e o valor atual está
        // vazio ou veio de uma aplicação anterior do preço sugerido.
        const podeAplicar =
          !i.valorManual && (!(i.valor > 0) || i.sugeridoAplicado === i.valor);
        if (!podeAplicar) return i;
        mudou = true;
        if (i.valor > 0) mudancas[i.key] = { de: i.valor, para: sugerido };
        return { ...i, valor: sugerido, sugeridoAplicado: sugerido };
      });
      return mudou ? { ...s, itens } : s;
    });
    if (Object.keys(mudancas).length) {
      setPrecoChanges((p) => ({ ...p, ...mudancas }));
      window.setTimeout(() => setPrecoChanges({}), 8000);
    }
  }, [produtos, ufs, config, ncmsQ.data, state.uf, state.contribuinte, state.ie, state.finalidadeUso, state.regimeTributario]);




  // O recálculo fiscal é caro: enquanto o vendedor digita valores/quantidades,
  // ele roda com um pequeno atraso, evitando re-render a cada tecla. Ações que
  // gravam dados (salvar/concluir/PDF) usam `calcAtual()`, sempre com o estado atual.
  const stateCalc = useDebouncedValue(state, 200);
  const calcAtual = () => calcularCarregadores(state, produtosQ.data ?? [], ufs, config, ncmsQ.data ?? []);
  const d = useMemo(
    () => calcularCarregadores(stateCalc, produtosQ.data ?? [], ufs, config, ncmsQ.data ?? []),
    [stateCalc, produtosQ.data, ufs, config, ncmsQ.data],
  );
  // A comissão exibida é a REMUNERAÇÃO do vendedor (não o custo total da empresa).
  // O regime vem do cadastro do usuário: PJ recebe o custo cheio, CLT recebe custo ÷ fator.
  const regimeVendedor: Regime = profile?.regime_contratacao === "PJ" ? "PJ" : "CLT";
  const comissaoVendedor = useMemo(() => {
    const rateio = ratearComissao({
      venda: d.valorItens,
      comissaoTotal: d.comValor,
      cmv: d.cmv,
      regimeVendedor,
      comIndicacao: state.indicacao,
      params: {
        cmvMax: config.cmv_max,
        pctGerente: config.pct_gerente,
        pctRepresentante: config.pct_representante,
        valorIndicacao: VALOR_INDICACAO,
        fatorClt: config.fator_clt,
      },
    });
    const linha = rateio.linhas.find((l: RateioLinha) => l.key === "vendedor");
    return {
      valor: linha?.remuneracao ?? 0,
      pct: linha?.pctRemuneracao ?? 0,
      custo: rateio.custoVendedor,
      total: rateio.comissaoTotal,
    };
  }, [d.valorItens, d.comValor, d.cmv, regimeVendedor, config, state.indicacao]);

  const st = statusMB(d.mbPct, config);

  const avisoUsoConsumo = avisoDifalUsoConsumo(state);
  const observacoesFinal = [observacoesComDifal(state.observacoes, state), avisoUsoConsumo]
    .filter(Boolean)
    .join("\n\n");
  const uf = ufs.find((u) => u.uf === state.uf);
  const temItemComValor = state.itens.some((i) => i.produtoId && i.valor > 0);
  const abaixoPolitica = d.mbPct < config.politica_mb_min;
  const erroFreteMsg = !state.freteMod
    ? "Selecione a modalidade de frete."
    : state.freteMod === "CIF" && !state.transportadora
      ? "Cotação de frete pendente — calcule e selecione a transportadora."
      : state.freteMod === "CIF" && !(state.freteValor > 0)
        ? "Frete CIF sem valor calculado — refaça a cotação."
        : state.freteMod === "DEDICADO" && !(state.freteValor > 0)
          ? "Informe o valor do frete dedicado."
          : null;
  const freteInvalido = !!erroFreteMsg;
  // ---- Validação da etapa 1 (identificação) e etapa 2 (faturamento) ----
  const soDigitos = (v: string) => (v || "").replace(/\D/g, "");
  const errosIdentificacao: { campo: string; msg: string }[] = [];
  if (!state.propostaNome.trim())
    errosIdentificacao.push({ campo: "propostaNome", msg: "Informe o nome da proposta." });
  if (!state.nome.trim()) errosIdentificacao.push({ campo: "nome", msg: "Selecione um cliente." });
  const docDigits = soDigitos(state.doc);
  if (!docDigits) errosIdentificacao.push({ campo: "doc", msg: "CNPJ/CPF não informado no cadastro do cliente." });
  else if (docDigits.length !== 11 && docDigits.length !== 14)
    errosIdentificacao.push({ campo: "doc", msg: "CNPJ/CPF inválido (11 ou 14 dígitos)." });
  if (!state.uf) errosIdentificacao.push({ campo: "uf", msg: "UF de destino não informada." });
  else if (!ufs.some((u) => u.uf === state.uf))
    errosIdentificacao.push({ campo: "uf", msg: "UF sem alíquota cadastrada." });
  if (state.contribuinte && !state.ie.trim())
    errosIdentificacao.push({ campo: "ie", msg: "Cliente contribuinte precisa de Inscrição Estadual." });
  if (state.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(state.email.trim()))
    errosIdentificacao.push({ campo: "email", msg: "E-mail do cliente é inválido." });

  if (state.indicacao && !state.padrinhoId)
    errosIdentificacao.push({ campo: "padrinho", msg: "Selecione ou cadastre o padrinho da indicação." });

  // Faturamento para terceiro: o destinatário fiscal precisa ser informado por completo.
  const errosFaturamento: { campo: string; msg: string }[] = [];
  if (state.faturarClienteFinal) {
    const fatDoc = soDigitos(state.faturamento.doc);
    if (!state.faturamento.nome.trim())
      errosFaturamento.push({ campo: "fat_nome", msg: "Informe o cliente do faturamento." });
    if (fatDoc.length !== 11 && fatDoc.length !== 14)
      errosFaturamento.push({ campo: "fat_doc", msg: "CNPJ/CPF do faturamento inválido." });
    if (state.faturamento.contribuinte && !state.faturamento.ie.trim())
      errosFaturamento.push({ campo: "fat_ie", msg: "Faturamento contribuinte precisa de Inscrição Estadual." });
    if (!state.faturamento.logradouro.trim() || !state.faturamento.cidade.trim())
      errosFaturamento.push({ campo: "fat_end", msg: "Informe o endereço de faturamento." });
    if (state.faturamento.uf.trim().toUpperCase() !== state.uf.trim().toUpperCase())
      errosFaturamento.push({ campo: "fat_uf", msg: "O faturamento deve estar no mesmo estado da operação." });
  }

  const errosCliente = [...errosIdentificacao, ...errosFaturamento];

  const identificacaoOk = errosIdentificacao.length === 0;
  const clienteOk = errosCliente.length === 0;
  // Só sinalizamos campos em vermelho depois que o usuário tenta avançar.
  const campoInvalido = (c: string) => tentouAvancar && errosCliente.some((e) => e.campo === c);
  const temProduto = state.itens.some((i) => i.produtoId);
  const podeSalvar = clienteOk && temProduto && !abaixoPolitica && !d.cmvExcedido;


  function irParaEtapa(alvo: 1 | 2 | 3 | 4 | 5) {
    if (alvo === 1) return setEtapa(1);
    if (!identificacaoOk) {
      setTentouAvancar(true);
      toast.error(errosIdentificacao[0]?.msg ?? "Preencha os dados obrigatórios do cliente.");
      return;
    }
    if (alvo >= 3 && !clienteOk) {
      setTentouAvancar(true);
      toast.error(errosFaturamento[0]?.msg ?? "Complete os dados de faturamento.");
      return;
    }
    if (alvo >= 4 && !temProduto) {
      setTentouAvancar(true);
      toast.error("Adicione ao menos um produto à proposta.");
      return;
    }
    // Após produtos cadastrados, MB abaixo da política mínima bloqueia qualquer avanço.
    if (alvo >= 4 && temProduto && abaixoPolitica) {
      setTentouAvancar(true);
      toast.error(`Margem bruta abaixo da política mínima (${fmtPct(config.politica_mb_min)}). Ajuste os valores para avançar.`);
      return;
    }
    // Etapa 4 → 5: o frete precisa estar definido e calculado conforme a modalidade.
    if (alvo >= 5 && erroFreteMsg) {
      setTentouAvancar(true);
      setEtapa(4);
      toast.error(erroFreteMsg);
      return;
    }
    setEtapa(alvo);
  }


  function avancarEtapa() {
    if (etapa < 5) irParaEtapa((etapa + 1) as 2 | 3 | 4 | 5);
  }

  function voltarEtapa() {
    if (etapa > 1) setEtapa((etapa - 1) as 1 | 2 | 3 | 4);
  }


  // ---- Alertas automáticos de política ----

  const itensSemValor = state.itens.filter((i) => i.produtoId && !(i.valor > 0));
  const itensSemQtd = state.itens.filter((i) => i.produtoId && !(i.qtd > 0));
  const itensSemProduto = state.itens.filter((i) => !i.produtoId && i.valor > 0);

  // ---- Bloqueios de fechamento (exportar PDF / concluir pedido) ----
  const errosPdf: string[] = [];
  if (!state.propostaNome.trim()) errosPdf.push("Informe o nome da proposta.");
  if (!clienteOk) errosPdf.push(errosCliente[0]?.msg ?? "Complete os dados do cliente.");
  if (!temProduto) errosPdf.push("Adicione ao menos um produto à proposta.");
  if (itensSemProduto.length)
    errosPdf.push(`${itensSemProduto.length} linha(ns) sem produto selecionado.`);
  if (itensSemValor.length)
    errosPdf.push(`${itensSemValor.length} item(ns) sem valor unitário.`);
  if (itensSemQtd.length)
    errosPdf.push(`${itensSemQtd.length} item(ns) sem quantidade informada.`);
  if (!state.freteMod) errosPdf.push("Selecione a modalidade de frete.");
  if (state.freteMod === "CIF" && !state.transportadora)
    errosPdf.push("Cotação de frete pendente — selecione a transportadora.");
  if (state.freteMod === "DEDICADO" && !(state.freteValor > 0))
    errosPdf.push("Frete dedicado sem valor informado — necessário para fechar os totais.");

  if (temProduto && !(d.valorTotalProposta > 0))
    errosPdf.push("Total da proposta zerado — revise valores e quantidades.");
  if (temProduto && abaixoPolitica) errosPdf.push(`Margem bruta abaixo da política (${fmtPct(config.politica_mb_min)}).`);
  if (temProduto && d.cmvExcedido)
    errosPdf.push(`CMV de ${fmtPct(d.cmv)} acima do limite de ${fmtPct(config.cmv_max)} — exige aprovação da diretoria.`);

  // Conclusão do pedido exige forma de pagamento; PDF não exige.
  const errosConclusao: string[] = [...errosPdf];
  if (!state.formaPagamento) errosConclusao.push("Selecione a forma de pagamento.");
  const podeFechar = errosConclusao.length === 0;

  // ---- Bloqueios de salvamento ----
  const errosSalvar: string[] = [];
  if (!state.propostaNome.trim()) errosSalvar.push("Informe o nome da proposta.");
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
  if (state.freteMod && FRETE_ABSORVIDO.includes(state.freteMod as CarregadoresFreteMod) && !(state.freteValor > 0))
    alertas.push({
      level: "warn",
      titulo: `Frete ${state.freteMod} sem valor informado`,
      motivo: "Nessa modalidade a 2P absorve o frete; sem valor a margem fica superestimada.",
      corrigir:
        state.freteMod === "CIF"
          ? "Cote o frete na etapa de entrega e selecione a transportadora."
          : "Preencha o campo Valor do frete.",
    });

  if (!state.contribuinte && !operacaoInterna(state.uf) && d.difalAbs > 0 && abaixoPolitica)
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
    if (!podeFechar) return toast.error(errosConclusao[0] ?? "Complete a proposta antes de concluir o pedido.");
    setStatusProposta("Aguardando Pagamento");
    setSaving(true);
    void salvar("Aguardando Pagamento");
  }

  function iniciarConclusao() {
    setStatusProposta("Aguardando Pagamento");
    setConfirmarConclusao(true);
  }

  // Salva a proposta sem pop-up: valida e dispara o salvamento direto.
  function pedirSalvar() {
    if (errosSalvar.length) {
      setTentouAvancar(true);
      if (etapa === 1 && !clienteOk) setEtapa(1);
      toast.error(errosSalvar[0], {
        description: errosSalvar.length > 1 ? `+ ${errosSalvar.length - 1} pendência(s) a corrigir.` : undefined,
      });
      return;
    }
    void salvar();
  }

  // Abre a revisão final apenas para concluir o pedido.
  function pedirRevisao(acao: "concluir") {
    if (errosConclusao.length) {
      setTentouAvancar(true);
      if (etapa === 1 && !clienteOk) setEtapa(1);
      toast.error(errosConclusao[0], {
        description: errosConclusao.length > 1 ? `+ ${errosConclusao.length - 1} pendência(s) a corrigir.` : undefined,
      });
      return;
    }
    setRevisao(acao);
  }

  function confirmarRevisao() {
    setRevisao(null);
    concluirPedido();
  }


  // Finalidade de uso do PDF: sempre a do cadastro atual do cliente (nunca
  // editável na proposta). Só cai no estado quando o cadastro não foi achado.
  const finalidadeUsoPdf = (() => {
    const soDigitos = (v?: string | null) => (v ?? "").replace(/\D/g, "");
    const atual = (clientesQ.data ?? []).find(
      (c) =>
        (soDigitos(c.cliente_doc) && soDigitos(c.cliente_doc) === soDigitos(state.doc)) ||
        c.cliente_nome.trim().toLowerCase() === state.nome.trim().toLowerCase(),
    );
    const chave = atual ? finalidadeUsoDoCadastro(atual.finalidade) : state.finalidadeUso;
    return labelFinalidadeUso[chave] ?? null;
  })();

  // HTML do PDF derivado do estado atual: qualquer mudança em itens, frete,
  // impostos, margem ou comissão reflete imediatamente na prévia e no download.
  const buildHtml = (d: ReturnType<typeof calcularCarregadores>) =>
      buildPropostaPdfHtml({
        numero: numeroAtual ?? numeroRef.current ?? undefined,
        propostaNome: state.propostaNome.trim() || null,
        numeroSap: state.numeroSap.trim() || null,
        cliente: {
          nome: state.nome,
          nomeFantasia: state.nome,
          doc: state.doc,
          ie: state.ie,
          email: state.email,
          telefone: state.telefone,
          uf: state.uf,
          cidade: faturamentoEfetivo.cidade || entregaEfetiva.cidade || null,
          contribuinte: state.contribuinte,
        },
        finalidadeUso: finalidadeUsoPdf,
        enderecoFaturamento: {
          nome: faturamentoEfetivo.nome || state.nome,
          doc: faturamentoEfetivo.doc || state.doc,
          ie: faturamentoEfetivo.ie || state.ie,
          linhas: linhasEndereco(faturamentoEfetivo),
        },
        enderecoEntrega: {
          contato: entregaEfetiva.contato || null,
          telefone: entregaEfetiva.telefone || null,
          linhas: linhasEndereco(entregaEfetiva),
        },

        itens: state.itens
          .filter((i) => i.produtoId)
          .map((i) => {
            const prod = produtos.find((p) => p.id === i.produtoId);
            const ncm =
              prod?.ncm_codigo ??
              (ncmsQ.data ?? []).find((n) => n.id === prod?.ncm_id)?.codigo ??
              null;
            return {
              codigo: prod?.codigo ?? null,
              nome: prod?.nome ?? "",
              ncm,
              foto: fotoDoProduto(i.produtoId) ?? null,
              qtd: i.qtd,
              valor: i.valor,
            };

          }),
        freteMod: state.freteMod || "—",
        freteValor: state.freteValor,
        observacoes: observacoesFinal,
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
        consultor: consultorProposta ?? undefined,
        formaPagamento: state.formaPagamento || null,
      });

  const pdfHtml = useMemo(
    () => buildHtml(d),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, produtos, config, d, usarLogoCliente, logoCliente, observacoesFinal, consultorProposta, enderecoPadraoCliente],
  );

  function montarPdfHtml() {
    return buildHtml(calcAtual());
  }

  function abrirPreviewPdf() {
    if (errosPdf.length) return toast.error(errosPdf[0] ?? "Complete a proposta antes de visualizar o PDF.");
    setPreviewAberto(true);
  }

  function exportarPdf() {
    if (errosPdf.length) return toast.error(errosPdf[0] ?? "Complete a proposta antes de exportar o PDF.");
    const html = montarPdfHtml();
    const w = window.open("", "_blank");
    if (!w) return toast.error("Permita pop-ups para exportar o PDF.");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  }

  // Aviso sobre a cobrança emitida no checkout (boleto à vista / Pix).
  function avisarCobranca(c?: { gerada?: boolean; meio?: string | null; motivo?: string | null; erro?: string | null } | null) {
    if (!c) return;
    if (c.gerada) {
      toast.success(c.meio === "pix" ? "Cobrança Pix gerada." : "Boleto emitido (vencimento em 5 dias).");
      return;
    }
    if (c.erro) {
      toast.error("Não foi possível emitir a cobrança. Entre em contato com o suporte.");
      return;
    }
    if (c.motivo) toast.info(c.motivo);
  }

  /** Retorno da criação da ordem de venda no SAP (ZNFE_OV_CRIAR). */
  function avisarSapOv(r?: { ok?: boolean; vbeln?: string | null; mensagem?: string | null; motivo?: string | null } | null) {
    if (!r) return;
    if (r.ok && r.vbeln) {
      toast.success(`Ordem de venda ${r.vbeln} criada no SAP.`);
      return;
    }
    if (r.motivo === "nao_configurado") return;
    toast.error(r.mensagem ?? "Não foi possível criar a ordem de venda no SAP. O pedido foi salvo e pode ser reenviado.");
  }

  async function salvar(status: string = "Salvo") {
    // Lock síncrono: bloqueia envios repetidos mesmo antes do estado re-renderizar
    if (submitLock.current) return;
    if (!state.nome.trim()) return toast.error("Informe o nome do cliente.");
    if (!state.itens.some((i) => i.produtoId)) return toast.error("Adicione ao menos um produto.");
    if (abaixoPolitica) return toast.error("MB% abaixo da política mínima.");
    const dNow = calcAtual();
    if (dNow.cmvExcedido)
      return toast.error(`CMV de ${fmtPct(dNow.cmv)} acima do limite de ${fmtPct(config.cmv_max)}. Necessária aprovação especial da diretoria.`);
    submitLock.current = true;
    // Quem chama concluirPedido já setou saving e status; evita piscar
    if (!saving) setSaving(true);
    try {
      // O número da proposta é sequencial e gerado no servidor (a partir de 050000).
      // O backend recalcula e revalida todos os totais (fiscais, MB% e comissão)
      // a partir do catálogo/alíquotas vigentes — a UI só envia os insumos.
      const salvo = await salvarProposta({
        data: {
          propostaId,
          numero: numeroAtual ?? "",
          propostaNome: state.propostaNome.trim() || null,
          numeroSap: null,


          cliente: {
            nome: state.nome,
            telefone: state.telefone,
            email: state.email,
            doc: state.doc,
            ie: state.ie,
          },
          uf: state.uf,
          contribuinte: state.contribuinte,
          regimeTributario: state.regimeTributario ?? null,
          finalidadeUso: state.finalidadeUso,
          indicacao: state.indicacao,
          padrinhoId: state.indicacao ? state.padrinhoId : null,
          previsaoFechamento: state.previsaoFechamento || null,
          tipoNf: state.tipoNf,
          faturarClienteFinal: state.faturarClienteFinal,
          faturamento: state.faturamento as unknown as Record<string, string | boolean>,
          formaPagamento: state.formaPagamento || null,
          entregaDiferente: state.entregaDiferente,
          entrega: entregaEfetiva,
          freteMod: state.freteMod,
          freteAreaRural: state.freteMod === "CIF" ? state.freteAreaRural : false,
          freteValor: state.freteMod === "FOB" || !state.freteMod ? 0 : money2(state.freteValor),
          transportadora: state.freteMod === "FOB" || !state.freteMod ? null : state.transportadora,

          observacoes: observacoesFinal.trim() || null,
          itens: state.itens
            .filter((i) => i.produtoId)
            .map((i) => ({ produtoId: i.produtoId, qtd: i.qtd, valor: money2(i.valor) })),
        },
      });

      // Número definitivo: sempre o que o servidor gravou.
      const numero = (salvo as { numero?: string | null }).numero ?? numeroAtual ?? "";
      numeroRef.current = numero || null;

      if ((salvo as { consultor?: string | null }).consultor) {
        setConsultorProposta((salvo as { consultor?: string | null }).consultor ?? null);
      }
      const sapRetornado = (salvo as { numeroSap?: string | null }).numeroSap;
      if (sapRetornado) {
        setState((s) => ({ ...s, numeroSap: sapRetornado }));
      }

      if (propostaId) {
        const concluindo = status !== "Salvo";
        let cobrancaAviso: Parameters<typeof avisarCobranca>[0] = null;
        if (concluindo) {
          // Lock idempotente no banco: só conclui se ainda estiver "Salvo"
          // O servidor valida a etapa de finalização como 4 (última etapa do fluxo).
          const linha = await concluirPropostaFn({
            data: { id: propostaId, status, origem: "portal", etapa: etapa === 5 ? 4 : etapa },
          });
          if (linha?.already_concluded) {
            toast.info(`Pedido ${numero} já havia sido concluído (${linha.status}).`);
            invalidate();
            return;
          }
          cobrancaAviso = (linha as { cobranca?: Parameters<typeof avisarCobranca>[0] }).cobranca ?? null;
          avisarSapOv((linha as { sapOv?: Parameters<typeof avisarSapOv>[0] }).sapOv ?? null);
          // Nº SAP só existe após a conclusão.
          try {
            const { numeroSap } = await atribuirNumeroSap({ data: { propostaId } });
            if (numeroSap) setState((s) => ({ ...s, numeroSap }));
          } catch {
            /* o número pode ser atribuído depois; não bloqueia a conclusão */
          }
        }


        toast.success(concluindo ? `Pedido ${numero} concluído.` : `Proposta ${numero} atualizada.`);
        if (concluindo) avisarCobranca(cobrancaAviso);
        setNumeroAtual(numero);
        invalidate();
        limparRascunho();
        setAutosaveAt(status === "Salvo" ? new Date() : null);
        return;
      }

      // Sempre nasce como "Salvo": a conclusão passa obrigatoriamente pela
      // validação de etapa/completude no banco (concluir_proposta).
      const inserida = salvo.id ? { id: salvo.id } : null;
      if (salvo.duplicada) {
        if (status !== "Salvo") {
          void registrarConclusao({ numero, status, resultado: "duplicada", detalhe: "Reenvio com número já existente" });
        }
        toast.info(`Proposta ${numero} já registrada.`);
        invalidate();
        return;
      }

      if (status !== "Salvo") {
        if (!inserida?.id) throw new Error("Não foi possível concluir: proposta não localizada.");
        let linha: { status?: string; already_concluded?: boolean; cobranca?: { gerada?: boolean; meio?: string | null; motivo?: string | null; erro?: string | null } | null };
        try {
          linha = await concluirPropostaFn({
            data: { id: inserida.id, status, origem: "portal", etapa: etapa === 5 ? 4 : etapa },
          });
        } catch (e) {
          setPropostaId(inserida.id);
          setNumeroAtual(numero);
          throw e;
        }
        if (linha?.already_concluded) {
          toast.info(`Pedido ${numero} já havia sido concluído (${linha.status}).`);
          invalidate();
          return;
        }
        avisarCobranca(linha?.cobranca);
        avisarSapOv((linha as { sapOv?: Parameters<typeof avisarSapOv>[0] })?.sapOv ?? null);
        try {
          const { numeroSap } = await atribuirNumeroSap({ data: { propostaId: inserida.id } });
          if (numeroSap) setState((s) => ({ ...s, numeroSap }));
        } catch {
          /* o número pode ser atribuído depois; não bloqueia a conclusão */
        }
      }

      toast.success(
        status === "Salvo" ? `Proposta ${numero} salva.` : `Pedido ${numero} concluído.`,
      );
      invalidate();
      limparRascunho();
      setAutosaveAt(status === "Salvo" ? new Date() : null);
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
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{
                  backgroundColor: propostaStatusStyle(statusProposta).bg,
                  color: propostaStatusStyle(statusProposta).fg,
                }}
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
            <div className="flex items-center gap-1.5 sm:gap-2 text-sm overflow-x-auto no-scrollbar -mx-1 px-1 flex-nowrap">
              {[
                { n: 1 as const, label: "Identificação", go: () => setEtapa(1) },
                { n: 2 as const, label: "Faturamento", go: () => irParaEtapa(2) },
                { n: 3 as const, label: "Produtos", go: () => irParaEtapa(3) },
                { n: 4 as const, label: "Entrega e frete", go: () => irParaEtapa(4) },
                { n: 5 as const, label: "Finalização", go: () => irParaEtapa(5) },
              ].map((s, i) => {
                const atual = etapa === s.n;
                const concluida = etapa > s.n;
                return (
                  <div key={s.n} className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    {i > 0 && <div className="h-px w-3 sm:w-6 bg-border" />}
                    <button
                      onClick={s.go}
                      aria-current={atual ? "step" : undefined}
                      className={cn(
                        "flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-full border transition-colors shrink-0",
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
                      <span className={cn("whitespace-nowrap", !atual && "hidden sm:inline")}>{s.label}</span>
                    </button>
                  </div>
                );
              })}
            </div>
            <span className="hidden sm:inline text-xs font-medium text-muted-foreground shrink-0">
              Etapa {etapa} de 5
            </span>
          </div>
          <div
            className="h-1.5 rounded-full bg-surface-2 overflow-hidden"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={5}
            aria-valuenow={etapa}
            aria-label={`Etapa ${etapa} de 5`}
          >
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(etapa / 5) * 100}%` }}
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
            etapa === 3 || etapa === 4
              ? "xl:grid-cols-[1.15fr_.85fr]"
              : etapa === 5
                ? "xl:grid-cols-[1fr_.45fr]"
                : "max-w-3xl",
          )}
        >
          {/* ENTRADAS */}
          <div className="glass rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                {etapa === 1
                  ? "Etapa 1 — Identificação"
                  : etapa === 2
                    ? "Etapa 2 — Faturamento"
                    : etapa === 3
                      ? "Etapa 3 — Produtos"
                      : etapa === 4
                        ? "Etapa 4 — Entrega e frete"
                        : "Etapa 5 — Finalização"}
              </h2>
            </div>

            {etapa === 1 && errosCliente.length > 0 && tentouAvancar ? (
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
            ) : null}

            {etapa === 1 ? (
              <>
                <Field label="Nome da proposta *">
                  <Input
                    value={state.propostaNome}
                    onChange={(e) => set("propostaNome", e.target.value)}
                    placeholder="Ex.: Eletroposto Matriz — 4 carregadores"
                    aria-invalid={campoInvalido("propostaNome")}
                    className={cn(campoInvalido("propostaNome") && "border-destructive/60")}
                  />
                  {campoInvalido("propostaNome") ? (
                    <p className="text-xs text-destructive">Campo obrigatório.</p>
                  ) : null}
                </Field>


                <Field label="Cliente">

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
                      <ReadField label="Consultor" value={consultorProposta || "—"} />
                      {/* Somente leitura: herdada do cadastro do cliente. */}
                      <ReadField
                        label="Finalidade de uso"
                        value={labelFinalidadeUso[state.finalidadeUso]}
                      />
                    </div>
                    <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
                      <b className="text-foreground">
                        {state.contribuinte ? "Cliente contribuinte do ICMS" : "Cliente não contribuinte do ICMS"}
                      </b>{" "}
                      <span className="text-muted-foreground">
                        {operacaoInterna(state.uf)
                          ? "Operação interna em SC: ICMS pela alíquota interna, sem DIFAL."
                          : state.contribuinte
                            ? "DIFAL por conta do destinatário."
                            : "DIFAL absorvido na venda."}
                      </span>
                    </div>
                  </div>
                ) : null}




                {state.nome ? (
                  <Field label="Previsão de fechamento (opcional)">
                    <Input
                      type="date"
                      value={state.previsaoFechamento}
                      onChange={(e) => set("previsaoFechamento", e.target.value)}
                    />
                  </Field>
                ) : null}

                {state.nome ? (
                  <PropostaIndicacao
                    indicacao={state.indicacao}
                    padrinhoId={state.padrinhoId}
                    padrinhoNome={state.padrinhoNome}
                    onChange={(v) =>
                      setState((s) => ({
                        ...s,
                        indicacao: v.indicacao,
                        padrinhoId: v.padrinhoId,
                        padrinhoNome: v.padrinhoNome,
                      }))
                    }
                  />
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

            {etapa === 2 ? (
              <>

                <Field label="Tipo de nota fiscal">
                  <Select value={state.tipoNf} onValueChange={(v) => set("tipoNf", v as CarregadoresState["tipoNf"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="venda">{labelTipoNf.venda}</SelectItem>
                      <SelectItem value="triangulacao">{labelTipoNf.triangulacao}</SelectItem>
                      <SelectItem value="bonificacao">{labelTipoNf.bonificacao}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Faturar para o cliente final?</p>
                      <p className="text-xs text-muted-foreground">
                        Marque apenas quando a nota for emitida para outro destinatário.
                      </p>
                    </div>
                    <Switch
                      checked={state.faturarClienteFinal}
                      onCheckedChange={(v) =>
                        setState((s) => ({
                          ...s,
                          faturarClienteFinal: v,
                          faturamento: v
                            ? { ...s.faturamento, uf: s.faturamento.uf || s.uf }
                            : s.faturamento,
                        }))
                      }
                    />
                  </div>

                  {state.faturarClienteFinal ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="CPF / CNPJ">
                        <Input
                          value={state.faturamento.doc}
                          className={cn(campoInvalido("fat_doc") && "border-destructive")}
                          onChange={(e) => setFaturamento({ doc: e.target.value })}
                        />
                      </Field>
                      <Field label="Cliente">
                        <Input
                          value={state.faturamento.nome}
                          className={cn(campoInvalido("fat_nome") && "border-destructive")}
                          onChange={(e) => setFaturamento({ nome: e.target.value })}
                        />
                      </Field>
                      <Field label="Inscrição Estadual">
                        <Input
                          value={state.faturamento.ie}
                          className={cn(campoInvalido("fat_ie") && "border-destructive")}
                          onChange={(e) => setFaturamento({ ie: e.target.value })}
                        />
                      </Field>
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                        <span className="text-xs">Contribuinte do ICMS?</span>
                        <Switch
                          checked={state.faturamento.contribuinte}
                          onCheckedChange={(v) => setFaturamento({ contribuinte: v })}
                        />
                      </div>
                      <Field label="CEP">
                        <CepInput
                          value={state.faturamento.cep}
                          onChange={(v) => setFaturamento({ cep: v })}
                          onFound={(e) =>
                            setFaturamento({
                              cep: e.cep,
                              logradouro: e.logradouro,
                              complemento: e.complemento || state.faturamento.complemento,
                              bairro: e.bairro,
                              cidade: e.cidade,
                              uf: e.uf,
                            })
                          }
                        />
                      </Field>
                      <Field label="Endereço">
                        <Input
                          value={state.faturamento.logradouro}
                          className={cn(campoInvalido("fat_end") && "border-destructive")}
                          onChange={(e) => setFaturamento({ logradouro: e.target.value })}
                        />
                      </Field>
                      <Field label="Número">
                        <Input
                          value={state.faturamento.numero}
                          onChange={(e) => setFaturamento({ numero: e.target.value })}
                        />
                      </Field>
                      <Field label="Complemento">
                        <Input
                          value={state.faturamento.complemento}
                          onChange={(e) => setFaturamento({ complemento: e.target.value })}
                        />
                      </Field>
                      <Field label="Bairro">
                        <Input
                          value={state.faturamento.bairro}
                          onChange={(e) => setFaturamento({ bairro: e.target.value })}
                        />
                      </Field>
                      <Field label="Cidade">
                        <Input
                          value={state.faturamento.cidade}
                          className={cn(campoInvalido("fat_end") && "border-destructive")}
                          onChange={(e) => setFaturamento({ cidade: e.target.value })}
                        />
                      </Field>
                      <Field label="Estado (UF)">
                        <Input
                          value={state.faturamento.uf}
                          maxLength={2}
                          className={cn(campoInvalido("fat_uf") && "border-destructive")}
                          onChange={(e) => setFaturamento({ uf: e.target.value.toUpperCase().slice(0, 2) })}
                        />
                      </Field>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}


            {etapa >= 3 ? (
              <>
            



            <div className="flex gap-2 items-start rounded-xl border border-border bg-surface-2 px-4 py-3 text-xs text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
              <div>
                {operacaoInterna(state.uf) ? (
                  <>
                    <b className="text-foreground">Operação interna (SC).</b> ICMS {fmtPct(d.inter)} · sem DIFAL —
                    venda dentro do estado de origem.
                  </>
                ) : state.finalidadeUso === "revenda" ? (
                  <>
                    <b className="text-foreground">Revenda.</b> ICMS origem {fmtPct(d.inter)} · DIFAL informativo{" "}
                    {fmtBRL(d.difalEstimado)} — não afeta a margem.
                  </>
                ) : state.finalidadeUso === "industrializacao" ? (
                  <>
                    <b className="text-foreground">Industrialização.</b> ICMS origem {fmtPct(d.inter)} · sem DIFAL.
                  </>
                ) : state.contribuinte ? (
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
            {etapa === 3 ? (
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
                    <div className="grid grid-cols-1 sm:grid-cols-[auto_1.5fr_.5fr] gap-3">
                      <div className="flex items-end">
                        <ProdutoFoto
                          url={fotoDoProduto(it.produtoId)}
                          alt={produtos.find((p) => p.id === it.produtoId)?.nome}
                          className="h-14 w-16"
                        />
                      </div>
                      <Field label="Produto">
                        <Select
                          value={it.produtoId}
                          disabled={!!it.produtoId}
                          onValueChange={(v) => {
                            const sugerido = precoSugeridoItem(v, state);
                            setItem(
                              it.key,
                              !it.valorManual && sugerido > 0
                                ? { produtoId: v, valor: sugerido, sugeridoAplicado: sugerido }
                                : { produtoId: v },
                            );
                          }}
                        >
                          <SelectTrigger
                            className={cn(
                              semProduto && "border-destructive focus-visible:ring-destructive",
                              it.produtoId && "disabled:opacity-100 disabled:cursor-not-allowed",
                            )}
                          >
                            <SelectValue placeholder="Selecione o produto" />
                          </SelectTrigger>
                          <SelectContent>
                            {produtos.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.codigo ? `${p.codigo} — ` : ""}
                                {p.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {it.produtoId ? (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Para trocar o produto, exclua o item e adicione outro.
                          </p>
                        ) : null}

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
                      {(() => {
                        const sugerido = precoSugeridoItem(it.produtoId, state);
                        const usandoSugerido =
                          !it.valorManual && sugerido > 0 && money2(it.valor) === sugerido;
                        const mudou = precoChanges[it.key];
                        return (
                      <Field label="Valor unitário (com IPI)">
                        <MoneyInput
                          value={it.valor}
                          placeholder="R$ 0,00"
                          maxValue={10000000}
                          className={cn(semValor && "border-destructive focus-visible:ring-destructive")}
                          onValueChange={(n: number) =>
                            // Zerar o campo volta a permitir o Preço Sugerido.
                            setItem(it.key, {
                              valor: n,
                              valorManual: n > 0,
                              sugeridoAplicado: undefined,
                            })
                          }
                        />
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                              usandoSugerido
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border bg-muted text-muted-foreground",
                            )}
                          >
                            {usandoSugerido ? "Preço Sugerido" : "Preço manual"}
                          </span>
                          {sugerido > 0 && !usandoSugerido ? (
                            <button
                              type="button"
                              className="text-[11px] text-primary underline underline-offset-2"
                              onClick={() =>
                                setItem(it.key, {
                                  valor: sugerido,
                                  valorManual: false,
                                  sugeridoAplicado: sugerido,
                                })
                              }
                            >
                              Usar sugerido ({fmtBRL(sugerido)})
                            </button>
                          ) : null}
                        </div>
                        {mudou ? (
                          <p className="text-[11px] text-primary mt-1">
                            Recalculado: {fmtBRL(mudou.de)} → {fmtBRL(mudou.para)}
                          </p>
                        ) : null}



                        {semValor ? (
                          <p className="text-[11px] text-destructive mt-1">Informe o valor unitário deste item.</p>
                        ) : null}
                      </Field>
                        );
                      })()}


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
                              itens:
                                s.itens.length > 1
                                  ? s.itens.filter((x) => x.key !== it.key)
                                  : [novoItem()],
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

            {etapa === 4 ? (
            <>
            <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 space-y-3">
              <div>
                <p className="text-sm font-medium">Endereço de entrega</p>
                <p className="text-xs text-muted-foreground">
                  {state.entregaDiferente
                    ? "Endereço alternativo informado abaixo."
                    : [
                        [entregaEfetiva.logradouro, entregaEfetiva.numero].filter(Boolean).join(", "),
                        entregaEfetiva.bairro,
                        [entregaEfetiva.cidade, entregaEfetiva.uf || state.uf].filter(Boolean).join(" / "),
                        entregaEfetiva.cep,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Endereço padrão do cadastro do cliente."}
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Endereço de entrega diferente do faturamento?</p>
                  <p className="text-xs text-muted-foreground">
                    Permitido apenas dentro do mesmo estado ({state.uf}). Este endereço é usado no cálculo do frete.
                  </p>
                </div>
                <Switch
                  checked={state.entregaDiferente}
                  onCheckedChange={(v) =>
                    setState((prev) => ({
                      ...prev,
                      entregaDiferente: v,
                      entrega: v
                        ? { ...(enderecoPadraoCliente ?? prev.entrega), uf: (enderecoPadraoCliente?.uf || prev.entrega.uf || prev.uf) }
                        : prev.entrega,
                    }))
                  }
                />
              </div>

              {state.entregaDiferente ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="CEP">
                    <CepInput
                      value={state.entrega.cep}
                      onChange={(v) => setEntrega({ cep: v })}
                      onFound={(e) =>
                        setEntrega({
                          cep: e.cep,
                          logradouro: e.logradouro,
                          complemento: e.complemento || state.entrega.complemento,
                          bairro: e.bairro,
                          cidade: e.cidade,
                          uf: e.uf,
                        })
                      }
                    />
                  </Field>
                  <Field label="Endereço">
                    <Input
                      value={state.entrega.logradouro}
                      onChange={(e) => setEntrega({ logradouro: e.target.value })}
                    />
                  </Field>
                  <Field label="Número">
                    <Input value={state.entrega.numero} onChange={(e) => setEntrega({ numero: e.target.value })} />
                  </Field>
                  <Field label="Complemento">
                    <Input
                      value={state.entrega.complemento}
                      onChange={(e) => setEntrega({ complemento: e.target.value })}
                    />
                  </Field>
                  <Field label="Bairro">
                    <Input value={state.entrega.bairro} onChange={(e) => setEntrega({ bairro: e.target.value })} />
                  </Field>
                  <Field label="Cidade">
                    <Input value={state.entrega.cidade} onChange={(e) => setEntrega({ cidade: e.target.value })} />
                  </Field>
                  <Field label="Estado (UF)">
                    <Input
                      value={state.entrega.uf}
                      maxLength={2}
                      className={cn(entregaUfInvalida && "border-destructive focus-visible:ring-destructive")}
                      onChange={(e) => setEntrega({ uf: e.target.value.toUpperCase().slice(0, 2) })}
                    />
                    {entregaUfInvalida ? (
                      <p className="text-[11px] text-destructive mt-1">
                        A entrega precisa ser no mesmo estado do faturamento ({state.uf}).
                      </p>
                    ) : null}
                  </Field>
                  <Field label="Contato da entrega">
                    <Input value={state.entrega.contato} onChange={(e) => setEntrega({ contato: e.target.value })} />
                  </Field>
                  <Field label="Telefone">
                    <Input value={state.entrega.telefone} onChange={(e) => setEntrega({ telefone: e.target.value })} />
                  </Field>
              </div>
              ) : null}
            </div>


            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Modalidade de frete">
                <Select
                  value={state.freteMod || undefined}
                  onValueChange={(v) =>
                    setState((s) => ({
                      ...s,
                      freteMod: v as CarregadoresFreteMod,
                      // Cada modalidade tem sua própria origem de valor.
                      freteValor: v === "CIF" ? (s.transportadora?.total ?? 0) : v === "FOB" ? 0 : s.freteValor,
                      transportadora: v === "CIF" ? s.transportadora : null,
                      freteAreaRural: v === "CIF" ? s.freteAreaRural : false,
                    }))
                  }
                >
                  <SelectTrigger className={cn(freteInvalido && tentouAvancar && "border-destructive focus-visible:ring-destructive")}>
                    <SelectValue placeholder="Selecione a modalidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CIF">{labelFreteMod.CIF}</SelectItem>
                    <SelectItem value="FOB">{labelFreteMod.FOB}</SelectItem>
                    <SelectItem value="DEDICADO">{labelFreteMod.DEDICADO}</SelectItem>
                  </SelectContent>
                </Select>
                {freteInvalido && tentouAvancar ? (
                  <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {erroFreteMsg}
                  </p>
                ) : null}
                {state.freteMod === "CIF" ? (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                    <span className="text-xs">Entrega em área rural?</span>
                    <Switch
                      checked={state.freteAreaRural}
                      onCheckedChange={(v) => set("freteAreaRural", v)}
                    />
                  </div>
                ) : null}
              </Field>

              {state.freteMod === "DEDICADO" ? (
                <Field label="Valor do frete (manual)">
                  <MoneyInput
                    value={state.freteValor}
                    placeholder="R$ 0,00"
                    maxValue={1000000}
                    className={cn(
                      !(state.freteValor > 0) && !tentouAvancar && "border-amber-500 focus-visible:ring-amber-500",
                      !(state.freteValor > 0) && tentouAvancar && "border-destructive focus-visible:ring-destructive",
                    )}
                    onValueChange={(n: number) => set("freteValor", n)}
                  />
                  {!(state.freteValor > 0) ? (
                    <p className={cn("text-[11px] mt-1", tentouAvancar ? "text-destructive" : "text-amber-600")}>
                      {tentouAvancar ? "Informe o valor do frete dedicado para avançar." : "Informe o valor do frete dedicado absorvido pela 2P."}
                    </p>
                  ) : null}
                </Field>
              ) : (
                <Field label="Valor do frete">
                  <div className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    freteInvalido && tentouAvancar && state.freteMod === "CIF" ? "border-destructive bg-destructive/10" : "border-border bg-surface-2",
                  )}>
                    {state.freteMod === "FOB" ? (
                      <span className="text-muted-foreground">
                        FOB — retirada por conta do cliente, sem valor de frete.
                      </span>
                    ) : (
                      <b>{fmtBRL(state.freteValor)}</b>
                    )}
                  </div>
                </Field>
              )}
            </div>

            {state.freteMod === "CIF" ? (
              <FreteCotacao
                unidade="carregadores"
                itens={state.itens
                  .filter((i) => i.produtoId && i.qtd > 0)
                  .map((i) => ({
                    codigo: produtos.find((p) => p.id === i.produtoId)?.codigo ?? "",
                    nome: produtos.find((p) => p.id === i.produtoId)?.nome ?? "",
                    quantidade: i.qtd,
                  }))
                  .filter((i) => i.codigo)}
                valorNota={d.valorItens}
                destino={destinoFrete}
                areaRural={state.freteAreaRural}
                documento={state.doc}
                selecionada={state.transportadora}
                onSelect={(t) =>
                  setState((s) => ({ ...s, transportadora: t, freteValor: money2(t.total) }))
                }
                onInvalidate={() =>
                  setState((s) =>
                    s.transportadora || s.freteValor
                      ? { ...s, transportadora: null, freteValor: 0 }
                      : s,
                  )
                }
              />
            ) : null}
            {state.freteMod === "CIF" && !state.transportadora && tentouAvancar ? (
              <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Selecione uma transportadora e confirme a cotação para avançar.
              </p>
            ) : null}

            </>
            ) : null}


            {etapa === 5 ? (
              <>
              {/* RESUMO ÚNICO DO PEDIDO */}
              <div className="rounded-xl border border-border bg-surface-2 p-4 space-y-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">Resumo do pedido</p>
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full",
                      abaixoPolitica
                        ? "bg-destructive/15 text-destructive"
                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    MB {fmtPct(d.mbPct)} · {abaixoPolitica ? "fora da política" : "dentro da política"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                  <ResumoLinha
                    k="Proposta"
                    v={`${state.propostaNome || "—"}${state.numeroSap ? ` · ${state.numeroSap}` : ""}`}
                  />
                  <ResumoLinha k="Cliente" v={`${state.nome || "—"}${state.doc ? ` · ${state.doc}` : ""}`} />
                  <ResumoLinha k="Consultor" v={consultorProposta ?? "—"} />
                  <ResumoLinha
                    k="Nota"
                    v={`${labelTipoNf[state.tipoNf]} · ${labelFinalidadeUso[state.finalidadeUso]} · ${[faturamentoEfetivo.cidade, state.uf].filter(Boolean).join(" / ") || "—"}`}
                  />
                  <ResumoLinha
                    k="Endereço de faturamento"
                    v={
                      [
                        faturamentoEfetivo.nome && state.faturarClienteFinal ? faturamentoEfetivo.nome : "",
                        ...linhasEndereco(faturamentoEfetivo),
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"
                    }
                  />
                  <ResumoLinha
                    k="Endereço de entrega"
                    v={linhasEndereco(entregaEfetiva).join(" · ") || "—"}
                  />
                  <ResumoLinha
                    k="Frete"
                    v={
                      state.freteMod
                        ? `${labelFreteMod[state.freteMod]}${state.transportadora ? ` · ${state.transportadora.nome} · ${state.transportadora.prazo} dia(s)` : ""}`
                        : "—"
                    }
                  />
                </div>

                {/* PRODUTOS */}
                <div className="border-t border-border pt-3 space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Produtos</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left font-medium py-1">Produto</th>
                          <th className="text-left font-medium py-1">NCM</th>
                          <th className="text-right font-medium py-1">Qtd</th>
                          <th className="text-right font-medium py-1">Valor unit.</th>
                          <th className="text-right font-medium py-1">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.itens
                          .filter((i) => i.produtoId)
                          .map((i) => {
                            const prod = produtos.find((p) => p.id === i.produtoId);
                            const ncm =
                              prod?.ncm_codigo ??
                              (ncmsQ.data ?? []).find((n) => n.id === prod?.ncm_id)?.codigo ??
                              "—";
                            return (
                              <tr key={i.key} className="border-t border-border/60">
                                <td className="py-1.5 pr-2">
                                  <div className="flex items-center gap-2">
                                    <ProdutoFoto
                                      url={fotoDoProduto(i.produtoId)}
                                      alt={prod?.nome}
                                      className="h-10 w-11"
                                    />
                                    <div className="min-w-0">
                                  <span className="font-medium">{prod?.nome ?? "—"}</span>
                                  {prod?.codigo ? (
                                    <span className="text-muted-foreground"> · {prod.codigo}</span>
                                  ) : null}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-1.5 pr-2 tabular-nums">{ncm}</td>
                                <td className="py-1.5 text-right tabular-nums">{i.qtd}</td>
                                <td className="py-1.5 text-right tabular-nums">{fmtBRL(i.valor)}</td>
                                <td className="py-1.5 text-right tabular-nums font-medium">
                                  {fmtBRL(i.valor * i.qtd)}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* IMPOSTOS */}
                <div className="border-t border-border pt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                  <p className="sm:col-span-2 text-xs uppercase tracking-wide text-muted-foreground">Impostos</p>
                  <ResumoLinha k="Total dos itens" v={fmtBRL(d.valorItens)} />
                  <ResumoLinha k="IPI destacado" v={fmtBRL(d.ipiValor)} />
                  <ResumoLinha k="Itens sem IPI (base fiscal)" v={fmtBRL(d.valorItem)} />
                  <ResumoLinha k="Valor líquido (sem IPI/ICMS/PIS-COFINS)" v={fmtBRL(d.rl)} />
                  <ResumoLinha k={`Frete (${state.freteMod || "—"})`} v={fmtBRL(state.freteValor)} />
                  <ResumoLinha k="Margem bruta" v={fmtPct(d.mbPct)} />
                  <ResumoLinha
                    k={`Comissão do vendedor (${regimeVendedor})`}
                    v={fmtBRL(comissaoVendedor.valor)}
                  />
                </div>
              </div>
              </>
            ) : null}



            </>

            ) : null}

          </div>

          {/* PAINEL / DRE (etapas 3/4) ou DEFINIÇÕES FINAIS (etapa 5) */}
          {etapa === 3 || etapa === 4 || etapa === 5 ? (
          <div className="space-y-4">
            {etapa === 5 ? (
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <p className="font-semibold text-sm">Definições finais</p>

                <Field label="Forma de pagamento">
                  <Select
                    value={state.formaPagamento || undefined}
                    onValueChange={(v) => set("formaPagamento", v as CarregadoresState["formaPagamento"])}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="boleto_vista">{labelFormaPagamento.boleto_vista}</SelectItem>
                      <SelectItem value="boleto_prazo">{labelFormaPagamento.boleto_prazo}</SelectItem>
                      <SelectItem value="pix">{labelFormaPagamento.pix}</SelectItem>
                      <SelectItem value="cartao_credito">{labelFormaPagamento.cartao_credito}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Observações finais">
                  <Textarea
                    rows={4}
                    value={state.observacoes}
                    placeholder="Observações da proposta"
                    onChange={(e) => set("observacoes", e.target.value)}
                  />
                  {avisoUsoConsumo ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Este aviso será incluído automaticamente nas observações da proposta: “{avisoUsoConsumo}”
                    </p>
                  ) : null}
                </Field>
              </div>
            ) : (
            <>
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
                sub={`Modalidade ${state.freteMod || "não informada"}`}
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


            {/* SAÚDE DA MARGEM */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Saúde da margem</h2>
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full",
                    abaixoPolitica
                      ? "bg-destructive/15 text-destructive"
                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {abaixoPolitica ? "Fora da política" : "Dentro da política"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <SumItem label="Margem bruta %" value={fmtPct(d.mbPct)} />
                <SumItem label={`Comissão do vendedor (${regimeVendedor})`} value={fmtBRL(comissaoVendedor.valor)} />

              </div>

              <div className="flex items-center gap-2 text-sm">
                {abaixoPolitica ? (
                  <>
                    <TriangleAlert className="h-4 w-4 text-destructive" />
                    <span className="text-destructive font-medium">
                      MB abaixo da política mínima de {fmtPct(config.politica_mb_min)}.
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-muted-foreground">
                      MB acima da política mínima de {fmtPct(config.politica_mb_min)}.
                    </span>
                  </>
                )}
              </div>

              {alertas.length ? (
                <div className="space-y-2">
                  {alertas.map((a, i) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-xl border px-3 py-2",
                        a.level === "err" ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/40",
                      )}
                    >
                      <p className="text-sm font-medium">{a.titulo}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.motivo}</p>
                      <p className="text-xs mt-0.5">Corrigir: {a.corrigir}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            </>)}






          </div>
          ) : null}

          {/* TOTAIS FINAIS — recalculam a cada mudança de preço/quantidade/frete */}
          {etapa >= 3 ? (
            <div className="col-span-full rounded-2xl border border-border/70 bg-card/95 backdrop-blur px-4 py-4 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Zap className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-primary">Totais finais</div>
                    <div className="text-[10px] text-muted-foreground">atualiza automaticamente</div>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-stretch gap-2 sm:gap-3">
                    <TotalRow
                      label="Valor Bruto"
                      value={fmtBRL(d.valorItens)}
                      hint="Produtos com IPI"
                    />
                    <TotalRow
                      label="Valor líquido"
                      value={fmtBRL(d.rl)}
                      hint="Sem IPI/ICMS/PIS-COFINS"
                    />
                    <TotalRow
                      label={`Frete (${state.freteMod || "—"})`}
                      value={fmtBRL(state.freteValor)}
                      hint={state.freteMod === "CIF" ? "Incluso no total" : undefined}
                    />
                    <TotalRow
                      label="Total da proposta"
                      value={fmtBRL(d.valorTotalProposta)}
                      strong
                      hint="Valor bruto + frete"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>


        {/* Barra de ações fixa no rodapé */}
        <WizardActionBar
          step={etapa}
          totalSteps={5}
          stepLabel={
            ["Identificação", "Faturamento", "Produtos", "Entrega e frete", "Finalização"][etapa - 1]
          }
          onBack={voltarEtapa}
          onNext={avancarEtapa}
          backDisabled={etapa === 1 || saving}
          nextDisabled={etapa === 5 || saving}
          errors={errosConclusao}
          showErrors={!podeFechar && tentouAvancar}
          savedAt={autosaveAt}
          savedLabel="Salvo"
          minimal={etapa === 1 && !temItemComValor}
          actions={
            etapa === 5 && temItemComValor
              ? [
                  {
                    label: "Salvar proposta",
                    onClick: pedirSalvar,
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
            !temItemComValor
              ? null
              : etapa === 5
                ? {
                    label: "Concluir pedido",
                    onClick: iniciarConclusao,
                    icon: <CheckCircle2 className="h-4 w-4" />,
                    loading: saving && statusProposta === "Aguardando Pagamento",
                    disabled: saving,
                  }
                : {
                    label: "Salvar proposta",
                    onClick: pedirSalvar,
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
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{
                    backgroundColor: propostaStatusStyle("Aguardando Pagamento").bg,
                    color: propostaStatusStyle("Aguardando Pagamento").fg,
                  }}
                >
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

        {/* Revisão final antes de concluir o pedido */}
        <Dialog open={revisao !== null} onOpenChange={(o) => !saving && !o && setRevisao(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Revisar e concluir pedido</DialogTitle>
              <DialogDescription>
                Confira os dados abaixo antes de enviar o pedido.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-sm max-h-[55vh] overflow-y-auto pr-1">
              <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Status do pedido</span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{
                    backgroundColor: propostaStatusStyle("Aguardando Pagamento").bg,
                    color: propostaStatusStyle("Aguardando Pagamento").fg,
                  }}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Aguardando Pagamento
                </span>
              </div>
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
                      <span className="flex min-w-0 items-center gap-2">
                        <ProdutoFoto
                          url={fotoDoProduto(i.produtoId)}
                          alt={produtos.find((p) => p.id === i.produtoId)?.nome}
                          className="h-9 w-10"
                        />
                        <span className="truncate">
                          {produtos.find((p) => p.id === i.produtoId)?.nome ?? "—"} × {i.qtd}
                        </span>
                      </span>
                      <span className="tabular-nums font-medium">{fmtBRL(i.qtd * i.valor)}</span>
                    </div>
                  ))}
                <div className="flex items-center justify-between gap-3 pt-1 border-t border-border">
                  <span className="text-muted-foreground">Frete ({state.freteMod || "—"})</span>
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
                  <span className="tabular-nums">{fmtPct(d.mbPct)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Comissão do vendedor ({regimeVendedor})</span>
                  <span className="tabular-nums">{fmtBRL(comissaoVendedor.valor)}</span>
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
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {saving ? "Processando..." : "Confirmar pedido"}
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
        "flex h-full min-w-0 flex-col justify-between rounded-xl border border-border bg-muted/40 px-4 py-3",
        className,
      )}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-xl font-bold tabular-nums truncate">{value}</span>
        {hint ? <span className="text-xs font-semibold text-muted-foreground shrink-0">{hint}</span> : null}
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

/** Card compacto do bloco de totais finais (etapa de produtos). */
function TotalRow({
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
        "flex-1 min-w-[140px] rounded-xl border px-3 py-2.5 transition-colors duration-500 flex flex-col justify-center",
        strong
          ? "border-primary/60 bg-primary/10"
          : flash
            ? "border-primary/50 bg-primary/5"
            : "border-border/60 bg-muted/30",
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium truncate">
        {label}
      </div>
      <div
        className={cn(
          "text-base sm:text-lg font-bold tabular-nums tracking-tight truncate",
          strong ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </div>
      {hint ? <div className="text-[9px] text-muted-foreground/70 truncate">{hint}</div> : null}
    </div>
  );
}

/** Linha do resumo do pedido (etapa de finalização). */
function ResumoLinha({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{k}</span>
      <span className={cn("text-right break-words", strong ? "font-bold" : "font-medium")}>{v}</span>
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
        "rounded-xl border px-4 py-3 transition-colors duration-500",
        strong
          ? "border-primary/60 bg-primary/10"
          : flash
            ? "border-primary/60 bg-primary/10"
            : "border-border/60 bg-muted/30",
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("tabular-nums", strong ? "text-2xl font-extrabold text-primary" : "text-lg font-bold")}>
        {value}
      </div>
      {hint ? <div className="text-[10px] text-muted-foreground tabular-nums">{hint}</div> : null}
    </div>
  );
}
