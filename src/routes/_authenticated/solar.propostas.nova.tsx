import { cidadeUf, cidadeUfCep } from "@/lib/local-format";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WizardActionBar } from "@/components/wizard-action-bar";
import { FreteCotacao } from "@/components/frete-cotacao";
import { FreteDedicado } from "@/components/frete-dedicado";
import { CondicaoPagamentoSelect } from "@/components/condicao-pagamento-select";
import { toast } from "sonner";
import {
  Building2,
  Calculator,
  Check,
  ChevronsUpDown,
  Eye,
  FileDown,
  ListPlus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Minus,
  Pencil,
  Plus,

  Package,
  Save,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { cn } from "@/lib/utils";
import { CepInput, type EnderecoCep } from "@/components/cep-input";
import {
  fmtBRL,
  aliquotasDoItem,
  finalidadeUsoDoCadastro,
  type CarregadoresTransportadora,
} from "@/lib/carregadores";
import { useCarregadoresNcms, useCarregadoresConfig } from "@/hooks/use-carregadores";
import { listClientesFn, enriquecerCnpjFn } from "@/lib/clientes.functions";
import { obterPropostaFn, concluirPropostaFn } from "@/lib/propostas.functions";
import { ResultadoConclusaoDialog, type ResultadoConclusao } from "@/components/resultado-conclusao-dialog";
import { salvarPropostaSolar } from "@/lib/propostas-solar.functions";
import { normalizarFinalidade } from "@/lib/sap-clientes-map";
import { precosSolarFn } from "@/lib/solar-precos.functions";
import { BloqueioPrecificacaoAlert, diagnosticarBloqueio } from "@/components/solar/bloqueio-precificacao";
import { resolverProduto } from "@/lib/solar-sku";
import { pltypDaTabela } from "@/lib/sap-clientes-map";
import { buildSolarPropostaPdfHtml, solarPropostaPdfFileName } from "@/lib/solar-proposta-pdf";
import {
  useSolarCalcConfig,
  useSolarCupons,
  type SolarCupom,
  useSolarGeradores,
  useSolarMicroinversores,
  useSolarModulos,
  useSolarProdutos,
  useSolarSuportes,
  useSolarTrilhoSuportes,
  useSolarTrilhos,
} from "@/hooks/use-solar-catalogo";
import { quantificarProjeto, pendenciasDePara } from "@/lib/solar-quantificador";
import {
  SOLAR_CALC_CONFIG_FALLBACK,
  type CalcResultado,
  type Orientacao,
} from "@/lib/solar-calculadora";

export const Route = createFileRoute("/_authenticated/solar/propostas/nova")({
  validateSearch: (s: Record<string, unknown>): { id?: string; dup?: string } => ({
    ...(typeof s['id'] === "string" ? { id: s['id'] as string } : {}),
    ...(typeof s['dup'] === "string" ? { dup: s['dup'] as string } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Nova proposta — Portal 2P Solar" },
      { name: "description", content: "Emissão de propostas 2P Solar com Calculadora 2P, frete e cupons." },
      { property: "og:title", content: "Nova proposta — Portal 2P Solar" },
      { property: "og:description", content: "Fluxo em 5 etapas para propostas da unidade 2P Solar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NovaPropostaSolarPage,
});

const ETAPAS = ["Identificação", "Faturamento", "Produtos", "Entrega e frete", "Finalização"] as const;

const TABELAS_PRECO = [
  { value: "01", label: "Tabela 01" },
  { value: "02", label: "Tabela 02" },
  { value: "03", label: "Tabela 03" },
  { value: "04", label: "Tabela 04" },
  { value: "05", label: "Tabela 05" },
];

type Item = {
  key: string;
  produtoId: string;
  qtd: number;
  valor: number;
  origem: "calculadora" | "manual";
  /** Item digitado manualmente (fora do catálogo SAP). */
  avulso?: { codigo: string; descricao: string };
};

/** Fileira da disposição dos painéis (uma linha da tabela da calculadora). */
type FileiraCalc = {
  key: string;
  trilhoId: string;
  suporteId: string;
  fileiras: string;
  modulos: string;
  orientacao: Orientacao;
  /** Espaçamento máximo entre apoios, em metros. */
  distMax: string;
  /** Balanço nas pontas, em metros. */
  balanco: string;
};

const novaFileira = (): FileiraCalc => ({
  key: Math.random().toString(36).slice(2),
  trilhoId: "",
  suporteId: "",
  fileiras: "1",
  modulos: "",
  orientacao: "R",
  distMax: "",
  balanco: "",
});

const TAMANHOS_TRILHO = [
  { value: "longo", label: "Até 4,80 m" },
  { value: "curto", label: "Até 2,40 m / 2,70 m" },
];


type ClienteCad = Record<string, any>;

const money2 = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
const normCod = (c: string) => String(c ?? "").trim().replace(/^0+(?=\d)/, "");
const normalizarCupom = (c: string) =>
  String(c ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9\-_]/g, "")
    .slice(0, 20);


function NovaPropostaSolarPage() {
  const { id: editId, dup: dupId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [etapa, setEtapa] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [propostaId, setPropostaId] = useState<string | null>(editId ?? null);
  const [numero, setNumero] = useState<string | null>(null);
  const carregado = useRef(false);

  // Etapa 1
  const [propostaNome, setPropostaNome] = useState("");
  const [clienteDoc, setClienteDoc] = useState("");
  const [vendido, setVendido] = useState<"sim" | "nao" | "estoque">("nao");
  const [previsao, setPrevisao] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Etapa 2
  const [tipoNf, setTipoNf] = useState("venda");
  const [faturarClienteFinal, setFaturarClienteFinal] = useState(false);
  const [fatTipoDoc, setFatTipoDoc] = useState<"cnpj" | "cpf">("cnpj");
  const [fat, setFat] = useState<Record<string, string>>({});
  /** Cliente final CNPJ contribuinte de ICMS (define CFOP/IE no SAP). */
  const [fatContribuinte, setFatContribuinte] = useState(false);
  /** Finalidade de uso — obrigatória quando o pedido fatura o cliente final. */
  const [finalidadeUso, setFinalidadeUso] = useState<string>("");
  const [resultadoConclusao, setResultadoConclusao] = useState<ResultadoConclusao | null>(null);
  const [enriquecendo, setEnriquecendo] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState<string>("");
  const [condicaoPagamento, setCondicaoPagamento] = useState<string>("");

  // Etapa 3
  const [modo, setModo] = useState<"calculadora" | "lista">("calculadora");
  const [listaPreco, setListaPreco] = useState("01");
  /** Venda em formato de kit — impacta regras comerciais/fiscais nas etapas seguintes. */
  const [ehKit, setEhKit] = useState<boolean>(false);
  /** Recusas do SAP na precificação (ex.: CNPJ sem parceiro) — bloqueiam o avanço. */
  const [avisosPreco, setAvisosPreco] = useState<string[]>([]);
  /** Listas independentes: o que está na calculadora não reflete na lista manual. */
  const [itensCalc, setItensCalc] = useState<Item[]>([]);
  const [itensLista, setItensLista] = useState<Item[]>([]);
  const [calculando, setCalculando] = useState(false);
  /** Assinatura dos inputs no momento do último cálculo (null = nunca calculou). */
  const [assinaturaCalc, setAssinaturaCalc] = useState<string | null>(null);
  const [editandoCalc, setEditandoCalc] = useState(false);

  const [trocando, setTrocando] = useState(false);
  const [resultado, setResultado] = useState<CalcResultado | null>(null);
  const [previewAberto, setPreviewAberto] = useState(false);
  const [pdfHtml, setPdfHtml] = useState("");
  const [previewZoom, setPreviewZoom] = useState(0.75);
  const [previewPaginas, setPreviewPaginas] = useState(1);


  const itens = modo === "calculadora" ? itensCalc : itensLista;
  /** No modo calculadora, itens extras (manuais) ficam agrupados no final. */
  const itensOrdenados = useMemo(
    () =>
      modo === "calculadora"
        ? [...itens.filter((i) => i.origem !== "manual"), ...itens.filter((i) => i.origem === "manual")]
        : itens,
    [itens, modo],
  );

  const setItens = modo === "calculadora" ? setItensCalc : setItensLista;

  // calculadora
  const [geradorId, setGeradorId] = useState("");
  const [microModelo, setMicroModelo] = useState("");
  const [microQtd, setMicroQtd] = useState("");
  const [moduloId, setModuloId] = useState("");
  const [modPersonalizado, setModPersonalizado] = useState({ largura: "", altura: "", espessura: "" });
  const [paineis, setPaineis] = useState("");
  const [tamanhoTrilho, setTamanhoTrilho] = useState("longo");
  const [linhas, setLinhas] = useState<FileiraCalc[]>([novaFileira()]);


  // Etapa 4
  const [entregaDiferente, setEntregaDiferente] = useState(false);
  const [entrega, setEntrega] = useState<Record<string, string>>({});
  const [freteMod, setFreteMod] = useState("");
  const [freteBonificado, setFreteBonificado] = useState(false);
  const [areaRural, setAreaRural] = useState(false);
  const [transportadora, setTransportadora] = useState<CarregadoresTransportadora | null>(null);
  // Cotação de frete em andamento — trava avanço/salvamento para não gravar sem o frete.
  const [freteCotando, setFreteCotando] = useState(false);


  // Etapa 5
  const [cupomCodigo, setCupomCodigo] = useState("");
  const [recalculandoTotais, setRecalculandoTotais] = useState(false);

  const removerCupom = () => {
    if (!cupomCodigo) return;
    setCupomCodigo("");
    setRecalculandoTotais(true);
    toast.info("Cupom removido. Valores recalculados sem desconto.");
  };


  const clientesQ = useQueryClientes();
  const produtosQ = useSolarProdutos();
  const modulosQ = useSolarModulos();
  const geradoresQ = useSolarGeradores();
  const microinversoresQ = useSolarMicroinversores();
  const trilhosQ = useSolarTrilhos();
  const suportesQ = useSolarSuportes();
  const combQ = useSolarTrilhoSuportes();
  const cfgQ = useSolarCalcConfig();
  const cuponsQ = useSolarCupons();
  const ncmsQ = useCarregadoresNcms();
  const fiscalCfgQ = useCarregadoresConfig();
  const precos = useServerFn(precosSolarFn);
  const salvar = useServerFn(salvarPropostaSolar);
  const enriquecer = useServerFn(enriquecerCnpjFn);


  const produtos = produtosQ.data ?? [];
  const config = cfgQ.data ?? SOLAR_CALC_CONFIG_FALLBACK;
  const cliente: ClienteCad | null = useMemo(
    () => (clientesQ.data ?? []).find((c: any) => String(c.doc) === clienteDoc) ?? null,
    [clientesQ.data, clienteDoc],
  );

  const suportesDe = (tid: string) => {
    const ids = (combQ.data ?? {})[tid] ?? [];
    return (suportesQ.data ?? []).filter((s) => ids.includes(s.id));
  };

  /**
   * Tabela de preço do cadastro do cliente ("2P-0001") vira o PLTYP do SAP ("01").
   * O vendedor ainda pode trocar manualmente depois.
   */
  const tabelaAplicada = useRef<string>("");
  useEffect(() => {
    const doc = String(cliente?.['doc'] ?? "");
    if (!doc || tabelaAplicada.current === doc) return;
    tabelaAplicada.current = doc;
    const pltyp = pltypDaTabela((cliente as any)?.['tabela_preco']);
    setListaPreco((atual) => (atual === pltyp ? atual : pltyp));
  }, [cliente]);


  // Carrega proposta existente para edição/duplicação
  useEffect(() => {
    const alvo = editId ?? dupId;
    if (!alvo || carregado.current) return;
    carregado.current = true;
    (async () => {
      const p = await obterPropostaFn({ data: { id: alvo } }).catch(() => null);
      if (!p) return toast.error("Não foi possível carregar a proposta.");
      setPropostaNome(String(p['nome'] ?? ""));
      setClienteDoc(String(p['cliente_doc'] ?? ""));
      setPrevisao(String(p['previsao_fechamento'] ?? ""));
      setObservacoes(String(p['observacoes'] ?? ""));
      setTipoNf(String(p['tipo_nf'] ?? "venda"));
      setFaturarClienteFinal(!!p['faturar_cliente_final']);
      setFat((p['faturamento'] as Record<string, string>) ?? {});
      setFatContribuinte(!!(p['faturamento'] as Record<string, unknown> | null)?.['contribuinte']);
      // O banco guarda o slug ("uso_consumo"); a tela usa o rótulo do SAP.
      setFinalidadeUso(p['finalidade_uso'] ? normalizarFinalidade(p['finalidade_uso']) : "");
      setFormaPagamento(String(p['forma_pagamento'] ?? ""));
      setCondicaoPagamento(String(p['condicao_pagamento_codigo'] ?? ""));
      setEntregaDiferente(!!p['entrega_diferente']);
      setEntrega((p['entrega'] as Record<string, string>) ?? {});
      setFreteMod(String(p['frete_mod'] ?? ""));
      setFreteBonificado(!!p['frete_bonificado']);
      setAreaRural(!!p['frete_area_rural']);
      // Restaura a transportadora escolhida: sem isso, reabrir a proposta
      // zerava o frete no salvamento e no PDF.
      if (p['transportadora']) {
        setTransportadora({
          id: String(p['transportadora_id'] ?? ""),
          nome: String(p['transportadora'] ?? ""),
          documento: String(p['transportadora_documento'] ?? ""),
          total: Number(p['frete_valor'] ?? 0),
          prazo: Number(p['frete_prazo'] ?? 0),
        });
      }
      const totais = (p['totais'] ?? {}) as Record<string, any>;
      setListaPreco(String(totais['listaPreco'] ?? "01"));
      if (typeof totais['ehKit'] === "boolean") setEhKit(totais['ehKit'] as boolean);
      setVendido(totais['vendidoClienteFinal'] ? "sim" : "nao");
      setCupomCodigo(String(totais['cupom'] ?? ""));
      // Restaura exatamente o que foi salvo: modo (calculadora/lista) e, no modo
      // calculadora, todas as entradas + os itens gerados. Sem isso, reabrir a
      // proposta a convertia silenciosamente em "lista de produtos".
      const calc = (totais['calculo'] ?? {}) as Record<string, any>;
      const itensSalvos: Item[] = ((p['itens'] as any[]) ?? []).map((i) => ({
        key: Math.random().toString(36).slice(2),
        produtoId: String(i.produtoId ?? ""),
        qtd: Number(i.qtd ?? 1),
        valor: money2(i.valor),
        origem: "manual" as const,
      }));

      if (calc['modo'] === "calculadora") {
        const e = (calc['entrada'] ?? {}) as Record<string, any>;
        setGeradorId(String(e['geradorId'] ?? ""));
        setMicroModelo(String(e['microModelo'] ?? ""));
        setMicroQtd(String(e['microQtd'] ?? ""));
        setModuloId(String(e['moduloId'] ?? ""));
        if (e['modPersonalizado']) setModPersonalizado(e['modPersonalizado']);
        setPaineis(String(e['paineis'] ?? ""));
        setTamanhoTrilho(String(e['tamanhoTrilho'] ?? "longo"));
        if (Array.isArray(e['linhas']) && e['linhas'].length) setLinhas(e['linhas'] as FileiraCalc[]);
        if (calc['assinatura']) setAssinaturaCalc(String(calc['assinatura']));
        if (calc['resultado']) setResultado(calc['resultado'] as CalcResultado);
        const guardados = Array.isArray(calc['itens']) ? (calc['itens'] as any[]) : null;
        setItensCalc(
          guardados
            ? guardados.map((i) => ({
                key: Math.random().toString(36).slice(2),
                produtoId: String(i.produtoId ?? ""),
                qtd: Number(i.qtd ?? 1),
                valor: money2(i.valor),
                origem: i.origem === "manual" ? ("manual" as const) : ("calculadora" as const),
                ...(i.avulso ? { avulso: i.avulso } : {}),
              }))
            : itensSalvos.map((i) => ({ ...i, origem: "calculadora" as const })),
        );
        setModo("calculadora");
      } else {
        setModo("lista");
        setItensLista(itensSalvos);
      }

      if (editId) {
        setPropostaId(editId);
        setNumero(String(p['numero'] ?? ""));
      }
    })();
  }, [editId, dupId]);

  // ------------------------------------------------------------------
  // Calculadora 2P
  // ------------------------------------------------------------------
  const modulo = useMemo(() => {
    const m = (modulosQ.data ?? []).find((x) => x.id === moduloId) ?? null;
    if (!m) return null;
    if (!m.personalizado) return m;
    return {
      ...m,
      largura: Number(modPersonalizado.largura) || null,
      altura: Number(modPersonalizado.altura) || null,
      espessura: Number(modPersonalizado.espessura) || null,
    };
  }, [modulosQ.data, moduloId, modPersonalizado]);

  /** "Personalizado" sempre em primeiro na lista (sem vir marcado). */
  const modulosOrdenados = useMemo(
    () =>
      [...(modulosQ.data ?? [])].sort(
        (a, b) => Number(b.personalizado) - Number(a.personalizado) || a.ordem - b.ordem,
      ),
    [modulosQ.data],
  );

  const geradorSel = useMemo(
    () => (geradoresQ.data ?? []).find((g) => g.id === geradorId) ?? null,
    [geradoresQ.data, geradorId],
  );
  const geradorEhMicro = !!geradorSel?.exige_microinversor;
  const geradorPedeQuantidade =
    geradorEhMicro || /otimizador/i.test(geradorSel?.nome ?? "");

  /** Inclui um produto do catálogo na lista do modo indicado. */
  function adicionarProdutoEm(id: string, alvo: "calculadora" | "lista") {
    const p = produtos.find((x) => x.id === id);
    if (!p) return;
    const setter = alvo === "calculadora" ? setItensCalc : setItensLista;
    const atual = alvo === "calculadora" ? itensCalc : itensLista;
    const novos: Item[] = [
      ...atual,
      {
        key: Math.random().toString(36).slice(2),
        produtoId: p.id,
        qtd: 1,
        valor: p.preco_sugerido,
        origem: "manual",
      },
    ];
    setter(novos);
    void atualizarPrecos(novos, listaPreco, setter);
  }




  /** Total de painéis previsto nas fileiras (fileiras × módulos por fileira). */
  const paineisNasLinhas = useMemo(
    () =>
      linhas.reduce(
        (s, l) => s + (Number(l.fileiras) || 0) * (Number(l.modulos) || 0),
        0,
      ),
    [linhas],
  );

  const microSugerido = useMemo(() => {
    const m = (microinversoresQ.data ?? []).find((x) => x.id === microModelo);
    if (!m) return 0;
    return Math.ceil((paineisNasLinhas || Number(paineis) || 0) / Math.max(1, m.modulos_por_unidade));
  }, [microinversoresQ.data, microModelo, paineis, paineisNasLinhas]);

  /** Trilhos Smart 10 / Zipado / Laje 10 / Smart 3.4 não usam vão nem balanço. */
  const SEM_VAO_LEGADOS = [3, 4, 5, 7];
  function semVao(l: FileiraCalc) {
    const t = (trilhosQ.data ?? []).find((x) => x.id === l.trilhoId);
    return SEM_VAO_LEGADOS.includes(t?.legado_id ?? 0);
  }

  /** Orientação travada pelo trilho (Laje 10 = Paisagem). */
  function orientacaoTravada(l: FileiraCalc): "R" | "P" | null {
    const t = (trilhosQ.data ?? []).find((x) => x.id === l.trilhoId);
    return (t?.orientacao_fixa as "R" | "P" | null) || null;
  }

  /**
   * Valores padrão (editáveis) de vão máximo e balanço, iguais à calculadora antiga:
   *  - Trilho (light/padrão 2P-TC): Retrato 1,50 / Paisagem 1,70
   *  - Reforçado (2P-TCR):          Retrato 1,70 / Paisagem 2,00
   *  - Balanço da ponta da string: sempre 0,50 m (não confundir com balanco_ponta = 40 mm do nt)
   */
  function padroesLinha(l: FileiraCalc) {
    const t = (trilhosQ.data ?? []).find((x) => x.id === l.trilhoId);
    const reforcado = /refor/i.test(`${t?.nome ?? ""} ${t?.familia ?? ""}`);
    const orientR = l.orientacao !== "P";
    const dist = reforcado ? (orientR ? "1.70" : "2.00") : orientR ? "1.50" : "1.70";
    return { dist, balanco: "0.50" };
  }


  /**
   * Trilhos com suporte único (Zipado, Laje 10) auto-selecionam o suporte e,
   * quando o trilho define orientação fixa, ela é aplicada e fica travada.
   */
  useEffect(() => {
    const trilhos = trilhosQ.data ?? [];
    const suportes = suportesQ.data ?? [];
    if (!trilhos.length || !suportes.length) return;
    setLinhas((prev) => {
      let mudou = false;
      const next = prev.map((l) => {
        const t = trilhos.find((x) => x.id === l.trilhoId);
        if (!t) return l;
        let out = l;
        if (t.suporte_fixo_legado) {
          const s = suportes.find((x) => x.legado_id === t.suporte_fixo_legado);
          if (s && out.suporteId !== s.id) {
            out = { ...out, suporteId: s.id };
            mudou = true;
          }
        }
        const fixa = (t.orientacao_fixa as "R" | "P" | null) || null;
        if (fixa && out.orientacao !== fixa) {
          out = { ...out, orientacao: fixa };
          mudou = true;
        }
        return out;
      });
      return mudou ? next : prev;
    });
  }, [trilhosQ.data, suportesQ.data, linhas.map((l) => l.trilhoId).join("|")]);

  /** Preenche vão máximo e balanço com os padrões da calculadora (editáveis). */
  useEffect(() => {
    setLinhas((prev) => {
      let mudou = false;
      const next = prev.map((l) => {
        const t = (trilhosQ.data ?? []).find((x) => x.id === l.trilhoId);
        if (!t) return l;
        const sem = SEM_VAO_LEGADOS.includes(t.legado_id ?? 0);
        if (sem) {
          if (l.distMax || l.balanco) {
            mudou = true;
            return { ...l, distMax: "", balanco: "" };
          }
          return l;
        }
        // Distância padrão por trilho + orientação; balanço fixo 0,50 m (calculadora antiga).
        const { dist: distPadrao, balanco: balancoPadrao } = padroesLinha(l);
        if (!l.distMax || !l.balanco) {
          mudou = true;
          return { ...l, distMax: l.distMax || distPadrao, balanco: l.balanco || balancoPadrao };
        }
        return l;
      });
      return mudou ? next : prev;
    });
  }, [trilhosQ.data, config]);


  /** Assinatura dos inputs que alimentam o cálculo — muda ⇒ cálculo desatualizado. */
  const assinaturaAtual = useMemo(
    () =>
      JSON.stringify({
        modulo: modulo?.id ?? null,
        paineis,
        geradorId,
        microModelo,
        microQtd,
        tamanhoTrilho,
        linhas: linhas.map((l) => [l.trilhoId, l.suporteId, l.fileiras, l.modulos, l.orientacao, l.distMax, l.balanco]),
      }),
    [modulo, paineis, geradorId, microModelo, microQtd, tamanhoTrilho, linhas],
  );
  const calcDesatualizado = !!assinaturaCalc && assinaturaCalc !== assinaturaAtual;
  const calcTravado = !!assinaturaCalc && !editandoCalc;
  function liberarEdicaoCalculo() {
    setEditandoCalc(true);
  }

  /** Campos obrigatórios das etapas 1 e 2 que ainda não foram preenchidos. */
  const faltandoInputs = useMemo(() => {
    const f: string[] = [];
    if (!modulo) f.push("Selecione o módulo (Etapa 1).");
    else if (!Number(modulo.largura) || !Number(modulo.altura) || !Number(modulo.espessura))
      f.push("Informe largura, altura e espessura do módulo (Etapa 1).");
    if (!geradorId) f.push("Selecione o tipo de gerador (Etapa 1).");
    if (geradorEhMicro && !microModelo) f.push("Selecione o modelo do microinversor (Etapa 1).");
    if (!linhas.length) f.push("Adicione ao menos uma fileira (Etapa 2).");
    linhas.forEach((l, i) => {
      if (!l.trilhoId) f.push(`Fileira ${i + 1}: selecione o trilho (Etapa 2).`);
      if (!l.suporteId) f.push(`Fileira ${i + 1}: selecione o suporte (Etapa 2).`);
      if (!(Number(l.modulos) > 0)) f.push(`Fileira ${i + 1}: informe os módulos por fileira (Etapa 2).`);
      if (!(Number(l.fileiras) > 0)) f.push(`Fileira ${i + 1}: informe a quantidade de fileiras (Etapa 2).`);
    });
    if (Number(paineis) > 0 && paineisNasLinhas && paineisNasLinhas !== Number(paineis)) {
      const diff = paineisNasLinhas - Number(paineis);
      f.push(
        diff > 0
          ? `A disposição tem ${diff} módulo(s) a mais que os ${paineis} do projeto.`
          : `Faltam ${Math.abs(diff)} módulo(s) na disposição (${paineisNasLinhas} de ${paineis}).`,
      );
    }
    return f;
  }, [modulo, geradorId, geradorEhMicro, microModelo, linhas, paineis, paineisNasLinhas]);

  /**
   * De/para de códigos: simula a quantificação com os inputs atuais e lista os
   * componentes que sairiam sem código SAP cadastrado (trilho, suporte, config).
   */
  const pendenciasCodigos = useMemo(() => {
    if (faltandoInputs.length || !modulo) return [];
    const fileiras = linhas.map((l) => ({
      trilho: (trilhosQ.data ?? []).find((t) => t.id === l.trilhoId),
      suporte: (suportesQ.data ?? []).find((s) => s.id === l.suporteId),
      qtd_paineis: Number(l.modulos) || 0,
      qtd_fileiras: Number(l.fileiras) || 0,
      orientacao: l.orientacao,
      distancia: Number(l.distMax) || (semVao(l) ? 0 : Number(padroesLinha(l).dist)),
      balanco: Number(l.balanco) || (semVao(l) ? 0 : 0.5),
    }));
    if (fileiras.some((f) => !f.trilho || !f.suporte)) return [];
    const micro = (microinversoresQ.data ?? []).find((m) => m.id === microModelo);
    const tipoGerador = geradorEhMicro ? 1 : /otimizador/i.test(geradorSel?.nome ?? "") ? 2 : 3;
    try {
      return pendenciasDePara(
        fileiras.map((f) => ({
          ...f,
          trilho: f.trilho as NonNullable<typeof f.trilho>,
          suporte: f.suporte as NonNullable<typeof f.suporte>,
        })),
        {
          largura: Number(modulo.largura) || 0,
          altura: Number(modulo.altura) || 0,
          espessura: Number(modulo.espessura) || 0,
        },
        {
          todos_trilhos: tamanhoTrilho === "longo" ? "S" : "N",
          tipo_gerador: tipoGerador,
          modelo_gerador: micro?.modelo_legado ?? 0,
          microinversores: Number(microQtd) || microSugerido,
        },
        config,
      );
    } catch {
      return [];
    }
  }, [
    faltandoInputs,
    modulo,
    linhas,
    trilhosQ.data,
    suportesQ.data,
    microinversoresQ.data,
    microModelo,
    microQtd,
    microSugerido,
    geradorEhMicro,
    geradorSel,
    tamanhoTrilho,
    config,
  ]);

  const bloqueiaCalculo = faltandoInputs.length > 0 || pendenciasCodigos.length > 0;


  async function realizarProposta() {
    if (faltandoInputs.length) return toast.error(faltandoInputs[0] as string);
    if (pendenciasCodigos.length)
      return toast.error(
        `De/para incompleto: ${pendenciasCodigos[0]?.origem} — ${pendenciasCodigos[0]?.campo} (${pendenciasCodigos[0]?.descricao}).`,
      );
    if (!modulo) return toast.error("Selecione o módulo.");
    if (!linhas.length) return toast.error("Adicione ao menos uma fileira.");

    if (Number(paineis) > 0 && paineisNasLinhas !== Number(paineis)) {
      const diff = paineisNasLinhas - Number(paineis);
      return toast.error(
        diff > 0
          ? `A disposição das fileiras tem ${diff} módulo(s) a mais que os ${paineis} do projeto. Remova ${diff} para calcular.`
          : `Faltam ${Math.abs(diff)} módulo(s) na disposição das fileiras (${paineisNasLinhas} de ${paineis}).`,
      );
    }

    const microSelecionado = (microinversoresQ.data ?? []).find((m) => m.id === microModelo);
    if (geradorEhMicro && !microSelecionado) return toast.error("Selecione o modelo do microinversor.");

    setCalculando(true);
    setResultado(null);
    // Animação característica da Calculadora 2P
    await new Promise((r) => setTimeout(r, 1400));

    const fileirasQuant = linhas.map((l) => ({
      trilho: (trilhosQ.data ?? []).find((t) => t.id === l.trilhoId),
      suporte: (suportesQ.data ?? []).find((s) => s.id === l.suporteId),
      qtd_paineis: Number(l.modulos) || 0,
      qtd_fileiras: Number(l.fileiras) || 0,
      orientacao: l.orientacao,
      distancia: Number(l.distMax) || (semVao(l) ? 0 : Number(padroesLinha(l).dist)),
      balanco: Number(l.balanco) || (semVao(l) ? 0 : 0.5),
    }));
    const incompleta = fileirasQuant.find((l) => !l.trilho || !l.suporte);
    if (incompleta) {
      setCalculando(false);
      return toast.error("Selecione o trilho e o suporte de todas as fileiras.");
    }
    const tipoGerador = geradorEhMicro ? 1 : /otimizador/i.test(geradorSel?.nome ?? "") ? 2 : 3;
    const quantificado = quantificarProjeto(
      fileirasQuant.map((l) => ({
        ...l,
        trilho: l.trilho as NonNullable<typeof l.trilho>,
        suporte: l.suporte as NonNullable<typeof l.suporte>,
      })),
      {
        largura: Number(modulo.largura) || 0,
        altura: Number(modulo.altura) || 0,
        espessura: Number(modulo.espessura) || 0,
      },
      {
        todos_trilhos: tamanhoTrilho === "longo" ? "S" : "N",
        tipo_gerador: tipoGerador,
        modelo_gerador: microSelecionado?.modelo_legado ?? 0,
        microinversores: Number(microQtd) || microSugerido,
      },
      config,
    );
    const agregado: CalcResultado = {
      ok: quantificado.ok,
      erros: quantificado.erros,
      avisos: quantificado.avisos,
      distribuicao: quantificado.distribuicao,
      comprimentos: quantificado.comprimentos,
      componentes: quantificado.itens.map((i) => ({
        chave: i.chave,
        codigo: i.codigo,
        descricao: i.descricao,
        quantidade: i.quantidade,
      })),
    };
    setResultado(agregado);
    if (!agregado.ok) {
      setCalculando(false);
      return toast.error(agregado.erros[0] ?? "Revise os dados da estrutura.");
    }


    // Converte os componentes calculados em itens do catálogo (por código SAP)
    const novos: Item[] = [];
    const faltando: string[] = [];
    for (const c of agregado.componentes) {
      const prod = resolverProduto(produtos as any, c.codigo) as (typeof produtos)[number] | undefined;
      if (!prod) {
        faltando.push(c.descricao);
        novos.push({
          key: Math.random().toString(36).slice(2),
          produtoId: "",
          qtd: c.quantidade,
          valor: 0,
          origem: "calculadora",
          avulso: { codigo: c.codigo ?? "SEM-CODIGO", descricao: c.descricao },
        });
        continue;
      }
      novos.push({
        key: Math.random().toString(36).slice(2),
        produtoId: prod.id,
        qtd: c.quantidade,
        valor: prod.preco_sugerido,
        origem: "calculadora",
      });
    }
    const extras = itensCalc.filter((i) => i.origem === "manual");
    setItensCalc([...novos, ...extras]);
    setAssinaturaCalc(assinaturaAtual);
    setEditandoCalc(false);
    if (faltando.length)
      toast.warning(`Itens sem correspondência no catálogo foram incluídos sem preço: ${faltando.join(", ")}.`);
    // Espera os preços do SAP antes de liberar a etapa: nunca seguir com zero calado.
    await atualizarPrecos([...novos, ...extras], listaPreco, setItensCalc);
    setCalculando(false);
    if (!faltando.length) toast.success("Estrutura calculada e itens precificados.");


  }

  // ------------------------------------------------------------------
  // Preços por tabela de preço (recalcula tudo ao trocar)
  // ------------------------------------------------------------------
  async function atualizarPrecos(
    lista: Item[],
    tabela: string,
    setter: React.Dispatch<React.SetStateAction<Item[]>> = setItens,
  ) {
    /** Código SAP do item: do catálogo ou, no avulso calculado, o próprio código. */
    const codigoDoItem = (i: Item) =>
      i.avulso
        ? normCod(i.avulso.codigo === "AVULSO" ? "" : i.avulso.codigo)
        : normCod(produtos.find((p) => p.id === i.produtoId)?.codigo ?? "");

    const precificaveis = lista.filter((i) => codigoDoItem(i));
    if (!precificaveis.length) return;
    try {
      const r = await precos({
        data: {
          itens: precificaveis.map((i) => ({ codigo: codigoDoItem(i), quantidade: i.qtd })),
          documento: String(cliente?.['doc'] ?? clienteDoc ?? ""),
          listaPreco: tabela,
          tipoNf,
          kitFotovoltaico: ehKit === true,
          contribuinte: cliente?.['contribuinte'] === true,
          // A NF sai contra o cliente final: o servidor simula os preços com o
          // documento e o TP_OV dele (impostos diferentes), mantendo a tabela.
          faturarClienteFinal,
          faturamento: faturarClienteFinal
            ? {
                doc: String(fat['doc'] ?? ""),
                contribuinte:
                  String(fat['contribuinte'] ?? "") === "true" || Boolean(String(fat['ie'] ?? "").trim()),
              }
            : null,
        },
      });
      const semPreco: string[] = [];
      setter((prev) =>
        prev.map((i) => {
          const cod = codigoDoItem(i);
          if (!cod) return i;
          const v = (r.precos as Record<string, number>)[cod];
          if (v === undefined) return i;
          if (!v) semPreco.push(cod);
          return { ...i, valor: money2(v) };
        }),
      );
      const avisos = ((r as { avisos?: string[] }).avisos ?? []).filter(Boolean);
      setAvisosPreco(avisos);
      if (avisos.length)
        toast.error(`SAP não precificou os itens: ${avisos.join(" • ")}`, { duration: 12000 });
      else if (semPreco.length)
        toast.warning(
          `Sem preço no SAP para a tabela ${tabela}: ${semPreco.join(", ")}. Informe o valor manualmente.`,
        );
    } catch (e) {
      const msg = (e as Error).message || "erro desconhecido";
      setAvisosPreco([msg]);
      toast.error(`Não foi possível buscar os preços no SAP: ${msg}.`);
    }
  }



  async function trocarTabela(t: string) {
    if (t === listaPreco) return;
    setListaPreco(t);
    setTransportadora(null);
    setTrocando(true);
    await atualizarPrecos(itens, t);
    setTrocando(false);
    toast.info(`Tabela ${t}: valores recalculados.`);
  }

  /** Nova tentativa de precificação a partir do diagnóstico do bloqueio. */
  async function recalcularPrecos() {
    if (trocando || !itens.length) return;
    setTrocando(true);
    await atualizarPrecos(itens, listaPreco);
    setTrocando(false);
  }

  /** Explicação do bloqueio da etapa 3 (causa provável + ações sugeridas). */
  const diagnosticoBloqueio = useMemo(() => {
    const semPreco = itens.filter((i) => !(i.valor > 0)).map(
      (i) =>
        i.avulso?.descricao ||
        produtos.find((p) => p.id === i.produtoId)?.descricao ||
        i.avulso?.codigo ||
        "item",
    );
    return diagnosticarBloqueio({
      mensagensSap: avisosPreco,
      itensSemPreco: semPreco,
      documento: String(cliente?.['doc'] ?? clienteDoc ?? ""),
      tabelaPreco: listaPreco,
    });
  }, [itens, avisosPreco, cliente, clienteDoc, listaPreco, produtos]);

  // ------------------------------------------------------------------
  // Itens enviados à cotação de frete: TODOS os itens com código SAP
  // numérico entram no peso (mesmo conjunto da precificação). Item sem
  // código numérico bloqueia a cotação — frete errado é pior que frete
  // bloqueado.
  // ------------------------------------------------------------------
  const freteItens = useMemo(() => {
    const lista: { codigo: string; quantidade: number; nome?: string }[] = [];
    const pendencias: string[] = [];
    for (const i of itens) {
      const p = produtos.find((x) => x.id === i.produtoId);
      const cod = normCod(p?.codigo ?? i.avulso?.codigo ?? "");
      const nome = p?.descricao ?? i.avulso?.descricao ?? "item";
      if (!/^\d+$/.test(cod)) {
        pendencias.push(`${nome}${cod ? ` (${cod})` : ""} sem código SAP — peso não calculado`);
        continue;
      }
      lista.push({ codigo: cod, quantidade: i.qtd, nome });
    }
    return { lista, pendencias };
  }, [itens, produtos]);


  async function trocarModo(m: "calculadora" | "lista") {
    if (m === modo || trocando) return;
    setTrocando(true);
    setModo(m);
    await new Promise((r) => setTimeout(r, 420));
    setTrocando(false);
  }

  /** Faturamento direto ao cliente final: busca dados do CNPJ (Serpro/CNPJá). */
  async function enriquecerFaturamento() {
    const doc = String(fat['doc'] ?? "").replace(/\D/g, "");
    if (fatTipoDoc !== "cnpj" || doc.length !== 14) {
      toast.error("Informe um CNPJ válido (14 dígitos).");
      return;
    }
    setEnriquecendo(true);
    try {
      const e = await enriquecer({ data: { cnpj: doc } });
      if (!e) {
        toast.warning("Não encontramos dados públicos — preencha manualmente.");
        return;
      }
      setFat((p) => ({
        ...p,
        nome: e.razao_social ?? p['nome'] ?? "",
        ie: e.ie ?? p['ie'] ?? "",
        cep: e.cep ?? p['cep'] ?? "",
        logradouro: e.logradouro ?? p['logradouro'] ?? "",
        numero: e.numero ?? p['numero'] ?? "",
        complemento: e.complemento ?? p['complemento'] ?? "",
        bairro: e.bairro ?? p['bairro'] ?? "",
        cidade: e.cidade ?? p['cidade'] ?? "",
        uf: e.uf ?? p['uf'] ?? "",
        telefone: e.telefone ?? p['telefone'] ?? "",
      }));
      toast.success("Dados do CNPJ preenchidos. Você ainda pode editá-los.");
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível consultar o CNPJ.");
    } finally {
      setEnriquecendo(false);
    }
  }

  // ------------------------------------------------------------------
  // Totais
  // ------------------------------------------------------------------
  const subtotal = useMemo(
    () => money2(itens.reduce((s, i) => s + i.valor * i.qtd, 0)),
    [itens],
  );
  // Validação do cupom (código, status, validade, uso e vínculo com cliente)
  const cupomCheck = useMemo((): {
    status: "vazio" | "carregando" | "ok" | "erro";
    cupom: SolarCupom | null;
    mensagem: string;
  } => {
    const alvo = cupomCodigo.trim().toUpperCase();
    if (!alvo) return { status: "vazio", cupom: null, mensagem: "" };
    if (cuponsQ.isLoading) return { status: "carregando", cupom: null, mensagem: "Validando cupom..." };
    if (cuponsQ.isError)
      return { status: "erro", cupom: null, mensagem: "Não foi possível validar o cupom agora. Tente novamente." };
    if (!/^[A-Z0-9\-_]{3,20}$/.test(alvo))
      return { status: "erro", cupom: null, mensagem: "Código inválido: use de 3 a 20 caracteres (letras, números, hífen ou underscore)." };


    const achado = (cuponsQ.data ?? []).find((c) => c.codigo.trim().toUpperCase() === alvo) ?? null;
    if (!achado) return { status: "erro", cupom: null, mensagem: `Cupom "${alvo}" não existe.` };
    if (!achado.ativo) return { status: "erro", cupom: null, mensagem: `Cupom "${alvo}" está inativo.` };

    if (achado.validade_inicio) {
      const ini = new Date(`${String(achado.validade_inicio).slice(0, 10)}T00:00:00`);
      if (!Number.isNaN(ini.getTime()) && ini.getTime() > Date.now())
        return {
          status: "erro",
          cupom: null,
          mensagem: `Cupom válido somente a partir de ${ini.toLocaleDateString("pt-BR")}.`,
        };
    }
    if (achado.validade) {
      const venc = new Date(`${String(achado.validade).slice(0, 10)}T23:59:59`);
      if (!Number.isNaN(venc.getTime()) && venc.getTime() < Date.now())
        return {
          status: "erro",
          cupom: null,
          mensagem: `Cupom expirado em ${venc.toLocaleDateString("pt-BR")}.`,
        };
    }
    if (!achado.reutilizavel && (achado.usos ?? 0) > 0)
      return { status: "erro", cupom: null, mensagem: "Cupom de uso único já utilizado." };
    if (achado.limite_usos != null && (achado.usos ?? 0) >= Number(achado.limite_usos))
      return {
        status: "erro",
        cupom: null,
        mensagem: `Cupom esgotado (limite de ${achado.limite_usos} uso(s) atingido).`,
      };

    const soDigitos = (v: string) => v.replace(/\D/g, "");
    if (achado.cliente_doc) {
      const docAtual = soDigitos(String(cliente?.['doc'] ?? clienteDoc ?? ""));
      if (!docAtual)
        return { status: "erro", cupom: null, mensagem: "Cupom exclusivo de um cliente — selecione o cliente da proposta." };
      if (soDigitos(achado.cliente_doc) !== docAtual)
        return {
          status: "erro",
          cupom: null,
          mensagem: `Cupom exclusivo de ${achado.cliente_nome ?? "outro cliente"} e não vale para este cliente.`,
        };
    }

    const detalhes: string[] = [];
    if (achado.tipos.includes("percentual") && achado.percentual > 0) detalhes.push(`${achado.percentual}% de desconto`);
    if (achado.tipos.includes("valor") && achado.valor > 0) detalhes.push(`${fmtBRL(achado.valor)} de desconto`);
    if (achado.tipos.includes("frete")) detalhes.push("frete grátis");
    return {
      status: "ok",
      cupom: achado,
      mensagem: `Cupom ${achado.codigo} aplicado${detalhes.length ? `: ${detalhes.join(" + ")}` : ""}.`,
    };
  }, [cuponsQ.data, cuponsQ.isLoading, cuponsQ.isError, cupomCodigo, cliente, clienteDoc]);

  const cupom = cupomCheck.cupom;
  const desconto = useMemo(() => {
    if (!cupom) return 0;
    let d = 0;
    if (cupom.tipos.includes("percentual")) d += subtotal * (cupom.percentual / 100);
    if (cupom.tipos.includes("valor")) d += cupom.valor;
    return money2(Math.min(d, subtotal));
  }, [cupom, subtotal]);
  const freteGratis = !!cupom?.tipos.includes("frete");

  const freteValor = freteMod === "FOB" || freteMod === "" || freteGratis ? 0 : (transportadora?.total ?? 0);
  const bonificado = freteBonificado && (freteMod === "CIF" || freteMod === "DEDICADO");
  // Bonificado: a 2P assume o frete — o valor continua cotado, mas não é cobrado.
  const total = money2(subtotal - desconto + (bonificado ? 0 : freteValor));

  // Carregamento visual durante recálculo de cupom / frete
  useEffect(() => {
    setRecalculandoTotais(true);
    const t = setTimeout(() => setRecalculandoTotais(false), 450);
    return () => clearTimeout(t);
  }, [cupomCodigo, freteMod, transportadora?.total, itens]);


  // ------------------------------------------------------------------
  // Validações por etapa
  // ------------------------------------------------------------------
  const erros = useMemo(() => {
    const e: string[] = [];
    if (etapa === 1) {
      if (!propostaNome.trim()) e.push("Informe o nome da proposta.");
      if (!cliente) e.push("Selecione o cliente no cadastro.");
      if (vendido === "sim" && !previsao) e.push("Previsão de fechamento é obrigatória.");
    }
    if (etapa === 2) {
      if (faturarClienteFinal && (!fat['nome'] || !fat['doc'] || !fat['logradouro'] || !fat['cidade'] || !fat['uf']))
        e.push("Complete os dados de faturamento do cliente final.");
      if (faturarClienteFinal && !finalidadeUso)
        e.push("Informe a finalidade de uso (Revenda, Industrialização ou Uso e Consumo).");
      if (faturarClienteFinal && fatTipoDoc === "cnpj" && fatContribuinte && !String(fat['ie'] ?? "").trim())
        e.push("Cliente final marcado como contribuinte: informe a inscrição estadual.");
    }
    if (etapa === 3) {
      if (!itens.length) e.push("Adicione ao menos um produto.");
      if (modo === "calculadora") {
        if (!assinaturaCalc) e.push("Execute o cálculo da estrutura antes de avançar.");
        else if (calcDesatualizado)
          e.push("Os dados do cálculo foram alterados. Calcule novamente antes de avançar.");
        else if (!itensCalc.some((i) => i.origem === "calculadora"))
          e.push("O cálculo não gerou itens de estrutura. Revise os dados e calcule novamente.");
      }
      // SAP recusou a precificação (ex.: CNPJ sem parceiro cadastrado): não avança.
      if (avisosPreco.length)
        e.push(`SAP recusou a precificação: ${avisosPreco[0]} Corrija e calcule novamente.`);
      if (itens.some((i) => !i.valor))
        e.push("Há itens sem preço. Resolva a precificação no SAP antes de avançar.");
    }
    if (etapa === 4) {
      if (!freteMod) e.push("Escolha a modalidade de frete.");
      if (freteCotando)
        e.push("O frete ainda está sendo calculado. Aguarde o fim da cotação para avançar.");
      if ((freteMod === "CIF" || freteMod === "DEDICADO") && !transportadora && !freteGratis)
        e.push("Finalize a cotação e escolha a transportadora.");
      if (entregaDiferente && (!entrega['logradouro'] || !entrega['cidade']))
        e.push("Complete o endereço de entrega.");
    }
    return e;
  }, [
    etapa, propostaNome, cliente, vendido, previsao, faturarClienteFinal, fat,
    finalidadeUso, fatTipoDoc, fatContribuinte,
    itens, freteMod, transportadora, freteGratis, entregaDiferente, entrega,
    modo, assinaturaCalc, calcDesatualizado, itensCalc, avisosPreco, ehKit,
    freteCotando,
  ]);


  function avancar() {
    setTentou(true);
    if (erros.length) return toast.error(erros[0]!);
    setTentou(false);
    setEtapa((s) => (Math.min(5, s + 1) as typeof s));
  }

  async function salvarProposta(concluir = false) {
    // Nunca gravar/concluir com uma cotação de frete em andamento: o valor
    // ainda não está aplicado e a proposta iria sem o frete.
    if (freteCotando) {
      setTentou(true);
      return toast.error("Aguarde o cálculo do frete terminar antes de salvar a proposta.");
    }
    if ((freteMod === "CIF" || freteMod === "DEDICADO") && !transportadora && !freteGratis) {
      setTentou(true);
      return toast.error("Escolha a transportadora — a proposta não pode ser salva sem o frete cotado.");
    }
    if (concluir && !formaPagamento) {
      setTentou(true);
      return toast.error("Forma de pagamento é obrigatória para concluir o pedido.");
    }
    if (concluir && !condicaoPagamento) {
      setTentou(true);
      return toast.error("Condição de pagamento (ZTERM) é obrigatória para concluir o pedido.");
    }
    setSalvando(true);

    try {
      const r = await salvar({
        data: {
          propostaId,
          propostaNome,
          vendidoClienteFinal: vendido === "sim",
          previsaoFechamento: previsao || null,
          listaPreco,
          ehKit: ehKit === true,
          cliente: {
            nome: String(cliente?.['razao_social'] ?? ""),
            doc: String(cliente?.['doc'] ?? ""),
            ie: String(cliente?.['ie'] ?? ""),
            telefone: String(cliente?.['telefone'] ?? ""),
            email: String(cliente?.['email'] ?? ""),
          },
          uf: String(cliente?.['uf'] ?? ""),
          contribuinte: !!cliente?.['contribuinte'],
          tipoNf,
          faturarClienteFinal,
          finalidadeUso: finalidadeUso || null,
          faturamento: { ...fat, contribuinte: fatTipoDoc === "cnpj" ? fatContribuinte : false },
          formaPagamento: formaPagamento || null,
          condicaoPagamento: condicaoPagamento || null,
          entregaDiferente,
          entrega: entregaDiferente
            ? entrega
            : {
                cep: String(cliente?.['cep'] ?? ""),
                logradouro: String(cliente?.['logradouro'] ?? ""),
                numero: String(cliente?.['numero'] ?? ""),
                complemento: String(cliente?.['complemento'] ?? ""),
                bairro: String(cliente?.['bairro'] ?? ""),
                cidade: String(cliente?.['cidade'] ?? ""),
                uf: String(cliente?.['uf'] ?? ""),
              },
          freteMod,
          freteAreaRural: areaRural,
          freteValor,
          freteBonificado: freteBonificado && (freteMod === "CIF" || freteMod === "DEDICADO"),
          transportadora,
          cupomCodigo: cupomCodigo || null,
          observacoes: observacoes || null,
          // Guarda o estado completo da etapa 3 para que reabrir a proposta
          // devolva exatamente o que foi salvo (modo + entradas da calculadora).
          calculo: {
            ...(resultado ? { distribuicao: resultado.distribuicao, comprimentos: resultado.comprimentos } : {}),
            modo,
            ...(modo === "calculadora"
              ? {
                  assinatura: assinaturaCalc,
                  resultado,
                  entrada: {
                    geradorId,
                    microModelo,
                    microQtd,
                    moduloId,
                    modPersonalizado,
                    paineis,
                    tamanhoTrilho,
                    linhas,
                  },
                  itens: itensCalc.map((i) => ({
                    produtoId: i.produtoId,
                    qtd: i.qtd,
                    valor: i.valor,
                    origem: i.origem,
                    ...(i.avulso ? { avulso: i.avulso } : {}),
                  })),
                }
              : {}),
          },
          itens: itens.map((i) => ({ produtoId: i.produtoId, qtd: i.qtd })),
        },
      });
      setPropostaId(r.id);
      setNumero(r.numero);
      await queryClient.invalidateQueries({ queryKey: ["solar-proposals"] });

      if (!concluir) {
        toast.success(`Proposta ${r.numero} salva.`);
        return;
      }

      // Conclusão real: cria a ordem no SAP, gera a cobrança e envia ao Salesforce.
      // Nada é silencioso — o resultado (ou o erro) aparece no pop-up.
      try {
        // O servidor valida a conclusão como etapa 4 (Finalização).
        const linha = await concluirPropostaFn({ data: { id: r.id, origem: "portal", etapa: 5 } });
        await queryClient.invalidateQueries({ queryKey: ["solar-proposals"] });
        if (linha?.already_concluded) {
          toast.info(`Pedido ${r.numero} já havia sido concluído (${linha.status}).`);
          void navigate({ to: "/solar/propostas" });
          return;
        }
        setResultadoConclusao({
          numero: r.numero,
          status: String(linha?.status ?? "Aguardando Pagamento"),
          sapOv: (linha?.sapOv ?? null) as ResultadoConclusao["sapOv"],
          salesforce: (linha?.salesforce ?? null) as ResultadoConclusao["salesforce"],
          cobranca: (linha?.cobranca ?? null) as ResultadoConclusao["cobranca"],
        });
      } catch (e) {
        const msg = (e as Error).message || "Falha ao concluir o pedido.";
        setResultadoConclusao({ numero: r.numero, status: "", erro: msg });
        toast.error(msg, { duration: 12000 });
      }
    } catch (e) {
      toast.error((e as Error).message, { duration: 12000 });
    } finally {
      setSalvando(false);
    }
  }


  const destino = {
    uf: entregaDiferente ? String(entrega['uf'] ?? "") : String(cliente?.['uf'] ?? ""),
    cidade: entregaDiferente ? String(entrega['cidade'] ?? "") : String(cliente?.['cidade'] ?? ""),
    cep: entregaDiferente ? String(entrega['cep'] ?? "") : String(cliente?.['cep'] ?? ""),
  };

  /** Dados da proposta para o PDF. */
  /** Alíquotas fiscais da linha (IPI/ICMS/PIS-COFINS) pelo NCM do material. */
  function aliquotasItem(ncmId: string | null) {
    const cfg = fiscalCfgQ.data;
    if (!cfg) return null;
    const ncm = ncmId ? ((ncmsQ.data ?? []).find((n) => n.id === ncmId) ?? null) : null;
    const uf = faturarClienteFinal
      ? String(fat['uf'] ?? "")
      : String(cliente?.['uf'] ?? "");
    const contribuinte = faturarClienteFinal
      ? fatContribuinte
      : cliente?.['contribuinte'] === true;
    return aliquotasDoItem({
      uf,
      contribuinte,
      regimeTributario: (cliente?.['regime_tributario'] as string | null) ?? null,
      finalidade: finalidadeUsoDoCadastro(
        finalidadeUso || (cliente?.['finalidade_uso'] as string | null) || null,
      ),
      ncm,
      config: cfg,
    });
  }

  function montarPdfDados() {
    const linhasEnd = (o: Record<string, any>) =>
      [
        [o['logradouro'], o['numero']].filter(Boolean).join(", "),
        [o['complemento'], o['bairro']].filter(Boolean).join(" · "),
        cidadeUfCep(o['cidade'], o['uf'], o['cep'], ""),
      ].filter((l) => String(l ?? "").trim());

    const faturamentoBase = faturarClienteFinal ? fat : (cliente ?? {});
    return {
      numero,
      propostaNome,
      cliente: {
        nome: String(cliente?.['razao_social'] ?? "—"),
        doc: String(cliente?.['doc'] ?? ""),
        ie: String(cliente?.['ie'] ?? ""),
        email: String(cliente?.['email'] ?? ""),
        telefone: String(cliente?.['telefone'] ?? ""),
        uf: String(cliente?.['uf'] ?? ""),
        cidade: String(cliente?.['cidade'] ?? ""),
      },
      consultor: String(cliente?.['created_by_nome'] ?? ""),
      itens: itens.map((i) => {
        const p = produtos.find((x) => x.id === i.produtoId);
        const aliq = aliquotasItem(p?.ncm_id ?? null);
        return {
          codigo: i.avulso?.codigo ?? p?.codigo ?? null,
          nome: i.avulso?.descricao ?? p?.descricao ?? "Item",
          qtd: i.qtd,
          valor: i.valor,
          ipiRate: aliq?.ipi ?? null,
          icmsRate: aliq?.icms ?? null,
          pisCofinsRate: aliq?.pisCofins ?? null,
        };
      }),

      subtotal,
      desconto,
      cupom: cupomCodigo || null,
      freteMod,
      freteValor,
      freteGratis,
      freteBonificado: bonificado,
      transportadora: transportadora?.nome ?? null,
      total,
      listaPreco,
      tipoNf,
      formaPagamento: formaPagamento || null,
      observacoes,
      enderecoFaturamento: {
        nome: String(faturamentoBase['nome'] ?? faturamentoBase['razao_social'] ?? cliente?.['razao_social'] ?? ""),
        doc: String(faturamentoBase['doc'] ?? ""),
        linhas: linhasEnd(faturamentoBase),
      },
      enderecoEntrega: entregaDiferente
        ? {
            contato: String(entrega['contato'] ?? ""),
            telefone: String(entrega['telefone'] ?? ""),
            linhas: linhasEnd(entrega),
          }
        : { nome: "Mesmo do faturamento", linhas: linhasEnd(faturamentoBase) },
      estrutura: resultado?.ok
        ? { distribuicao: resultado.distribuicao, comprimentos: resultado.comprimentos }
        : null,
    };
  }

  /** Bloqueios para emitir a proposta em PDF. */
  function validarParaPdf(): string | null {
    if (!itens.length) return "Adicione produtos antes de gerar o PDF.";
    if (!formaPagamento) return "Selecione a forma de pagamento antes de gerar a proposta.";
    if (!condicaoPagamento) return "Selecione a condição de pagamento (ZTERM) antes de gerar a proposta.";
    return null;
  }

  /** Abre a prévia da proposta (modal). */
  function abrirPreviewPdf() {
    const erro = validarParaPdf();
    if (erro) {
      setTentou(true);
      return toast.error(erro);
    }
    setPdfHtml(buildSolarPropostaPdfHtml(montarPdfDados()));
    setPreviewAberto(true);
  }

  // Prévia em tempo real: enquanto o modal está aberto, o HTML é regerado a
  // cada mudança de dados (setState com string idêntica não re-renderiza).
  useEffect(() => {
    if (!previewAberto) return;
    try {
      const html = buildSolarPropostaPdfHtml(montarPdfDados());
      setPdfHtml((atual) => (atual === html ? atual : html));
    } catch {
      /* dados incompletos durante a edição — mantém a última prévia válida */
    }
  });


  /** Baixa/imprime a proposta em PDF. */
  function baixarPdf() {
    const erro = validarParaPdf();
    if (erro) {
      setTentou(true);
      return toast.error(erro);
    }
    const dados = montarPdfDados();
    const html = buildSolarPropostaPdfHtml(dados);
    const win = window.open("", "_blank");
    if (!win) return toast.error("Permita pop-ups para gerar o PDF.");
    win.document.write(html);
    win.document.title = solarPropostaPdfFileName(dados);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  }


  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-primary font-semibold">2P Solar</div>
            <h1 className="text-2xl sm:text-3xl font-bold mt-1">
              {propostaId ? `Proposta ${numero ?? ""}` : "Nova proposta"}
            </h1>
          </div>
          <div className="text-sm text-muted-foreground">
            Etapa {etapa} de 5 — {ETAPAS[etapa - 1]}
          </div>
        </div>

        {/* Trilha de etapas */}
        <div className="glass rounded-2xl p-3 flex flex-wrap gap-2">
          {ETAPAS.map((e, i) => (
            <button
              key={e}
              type="button"
              onClick={() => setEtapa(((i + 1) as 1 | 2 | 3 | 4 | 5))}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-colors",
                etapa === i + 1
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:bg-surface-2",
              )}
            >
              {i + 1}. {e}
            </button>
          ))}
        </div>

        {etapa === 1 && (
          <section className="glass rounded-2xl p-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Campo label="Nome da proposta *">
                <Input
                  value={propostaNome}
                  onChange={(e) => setPropostaNome(e.target.value)}
                  placeholder="Ex.: Usina 32 módulos — Galpão 3"
                />
                {tentou && !propostaNome.trim() && <Erro>Obrigatório.</Erro>}
              </Campo>
              <Campo label="Cliente *">
                <SeletorPesquisavel
                  value={clienteDoc}
                  onValueChange={setClienteDoc}
                  opcoes={(clientesQ.data ?? []).map((c: any) => ({
                    value: String(c.doc),
                    label: `${c.razao_social} — ${c.doc}`,
                  }))}
                  placeholder="Digite para pesquisar no cadastro de clientes"
                  vazio="Nenhum cliente encontrado."
                />

                {tentou && !cliente && <Erro>Selecione o cliente.</Erro>}
              </Campo>
              <Campo label="O projeto já foi vendido para o cliente final?">
                <Select value={vendido} onValueChange={(v) => setVendido(v as typeof vendido)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="estoque">Estoque</SelectItem>
                  </SelectContent>
                </Select>
              </Campo>
              <Campo label={`Previsão de fechamento${vendido === "sim" ? " *" : ""}`}>
                <Input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
                {tentou && vendido === "sim" && !previsao && <Erro>Obrigatório para projeto vendido.</Erro>}
              </Campo>
            </div>
            {cliente && (
              <div className="rounded-xl border border-border bg-surface-2 p-3 text-sm grid gap-1 sm:grid-cols-3">
                <div><b>UF:</b> {String(cliente['uf'] ?? "—")}</div>
                <div><b>Cidade:</b> {String(cliente['cidade'] ?? "—")}</div>
                <div><b>Consultor:</b> {String(cliente['created_by_nome'] ?? "—")}</div>
              </div>
            )}
          </section>
        )}

        {etapa === 2 && (
          <section className="glass rounded-2xl p-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Campo label="Tipo de NF">
                <Select value={tipoNf} onValueChange={setTipoNf}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="venda">Venda</SelectItem>
                    <SelectItem value="triangulacao">Triangulação</SelectItem>
                    <SelectItem value="bonificacao">Bonificação</SelectItem>
                  </SelectContent>
                </Select>
              </Campo>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={faturarClienteFinal}
                onCheckedChange={(v) => setFaturarClienteFinal(v === true)}
              />
              Faturar direto para o cliente final
            </label>
            {faturarClienteFinal && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">O cliente final é:</span>
                  <div className="inline-flex rounded-xl border border-border bg-surface-2 p-1">
                    {([
                      ["cnpj", "CNPJ", Building2],
                      ["cpf", "CPF", User],
                    ] as const).map(([v, label, Icon]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFatTipoDoc(v)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                          fatTipoDoc === v
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "text-muted-foreground hover:bg-surface-3",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" /> {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <Campo label={fatTipoDoc === "cnpj" ? "CNPJ" : "CPF"}>
                    <div className="flex gap-2">
                      <Input
                        value={fat['doc'] ?? ""}
                        inputMode="numeric"
                        placeholder={fatTipoDoc === "cnpj" ? "00.000.000/0000-00" : "000.000.000-00"}
                        onChange={(e) => setFat((p) => ({ ...p, doc: e.target.value }))}
                      />
                      {fatTipoDoc === "cnpj" && (
                        <Button
                          type="button"
                          variant="outline"
                          className="gap-2 whitespace-nowrap"
                          disabled={enriquecendo}
                          onClick={() => void enriquecerFaturamento()}
                        >
                          {enriquecendo ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                          Buscar
                        </Button>
                      )}
                    </div>
                  </Campo>
                  <Campo label={fatTipoDoc === "cnpj" ? "Razão social" : "Nome completo"}>
                    <Input
                      value={fat['nome'] ?? ""}
                      onChange={(e) => setFat((p) => ({ ...p, nome: e.target.value }))}
                    />
                  </Campo>
                  {fatTipoDoc === "cnpj" && (
                    <Campo label="Inscrição estadual">
                      <Input
                        value={fat['ie'] ?? ""}
                        onChange={(e) => setFat((p) => ({ ...p, ie: e.target.value }))}
                      />
                    </Campo>
                  )}
                  <Campo label="CEP">
                    <CepInput
                      value={fat['cep'] ?? ""}
                      onChange={(v) => setFat((p) => ({ ...p, cep: v }))}
                      onFound={(e: EnderecoCep) =>
                        setFat((p) => ({
                          ...p,
                          cep: e.cep,
                          logradouro: e.logradouro || (p['logradouro'] ?? ""),
                          complemento: e.complemento || (p['complemento'] ?? ""),
                          bairro: e.bairro || (p['bairro'] ?? ""),
                          cidade: e.cidade || (p['cidade'] ?? ""),
                          uf: e.uf || (p['uf'] ?? ""),
                        }))
                      }
                    />
                  </Campo>
                  {[
                    ["logradouro", "Logradouro"],
                    ["numero", "Número"],
                    ["complemento", "Complemento"],
                    ["bairro", "Bairro"],
                    ["cidade", "Cidade"],
                    ["uf", "UF"],
                    ["telefone", "Telefone"],
                  ].map(([k, label]) => (
                    <Campo key={k} label={label as string}>
                      <Input
                        value={fat[k as string] ?? ""}
                        onChange={(e) => setFat((p) => ({ ...p, [k as string]: e.target.value }))}
                      />
                    </Campo>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Campo label="Finalidade de uso">
                    <Select value={finalidadeUso} onValueChange={setFinalidadeUso}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Revenda">Revenda</SelectItem>
                        <SelectItem value="Industrialização">Industrialização</SelectItem>
                        <SelectItem value="Uso e Consumo">Uso e Consumo</SelectItem>
                      </SelectContent>
                    </Select>
                    {tentou && !finalidadeUso && <Erro>Obrigatória para faturar o cliente final.</Erro>}
                  </Campo>
                  {fatTipoDoc === "cnpj" && (
                    <label className="flex items-end gap-2 text-sm pb-2">
                      <Checkbox
                        checked={fatContribuinte}
                        onCheckedChange={(v) => setFatContribuinte(v === true)}
                      />
                      Cliente final é contribuinte de ICMS
                    </label>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Dados buscados automaticamente (CNPJ e CEP) continuam editáveis. Sem retorno das
                  consultas, preencha manualmente.
                </p>
              </div>
            )}
          </section>
        )}

        {etapa === 3 && (
          <section className="space-y-5 relative">
            {trocando && (
              <div className="absolute inset-0 z-30 grid place-items-start justify-center rounded-2xl bg-background/70 backdrop-blur-sm">
                <div className="sticky top-24 flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3 text-sm font-medium shadow-lg">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  Atualizando itens e valores…
                </div>
              </div>
            )}

            {diagnosticoBloqueio && (
              <BloqueioPrecificacaoAlert
                diagnostico={diagnosticoBloqueio}
                onRecalcular={() => void recalcularPrecos()}
                recalculando={trocando}
              />
            )}



            <div className="glass rounded-2xl p-5 space-y-4">
              <div className="grid gap-4 lg:grid-cols-12">
                {/* Seleção consolidada estilo slide */}
                <div className="lg:col-span-5">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    Como montar a proposta
                  </div>
                  <div className="relative grid grid-cols-2 gap-1 rounded-2xl border border-border bg-surface-2 p-1">
                    <span
                      aria-hidden
                      className={cn(
                        "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-primary/15 border border-primary/40 transition-transform duration-300 ease-out",
                        modo === "lista" && "translate-x-[calc(100%+0.25rem)]",
                      )}
                    />
                    <SlideOpcao
                      ativo={modo === "calculadora"}
                      icon={Calculator}
                      titulo="Calcular"
                      descricao="Calculadora 2P"
                      onClick={() => void trocarModo("calculadora")}
                    />
                    <SlideOpcao
                      ativo={modo === "lista"}
                      icon={ListPlus}
                      titulo="Lista de produtos"
                      descricao="Catálogo SAP"
                      onClick={() => void trocarModo("lista")}
                    />
                  </div>
                </div>

                {/* É kit? — resposta obrigatória, impacta as etapas seguintes */}
                <div className="lg:col-span-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    A venda é kit?
                  </div>
                  <div className="relative grid grid-cols-2 gap-1 rounded-2xl border border-border bg-surface-2 p-1">
                    <span
                      aria-hidden
                      className={cn(
                        "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-primary/15 border border-primary/40 transition-all duration-300 ease-out",
                        ehKit === false && "translate-x-[calc(100%+0.25rem)]",
                      )}
                    />
                    <SlideOpcao
                      ativo={ehKit === true}
                      icon={Package}
                      titulo="Sim"
                      onClick={() => setEhKit(true)}
                    />
                    <SlideOpcao
                      ativo={ehKit === false}
                      icon={ListPlus}
                      titulo="Não"
                      onClick={() => setEhKit(false)}
                    />
                  </div>
                </div>

                {/* Tabela de preço — versão compacta */}
                <div className="lg:col-span-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    Tabela de preço
                  </div>
                  <div className="relative grid grid-cols-5 gap-0.5 rounded-2xl border border-border bg-surface-2 p-1">
                    <span
                      aria-hidden
                      className="absolute inset-y-1 left-1 w-[calc(20%-0.1rem)] rounded-xl bg-primary/15 border border-primary/40 transition-transform duration-300 ease-out"
                      style={{
                        transform: `translateX(calc(${TABELAS_PRECO.findIndex((t) => t.value === listaPreco)} * (100% + 0.125rem)))`,
                      }}
                    />
                    {TABELAS_PRECO.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        aria-pressed={listaPreco === t.value}
                        title={`Tabela ${t.value}`}
                        disabled={trocando}
                        onClick={() => void trocarTabela(t.value)}
                        className={cn(
                          "relative z-10 rounded-xl px-1 py-3 text-center text-sm tabular-nums transition-colors",
                          listaPreco === t.value
                            ? "text-foreground font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t.value}
                      </button>
                    ))}
                  </div>
                </div>
              </div>


              {modo === "calculadora" && (
                <div className="space-y-5">
                  <fieldset disabled={calcTravado} className={cn("space-y-5", calcTravado && "opacity-70")}>
                  <div className="grid gap-4 md:grid-cols-3">

                    <Campo label="Módulo">
                      <SeletorPesquisavel
                        value={moduloId}
                        onValueChange={setModuloId}
                        placeholder="Pesquisar módulo"
                        vazio="Nenhum módulo encontrado."
                        opcoes={modulosOrdenados.map((m) => ({
                          value: m.id,
                          label: `${m.nome}${m.personalizado ? "" : ` (${m.largura}×${m.altura}×${m.espessura} mm)`}`,
                        }))}
                      />
                    </Campo>
                    <Campo label="Altura (mm)">
                      <Input
                        value={modulo?.personalizado ? modPersonalizado.altura : String(modulo?.altura ?? "")}
                        disabled={!modulo?.personalizado}
                        onChange={(e) =>
                          setModPersonalizado((p) => ({ ...p, altura: e.target.value.replace(/\D/g, "") }))
                        }
                      />
                    </Campo>
                    <Campo label="Largura (mm)">
                      <Input
                        value={modulo?.personalizado ? modPersonalizado.largura : String(modulo?.largura ?? "")}
                        disabled={!modulo?.personalizado}
                        onChange={(e) =>
                          setModPersonalizado((p) => ({ ...p, largura: e.target.value.replace(/\D/g, "") }))
                        }
                      />
                    </Campo>
                    <Campo label="Espessura (mm)">
                      <Input
                        value={
                          modulo?.personalizado ? modPersonalizado.espessura : String(modulo?.espessura ?? "")
                        }
                        disabled={!modulo?.personalizado}
                        onChange={(e) =>
                          setModPersonalizado((p) => ({ ...p, espessura: e.target.value.replace(/\D/g, "") }))
                        }
                      />
                    </Campo>
                    <Campo label="Quantidade de painéis">
                      <Input value={paineis} onChange={(e) => setPaineis(e.target.value.replace(/\D/g, ""))} />
                    </Campo>
                    <Campo label="Tipo de gerador">
                      <Select
                        value={geradorId}
                        onValueChange={(v) => {
                          setGeradorId(v);
                          setMicroModelo("");
                          setMicroQtd("");
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {(geradoresQ.data ?? []).map((g) => (
                            <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Campo>

                    {geradorPedeQuantidade && (
                      <>
                        {geradorEhMicro && (
                          <Campo label="Modelo do microinversor">
                            <Select
                              value={microModelo}
                              onValueChange={(v) => {
                                setMicroModelo(v);
                                 const m = (microinversoresQ.data ?? []).find((x) => x.id === v);
                                if (m && paineis)
                                   setMicroQtd(String(Math.ceil((paineisNasLinhas || Number(paineis) || 0) / Math.max(1, m.modulos_por_unidade))));
                              }}
                            >
                              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                              <SelectContent>
                                {(microinversoresQ.data ?? []).map((m) => (
                                  <SelectItem key={m.id} value={m.id}>
                                    {m.nome} ({m.modulos_por_unidade} módulos/un.)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Campo>
                        )}
                        <Campo
                          label={`Quantidade de ${geradorEhMicro ? "microinversores" : "otimizadores"}`}
                        >
                          <Input
                            value={microQtd}
                            placeholder={microSugerido ? `Sugerido: ${microSugerido}` : ""}
                            onChange={(e) => setMicroQtd(e.target.value.replace(/\D/g, ""))}
                          />
                        </Campo>
                      </>
                    )}

                    <Campo label="Tamanho dos trilhos">
                      <Select value={tamanhoTrilho} onValueChange={setTamanhoTrilho}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {TAMANHOS_TRILHO.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Campo>
                  </div>

                  {/* Disposição dos painéis nas fileiras */}
                  <div className="rounded-xl border border-border bg-surface-2 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">Disposição dos painéis nas fileiras</div>
                        <div className="text-xs text-muted-foreground">
                          {paineisNasLinhas} painel(is) distribuído(s)
                          {paineis ? ` de ${paineis} informado(s)` : ""}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => setLinhas((p) => [...p, novaFileira()])}
                      >
                        <Plus className="h-3.5 w-3.5" /> Adicionar fileira
                      </Button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[900px]">
                        <thead>
                          <tr className="text-[11px] uppercase text-muted-foreground border-b border-border">
                            <th className="text-left py-2 pr-2">Trilhos</th>
                            <th className="text-left py-2 px-2">Suporte</th>
                            <th className="text-left py-2 px-2">Fileiras</th>
                            <th className="text-left py-2 px-2">Módulos</th>
                            <th className="text-left py-2 px-2">Orientação</th>
                            <th className="text-left py-2 px-2">Vão máx. (m)</th>
                            <th className="text-left py-2 px-2">Balanço (m)</th>
                            <th className="py-2 pl-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {linhas.map((l) => (
                            <tr key={l.key} className="border-b border-border/50 align-top">
                              <td className="py-2 pr-2">
                                <Select
                                  value={l.trilhoId}
                                  onValueChange={(v) =>
                                    setLinhas((p) =>
                                      p.map((x) =>
                                        x.key === l.key ? { ...x, trilhoId: v, suporteId: "" } : x,
                                      ),
                                    )
                                  }
                                >
                                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                  <SelectContent>
                                    {(trilhosQ.data ?? []).map((t) => (
                                      <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="py-2 px-2">
                                <Select
                                  value={l.suporteId}
                                  disabled={!l.trilhoId}
                                  onValueChange={(v) =>
                                    setLinhas((p) =>
                                      p.map((x) => (x.key === l.key ? { ...x, suporteId: v } : x)),
                                    )
                                  }
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue placeholder={l.trilhoId ? "Selecione" : "Escolha o trilho"} />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-[320px]">
                                    {suportesDe(l.trilhoId).map((s) => (
                                      <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="py-2 px-2">
                                <Input
                                  className="h-9 w-20"
                                  value={l.fileiras}
                                  onChange={(e) =>
                                    setLinhas((p) =>
                                      p.map((x) =>
                                        x.key === l.key
                                          ? { ...x, fileiras: e.target.value.replace(/\D/g, "") }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                              </td>
                              <td className="py-2 px-2">
                                <Input
                                  className="h-9 w-20"
                                  value={l.modulos}
                                  onChange={(e) =>
                                    setLinhas((p) =>
                                      p.map((x) =>
                                        x.key === l.key
                                          ? { ...x, modulos: e.target.value.replace(/\D/g, "") }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                              </td>
                              <td className="py-2 px-2">
                                <Select
                                  value={l.orientacao}
                                  disabled={!!orientacaoTravada(l)}
                                  onValueChange={(v) =>
                                    setLinhas((p) =>
                                      p.map((x) =>
                                        x.key === l.key ? { ...x, orientacao: v as Orientacao } : x,
                                      ),
                                    )
                                  }
                                >
                                  <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="R">Retrato</SelectItem>
                                    <SelectItem value="P">Paisagem</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="py-2 px-2">
                                <Input
                                  className="h-9 w-24"
                                  value={l.distMax}
                                  disabled={semVao(l)}
                                  placeholder={semVao(l) ? "—" : padroesLinha(l).dist}
                                  onChange={(e) =>
                                    setLinhas((p) =>
                                      p.map((x) =>
                                        x.key === l.key
                                          ? { ...x, distMax: e.target.value.replace(/[^\d.,]/g, "").replace(",", ".") }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                                {!semVao(l) && (
                                  <button
                                    type="button"
                                    className="mt-1 block text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                                    onClick={() =>
                                      setLinhas((p) =>
                                        p.map((x) => (x.key === l.key ? { ...x, distMax: padroesLinha(l).dist } : x)),
                                      )
                                    }
                                  >
                                    padrão {padroesLinha(l).dist.replace(".", ",")} m
                                  </button>
                                )}
                              </td>
                              <td className="py-2 px-2">
                                <Input
                                  className="h-9 w-24"
                                  value={l.balanco}
                                  disabled={semVao(l)}
                                  placeholder={semVao(l) ? "—" : padroesLinha(l).balanco}
                                  onChange={(e) =>
                                    setLinhas((p) =>
                                      p.map((x) =>
                                        x.key === l.key
                                          ? { ...x, balanco: e.target.value.replace(/[^\d.,]/g, "").replace(",", ".") }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                                {!semVao(l) && (
                                  <button
                                    type="button"
                                    className="mt-1 block text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                                    onClick={() =>
                                      setLinhas((p) =>
                                        p.map((x) =>
                                          x.key === l.key ? { ...x, balanco: padroesLinha(l).balanco } : x,
                                        ),
                                      )
                                    }
                                  >
                                    padrão {padroesLinha(l).balanco.replace(".", ",")} m
                                  </button>
                                )}
                              </td>


                              <td className="py-2 pl-2 text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Remover fileira"
                                  disabled={linhas.length === 1}
                                  onClick={() => setLinhas((p) => p.filter((x) => x.key !== l.key))}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  </fieldset>

                  {!calcTravado && faltandoInputs.length > 0 && (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm space-y-1">
                      <div className="font-semibold text-amber-600 dark:text-amber-400">
                        Complete as etapas 1 e 2 para calcular
                      </div>
                      <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
                        {faltandoInputs.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!calcTravado && !faltandoInputs.length && pendenciasCodigos.length > 0 && (
                    <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm space-y-2">
                      <div className="font-semibold text-destructive">
                        De/para incompleto — cadastre os códigos de produto antes de calcular
                      </div>
                      <ul className="space-y-1">
                        {pendenciasCodigos.map((p) => (
                          <li key={p.chave} className="text-muted-foreground">
                            <span className="font-medium text-foreground">{p.origem}</span> · {p.campo}
                            <span className="text-xs"> — {p.descricao}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="text-xs text-muted-foreground">
                        Preencha em Gestão de Produtos 2P Solar (Trilhos / Suportes) ou na Configuração da calculadora.
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={() => void realizarProposta()}
                      disabled={calculando || calcTravado || bloqueiaCalculo}
                      className="gap-2"
                    >
                      {calculando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                      {calcTravado ? "Cálculo concluído" : "Calcular"}
                    </Button>

                    {calcTravado && (
                      <Button type="button" variant="outline" className="gap-2" onClick={liberarEdicaoCalculo}>
                        <Pencil className="h-4 w-4" /> Editar inputs de cálculo
                      </Button>
                    )}
                    {calcDesatualizado && (
                      <span className="text-xs font-medium text-destructive">
                        Os dados mudaram desde o último cálculo. Clique em Calcular novamente.
                      </span>
                    )}
                  </div>



                  {resultado?.ok && (
                    <div className="md:col-span-3 rounded-xl border border-border bg-surface-2 p-4 text-sm space-y-1 animate-fade-in">
                      <div className="font-semibold">Resultado da quantificação</div>
                      <div className="text-muted-foreground">
                        Fileiras: {resultado.distribuicao.join(" + ")} painéis · Comprimentos:{" "}
                        {resultado.comprimentos.map((c) => `${(c / 1000).toFixed(2)} m`).join(", ")}
                      </div>
                      {resultado.avisos.map((a) => (
                        <div key={a} className="text-amber-500">{a}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {modo === "lista" && (
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Campo label="Adicionar produto do catálogo">
                      <SeletorPesquisavel
                        value=""
                        onValueChange={(id) => adicionarProdutoEm(id, "lista")}
                        opcoes={produtos.map((p) => ({
                          value: p.id,
                          label: `${p.codigo} — ${p.descricao}`,
                        }))}
                        placeholder="Digite para buscar produto"
                        vazio="Nenhum produto no catálogo."
                      />
                    </Campo>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Só é possível incluir produtos ativos do catálogo SAP.
                  </p>
                </div>
              )}


            </div>

            <div className="glass rounded-2xl overflow-hidden">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-xs text-muted-foreground uppercase border-b border-border">
                    <th className="text-left px-4 py-3">Produto</th>
                    <th className="text-center px-4 py-3">Qtd.</th>
                    <th className="text-right px-4 py-3">Unitário</th>
                    <th className="text-right px-4 py-3">Total</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {itensOrdenados.map((i, idx, arr) => {
                    const p = produtos.find((x) => x.id === i.produtoId);
                    const descricao = i.avulso?.descricao ?? p?.descricao ?? "—";
                    const codigo = i.avulso?.codigo ?? p?.codigo ?? "";
                    
                    return (
                      <Fragment key={i.key}>
                      {modo === "calculadora" && i.origem === "manual" && arr[idx - 1]?.origem !== "manual" && (
                        <tr className="bg-surface-2/70">
                          <td colSpan={5} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Itens extras — fora do cálculo da estrutura
                          </td>
                        </tr>
                      )}
                      <tr className="border-b border-border/50">

                        <td className="px-4 py-3">
                          <div className="font-medium">{descricao}</div>
                          <div className="text-xs text-muted-foreground">
                            {codigo} {i.origem === "calculadora" ? "· Calculadora 2P" : ""}
                            {!i.valor && !i.avulso ? " · sem preço no SAP" : ""}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Diminuir"
                              onClick={() =>
                                setItens((prev) =>
                                  prev.map((x) =>
                                    x.key === i.key ? { ...x, qtd: Math.max(1, x.qtd - 1) } : x,
                                  ),
                                )
                              }
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <Input
                              className="h-8 w-16 text-center tabular-nums"
                              aria-label="Quantidade"
                              value={String(i.qtd)}
                              onChange={(e) => {
                                const q = Number(e.target.value.replace(/\D/g, ""));
                                setItens((prev) =>
                                  prev.map((x) => (x.key === i.key ? { ...x, qtd: q } : x)),
                                );
                              }}
                              onBlur={() =>
                                setItens((prev) =>
                                  prev.map((x) =>
                                    x.key === i.key ? { ...x, qtd: Math.max(1, x.qtd || 1) } : x,
                                  ),
                                )
                              }
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Aumentar"
                              onClick={() =>
                                setItens((prev) =>
                                  prev.map((x) => (x.key === i.key ? { ...x, qtd: x.qtd + 1 } : x)),
                                )
                              }
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtBRL(i.valor)}</td>

                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {fmtBRL(i.valor * i.qtd)}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Remover"
                            onClick={() => setItens((prev) => prev.filter((x) => x.key !== i.key))}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                      </Fragment>
                    );

                  })}
                  {!itens.length && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                        Nenhum item na proposta.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {modo === "calculadora" && (
                <div className="border-t border-border bg-surface-2 p-4 space-y-3">
                  <div>
                    <div className="text-sm font-semibold">Itens extras</div>
                    <div className="text-xs text-muted-foreground">Produtos adicionais que não fazem parte do cálculo da estrutura.</div>
                  </div>
                  <div className="max-w-xl">
                    <SeletorPesquisavel
                      value=""
                      onValueChange={(id) => adicionarProdutoEm(id, "calculadora")}
                      placeholder="Pesquisar produto por código ou nome"
                      vazio="Nenhum produto encontrado."
                      opcoes={produtos.map((p) => ({ value: p.id, label: `${p.codigo} — ${p.descricao}` }))}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {etapa === 4 && (
          <section className="glass rounded-2xl p-5 space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={entregaDiferente}
                onCheckedChange={(v) => {
                  setEntregaDiferente(v === true);
                  setTransportadora(null);
                }}
              />
              Endereço de entrega diferente do cadastro
            </label>
            {entregaDiferente && (
              <div className="grid gap-3 md:grid-cols-3">
                <Campo label="CEP">
                  <CepInput
                    value={entrega['cep'] ?? ""}
                    onChange={(v) => setEntrega((p) => ({ ...p, cep: v }))}
                    onFound={(e: EnderecoCep) => {
                      setEntrega((p) => ({
                        ...p,
                        cep: e.cep,
                        logradouro: e.logradouro || (p['logradouro'] ?? ""),
                        complemento: e.complemento || (p['complemento'] ?? ""),
                        bairro: e.bairro || (p['bairro'] ?? ""),
                        cidade: e.cidade || (p['cidade'] ?? ""),
                        uf: e.uf || (p['uf'] ?? ""),
                      }));
                      setTransportadora(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Preenchimento automático; campos abaixo continuam editáveis.
                  </p>
                </Campo>
                {[
                  ["logradouro", "Logradouro"],
                  ["numero", "Número"],
                  ["complemento", "Complemento"],
                  ["bairro", "Bairro"],
                  ["cidade", "Cidade"],
                  ["uf", "UF"],
                  ["contato", "Contato"],
                  ["telefone", "Telefone"],
                ].map(([k, label]) => (
                  <Campo key={k} label={label as string}>
                    <Input
                      value={entrega[k as string] ?? ""}
                      onChange={(e) => setEntrega((p) => ({ ...p, [k as string]: e.target.value }))}
                    />
                  </Campo>
                ))}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <Campo label="Modalidade de frete *">
                <Select
                  value={freteMod}
                  onValueChange={(v) => {
                    setFreteMod(v);
                    setTransportadora(null);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FOB">FOB (retirada do cliente)</SelectItem>
                    <SelectItem value="CIF">CIF (por nossa conta)</SelectItem>
                    <SelectItem value="DEDICADO">Dedicado</SelectItem>
                  </SelectContent>
                </Select>
                {tentou && !freteMod && <Erro>Escolha a modalidade.</Erro>}
              </Campo>
              {(freteMod === "CIF" || freteMod === "DEDICADO") && (
                <div className="flex flex-wrap items-end gap-x-6 gap-y-2 pb-2">
                  {freteMod === "CIF" && (
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={areaRural} onCheckedChange={(v) => setAreaRural(v === true)} />
                      Entrega em área rural
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={freteBonificado}
                      onCheckedChange={(v) => setFreteBonificado(v === true)}
                    />
                    Frete grátis
                  </label>
                </div>
              )}
            </div>

            {freteMod === "DEDICADO" && (
              <FreteDedicado selecionada={transportadora} onSelect={setTransportadora} />
            )}

            {freteMod === "CIF" && freteItens.pendencias.length > 0 && (
              <Erro>
                {`Cotação bloqueada — ${freteItens.pendencias.length} item(ns) sem código SAP numérico, o peso ficaria incompleto: ${freteItens.pendencias.join("; ")}.`}
              </Erro>
            )}

            {freteMod === "CIF" && freteItens.pendencias.length === 0 && (
              <FreteCotacao
                unidade="solar"
                itens={freteItens.lista}
                valorNota={subtotal - desconto}
                destino={destino}
                areaRural={areaRural}
                documento={String(cliente?.['doc'] ?? "")}
                selecionada={transportadora}
                onSelect={setTransportadora}
                onInvalidate={() => setTransportadora(null)}
                onLoadingChange={setFreteCotando}
              />
            )}


            {tentou && erros.length > 0 && <Erro>{erros[0]}</Erro>}
          </section>
        )}

        {etapa === 5 && (
          <section className="space-y-5">
            <div className="glass rounded-2xl p-5 space-y-4">
              <h2 className="text-lg font-semibold">Resumo do pedido</h2>
              <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Proposta" value={propostaNome || "—"} />
                <Info label="Cliente" value={String(cliente?.['razao_social'] ?? "—")} />
                <Info label="CNPJ" value={String(cliente?.['doc'] ?? "—")} />
                <Info label="Tabela de preço" value={`Tabela ${listaPreco}`} />
                <Info label="Venda em kit" value={ehKit ? "Sim" : "Não"} />
                <Info label="Tipo de NF" value={tipoNf} />
                <Info
                  label="Cidade / UF de destino"
                  value={cidadeUf(destino.cidade, destino.uf)}
                />

                <Info label="Forma de pagamento" value={formaPagamento || "—"} />
                <Info label="Condição de pagamento" value={condicaoPagamento || "—"} />
                <Info
                  label="Frete"
                  value={`${freteMod || "—"}${bonificado || freteGratis ? " · Frete grátis" : ""}`}
                />
                <Info label="Transportadora" value={transportadora?.nome ?? "—"} />
                <Info
                  label="Endereço de faturamento"
                  value={
                    faturarClienteFinal
                      ? `${fat['logradouro'] ?? ""} ${fat['numero'] ?? ""} — ${cidadeUf(fat['cidade'], fat['uf'])}`
                      : `${cliente?.['logradouro'] ?? ""} ${cliente?.['numero'] ?? ""} — ${cidadeUf(String(cliente?.['cidade'] ?? ""), String(cliente?.['uf'] ?? ""))}`
                  }
                />
                <Info
                  label="Endereço de entrega"
                  value={
                    entregaDiferente
                      ? `${entrega['logradouro'] ?? ""} ${entrega['numero'] ?? ""} — ${cidadeUf(entrega['cidade'], entrega['uf'])}`
                      : "Mesmo do faturamento"
                  }
                />
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                      <th className="text-left px-4 py-2.5">Produto</th>
                      <th className="text-center px-4 py-2.5">Qtd.</th>
                      <th className="text-right px-4 py-2.5">Unitário</th>
                      <th className="text-right px-4 py-2.5">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((i) => {
                      const p = produtos.find((x) => x.id === i.produtoId);
                      return (
                        <tr key={i.key} className="border-b border-border/50 last:border-0">
                          <td className="px-4 py-2.5">
                            <div className="font-medium">{i.avulso?.descricao ?? p?.descricao ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{i.avulso?.codigo ?? p?.codigo}</div>

                          </td>
                          <td className="px-4 py-2.5 text-center tabular-nums">{i.qtd}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmtBRL(i.valor)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                            {fmtBRL(i.valor * i.qtd)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="glass rounded-2xl p-5 space-y-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" /> Cupom, pagamento e observações
              </h2>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">Cupom de desconto</div>
                  {cupomCodigo && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                      onClick={removerCupom}
                    >
                      <X className="h-3.5 w-3.5" /> Remover cupom
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="relative">
                    <Input
                      value={cupomCodigo}
                      onChange={(e) => setCupomCodigo(normalizarCupom(e.target.value))}
                      placeholder="Ex.: PROMO25 ou CLIENTE-10"
                      className="uppercase pr-9"
                      maxLength={20}
                      aria-describedby="cupom-hint"
                    />
                    {cupomCodigo && (
                      <button
                        type="button"
                        onClick={removerCupom}
                        aria-label="Remover cupom"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {(cuponsQ.data ?? []).some((c) => c.ativo) && (
                    <Select
                      value={cupomCodigo || "__none__"}
                      onValueChange={(v) => (v === "__none__" ? removerCupom() : setCupomCodigo(normalizarCupom(v)))}
                    >
                      <SelectTrigger><SelectValue placeholder="Ou escolha um cupom" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem cupom</SelectItem>
                        {(cuponsQ.data ?? [])
                          .filter((c) => c.ativo)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.codigo}>
                              {c.codigo} — {c.tipos.join(", ")}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <p id="cupom-hint" className="text-xs text-muted-foreground">
                  Use apenas letras, números, hífen ou underscore. Máximo 20 caracteres.
                </p>


                {cupomCheck.status === "carregando" && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {cupomCheck.mensagem}
                  </p>
                )}
                {cupomCheck.status === "erro" && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span>{cupomCheck.mensagem}</span>
                  </div>
                )}
                {cupomCheck.status === "ok" && (
                  <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-500">
                    <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span>{cupomCheck.mensagem}</span>
                  </div>
                )}

              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium">Forma de pagamento</div>
                <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                  <SelectTrigger className="md:max-w-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boleto_vista">Boleto à vista</SelectItem>
                    <SelectItem value="boleto_prazo">Boleto a prazo</SelectItem>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="cartao_credito">Cartão de crédito</SelectItem>
                    <SelectItem value="financiamento">Financiamento</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Obrigatória apenas para concluir o pedido.
                </p>
                {tentou && !formaPagamento && <Erro>Obrigatória para concluir.</Erro>}
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium">Condição de pagamento (ZTERM)</div>
                <CondicaoPagamentoSelect
                  value={condicaoPagamento}
                  onChange={setCondicaoPagamento}
                  className="md:max-w-sm"
                />
                <p className="text-xs text-muted-foreground">
                  É o prazo enviado ao SAP — só aparecem as condições ativas com parcelas automáticas.
                </p>
                {tentou && !condicaoPagamento && <Erro>Obrigatória para concluir.</Erro>}
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium">Observações</div>
                <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={4} />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEtapa(4)}
                >
                  Voltar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void salvarProposta(false)}
                  disabled={salvando || !itens.length || !cliente}
                  className="gap-2"
                >
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void abrirPreviewPdf()}
                  disabled={!itens.length || salvando}
                  className="gap-2"
                >
                  <Eye className="h-4 w-4" /> Prévia da proposta
                </Button>
                <Button
                  type="button"
                  onClick={() => void salvarProposta(true)}
                  disabled={salvando}
                  className="gap-2"
                >
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Concluir pedido
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* TOTAIS FINAIS — recalculam a cada mudança de item, cupom ou frete */}
        {etapa >= 3 && (
          <div className="relative rounded-2xl border border-border/70 bg-card/95 backdrop-blur px-4 py-4 shadow-lg overflow-hidden">
            {recalculandoTotais && (
              <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-card/70 backdrop-blur-sm">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm font-medium text-primary">Recalculando totais...</span>
              </div>
            )}
            <div className={cn("flex flex-col sm:flex-row sm:items-center gap-4", recalculandoTotais && "opacity-60")}>
              <div className="flex items-center gap-2 shrink-0">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-primary">Totais finais</div>
                  <div className="text-[10px] text-muted-foreground">atualiza automaticamente</div>
                </div>
              </div>
              <div className="flex-1 min-w-0 flex flex-wrap items-stretch gap-2 sm:gap-3">
                <TotalRow label="Subtotal" value={fmtBRL(subtotal)} hint="Produtos da proposta" />
                <TotalRow
                  label="Desconto"
                  value={desconto > 0 ? `- ${fmtBRL(desconto)}` : fmtBRL(0)}
                  hint={cupom ? `Cupom ${cupom.codigo}` : "Sem cupom"}
                />
                <TotalRow
                  label={`Frete (${freteMod || "—"})`}
                  value={bonificado || freteGratis ? "Frete grátis" : fmtBRL(freteValor)}
                  hint={
                    bonificado
                      ? `Frete grátis · ${fmtBRL(freteValor)} absorvido pela 2P${transportadora?.nome ? ` · ${transportadora.nome}` : ""}`
                      : freteGratis
                        ? `Frete grátis pelo cupom${transportadora?.nome ? ` · ${transportadora.nome}` : ""}`
                        : (transportadora?.nome ?? undefined)
                  }
                />
                <TotalRow label="Total da proposta" value={fmtBRL(total)} strong hint="Subtotal - desconto + frete" />
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Overlay da Calculadora 2P */}
      {calculando && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 animate-scale-in">
            <div className="relative h-24 w-24">
              <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
              <Sun className="absolute inset-0 m-auto h-10 w-10 text-primary pulse" />
            </div>
            <div className="text-center">
              <p className="font-semibold">Calculadora 2P em ação</p>
              <p className="text-sm text-muted-foreground">
                Quantificando trilhos, grampos e fixações da estrutura…
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Resultado da conclusão: SAP, cobrança e Salesforce — nunca fecha em silêncio */}
      <ResultadoConclusaoDialog
        resultado={resultadoConclusao}
        onClose={() => setResultadoConclusao(null)}
        onIrParaLista={() => {
          setResultadoConclusao(null);
          void navigate({ to: "/solar/propostas" });
        }}
      />

      {/* Prévia da proposta em PDF — painel lateral, atualiza em tempo real */}
      {previewAberto && (
        <div className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-[640px] flex-col border-l border-border bg-background shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-border p-4">
            <div>
              <div className="font-semibold">Prévia da proposta</div>
              <div className="text-xs text-muted-foreground">
                Atualiza em tempo real conforme você edita — {previewPaginas}{" "}
                {previewPaginas === 1 ? "página" : "páginas"} (A4)
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPreviewZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
                aria-label="Diminuir zoom"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-xs tabular-nums">
                {Math.round(previewZoom * 100)}%
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPreviewZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
                aria-label="Aumentar zoom"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPreviewAberto(false)}
                aria-label="Fechar prévia"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-muted/40 p-4">
            <div
              style={{
                width: 794 * previewZoom,
                height: 1123 * previewPaginas * previewZoom,
                margin: "0 auto",
              }}
            >
              <iframe
                title="Proposta 2P Solar"
                srcDoc={pdfHtml}
                onLoad={(e) => {
                  const doc = e.currentTarget.contentDocument;
                  if (!doc) return;
                  const altura = Math.max(
                    doc.body?.scrollHeight ?? 0,
                    doc.documentElement?.scrollHeight ?? 0,
                  );
                  // A4 útil ≈ 1123px (96dpi) menos as margens @page de 10mm.
                  const paginas = Math.max(1, Math.ceil(altura / 1047));
                  setPreviewPaginas((p) => (p === paginas ? p : paginas));
                }}
                style={{
                  width: 794,
                  height: 1123 * previewPaginas,
                  border: 0,
                  background: "#fff",
                  transform: `scale(${previewZoom})`,
                  transformOrigin: "top left",
                }}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border p-4">
            <Button variant="outline" onClick={() => setPreviewAberto(false)}>
              Fechar
            </Button>
            <Button className="gap-2" onClick={() => baixarPdf()}>
              <FileDown className="h-4 w-4" /> Baixar PDF
            </Button>
          </div>
        </div>
      )}


      {etapa !== 5 && (
        <WizardActionBar
          step={etapa}
          totalSteps={5}
          stepLabel={ETAPAS[etapa - 1]}
          onBack={etapa > 1 ? () => setEtapa((s) => (Math.max(1, s - 1) as typeof s)) : undefined}
          onNext={etapa < 5 ? avancar : undefined}
          errors={erros}
          showErrors={tentou}
          actions={[
            {
              label: "Salvar",
              onClick: () => void salvarProposta(false),
              icon: <Save className="h-4 w-4" />,
              loading: salvando,
              disabled: salvando || !itens.length || !cliente,
            },
            {
              label: "Gerar proposta",
              onClick: abrirPreviewPdf,
              icon: <Eye className="h-4 w-4" />,
              disabled: !itens.length || salvando,
            },
          ]}
          primary={null}
        />
      )}
    </AppLayout>
  );
}

/** Clientes do cadastro 2P Solar. */
function useQueryClientes() {
  const list = useServerFn(listClientesFn);
  return useReactQuery(list);
}

function useReactQuery(list: ReturnType<typeof useServerFn<typeof listClientesFn>>) {
  const [data, setData] = useState<Record<string, any>[]>([]);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await list({ data: { instancia: "solar" } });
        if (vivo) setData((r.clientes ?? []) as Record<string, any>[]);
      } catch {
        if (vivo) setData([]);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { data };
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SeletorPesquisavel({
  value,
  onValueChange,
  opcoes,
  placeholder,
  vazio,
}: {
  value: string;
  onValueChange: (value: string) => void;
  opcoes: { value: string; label: string }[];
  placeholder: string;
  vazio: string;
}) {
  const [aberto, setAberto] = useState(false);
  const selecionada = opcoes.find((o) => o.value === value);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={aberto}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selecionada?.label ?? placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{vazio}</CommandEmpty>
            {opcoes.map((opcao) => (
              <CommandItem
                key={opcao.value}
                value={opcao.label}
                onSelect={() => {
                  onValueChange(opcao.value);
                  setAberto(false);
                }}
              >
                <Check className={cn("h-4 w-4", value === opcao.value ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{opcao.label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Erro({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-destructive">{children}</p>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium break-words">{value}</div>
    </div>
  );
}

/** Cartão de total (mesmo padrão da proposta 2P Carregadores). */
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
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={cn("tabular-nums", strong ? "text-lg font-bold" : "text-sm font-semibold")}>{value}</div>
      {hint ? <div className="text-[10px] text-muted-foreground truncate">{hint}</div> : null}
    </div>
  );
}


/** Opção do seletor consolidado (estilo slide) da etapa de produtos. */
function SlideOpcao({
  ativo,
  onClick,
  icon: Icon,
  titulo,
  descricao,
}: {
  ativo: boolean;
  onClick: () => void;
  icon: typeof Calculator;
  titulo: string;
  descricao?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "relative z-10 flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
        ativo ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0", ativo && "text-primary")} />
      <span className="min-w-0">
        <span className={cn("block text-sm truncate", ativo && "font-semibold")}>{titulo}</span>
        {descricao && <span className="block text-xs text-muted-foreground truncate">{descricao}</span>}
      </span>
    </button>
  );
}
