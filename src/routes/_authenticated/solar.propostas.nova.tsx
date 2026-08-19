import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WizardActionBar } from "@/components/wizard-action-bar";
import { FreteCotacao } from "@/components/frete-cotacao";
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
import { fmtBRL, type CarregadoresTransportadora } from "@/lib/carregadores";
import { listClientesFn, enriquecerCnpjFn } from "@/lib/clientes.functions";
import { obterPropostaFn } from "@/lib/propostas.functions";
import { salvarPropostaSolar } from "@/lib/propostas-solar.functions";
import { precosSolarFn } from "@/lib/solar-precos.functions";
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
import { quantificarProjeto } from "@/lib/solar-quantificador";
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
  const [enriquecendo, setEnriquecendo] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState<string>("");

  // Etapa 3
  const [modo, setModo] = useState<"calculadora" | "lista">("calculadora");
  const [listaPreco, setListaPreco] = useState("01");
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
  // produto avulso (lista de produtos)
  const [avulsoDesc, setAvulsoDesc] = useState("");
  const [avulsoQtd, setAvulsoQtd] = useState("1");


  // Etapa 4
  const [entregaDiferente, setEntregaDiferente] = useState(false);
  const [entrega, setEntrega] = useState<Record<string, string>>({});
  const [freteMod, setFreteMod] = useState("");
  const [areaRural, setAreaRural] = useState(false);
  const [transportadora, setTransportadora] = useState<CarregadoresTransportadora | null>(null);

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
      setFormaPagamento(String(p['forma_pagamento'] ?? ""));
      setEntregaDiferente(!!p['entrega_diferente']);
      setEntrega((p['entrega'] as Record<string, string>) ?? {});
      setFreteMod(String(p['frete_mod'] ?? ""));
      setAreaRural(!!p['frete_area_rural']);
      const totais = (p['totais'] ?? {}) as Record<string, any>;
      setListaPreco(String(totais['listaPreco'] ?? "01"));
      setVendido(totais['vendidoClienteFinal'] ? "sim" : "nao");
      setCupomCodigo(String(totais['cupom'] ?? ""));
      setModo("lista");
      setItensLista(

        ((p['itens'] as any[]) ?? []).map((i) => ({
          key: Math.random().toString(36).slice(2),
          produtoId: String(i.produtoId),
          qtd: Number(i.qtd ?? 1),
          valor: money2(i.valor),
          origem: "manual" as const,
        })),
      );
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

  /** Inclui um produto digitado manualmente (fora do catálogo). */
  function adicionarAvulso() {
    const desc = avulsoDesc.trim();
    if (!desc) return toast.error("Descreva o produto que deseja incluir.");
    setItensLista((prev) => [
      ...prev,
      {
        key: Math.random().toString(36).slice(2),
        produtoId: "",
        qtd: Math.max(1, Number(avulsoQtd) || 1),
        valor: 0,
        origem: "manual",
        avulso: { codigo: "AVULSO", descricao: desc },
      },
    ]);
    setAvulsoDesc("");
    setAvulsoQtd("1");
    toast.success("Produto incluído. Informe o valor unitário na lista.");
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

  /** Trilhos Smart/Zipado não usam vão entre apoios nem balanço. */
  function semVao(l: FileiraCalc) {
    const t = (trilhosQ.data ?? []).find((x) => x.id === l.trilhoId);
    return /smart|zipad/i.test(`${t?.nome ?? ""} ${t?.familia ?? ""}`);
  }

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

  async function realizarProposta() {
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
      distancia: Number(l.distMax) || 0,
      balanco: Number(l.balanco) || config.balanco_ponta / 1000,
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
    setCalculando(false);
    if (!agregado.ok) return toast.error(agregado.erros[0] ?? "Revise os dados da estrutura.");

    // Converte os componentes calculados em itens do catálogo (por código SAP)
    const novos: Item[] = [];
    const faltando: string[] = [];
    for (const c of agregado.componentes) {
      const prod = c.codigo
        ? produtos.find((p) => normCod(p.codigo) === normCod(c.codigo as string))
        : undefined;
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
    else toast.success("Estrutura calculada e itens adicionados.");
    void atualizarPrecos([...novos, ...extras], listaPreco, setItensCalc);

  }

  // ------------------------------------------------------------------
  // Preços por tabela de preço (recalcula tudo ao trocar)
  // ------------------------------------------------------------------
  async function atualizarPrecos(
    lista: Item[],
    tabela: string,
    setter: React.Dispatch<React.SetStateAction<Item[]>> = setItens,
  ) {
    const comCatalogo = lista.filter((i) => !i.avulso);
    if (!comCatalogo.length) return;
    try {
      const r = await precos({
        data: {
          itens: comCatalogo.map((i) => ({
            codigo: produtos.find((p) => p.id === i.produtoId)?.codigo ?? "",
            quantidade: i.qtd,
          })),
          documento: String(cliente?.['doc'] ?? clienteDoc ?? ""),
          listaPreco: tabela,
        },
      });
      const semPreco: string[] = [];
      setter((prev) =>
        prev.map((i) => {
          if (i.avulso) return i;
          const prod = produtos.find((p) => p.id === i.produtoId);
          const cod = normCod(prod?.codigo ?? "");
          const v = (r.precos as Record<string, number>)[cod];
          if (v === undefined) return i;
          if (!v) semPreco.push(prod?.codigo ?? cod);
          return { ...i, valor: money2(v) };
        }),
      );
      if (semPreco.length)
        toast.warning(
          `Sem preço no SAP para a tabela ${tabela}: ${semPreco.join(", ")}. Informe o valor manualmente.`,
        );
    } catch {
      /* mantém preços atuais quando o SAP não responde */
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
  const total = money2(subtotal - desconto + freteValor);

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
      if (faturarClienteFinal && (!fat['nome'] || !fat['doc'] || !fat['logradouro'] || !fat['cidade']))
        e.push("Complete os dados de faturamento do cliente final.");
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
    }
    if (etapa === 4) {
      if (!freteMod) e.push("Escolha a modalidade de frete.");
      if ((freteMod === "CIF" || freteMod === "DEDICADO") && !transportadora && !freteGratis)
        e.push("Finalize a cotação e escolha a transportadora.");
      if (entregaDiferente && (!entrega['logradouro'] || !entrega['cidade']))
        e.push("Complete o endereço de entrega.");
    }
    return e;
  }, [
    etapa, propostaNome, cliente, vendido, previsao, faturarClienteFinal, fat,
    itens, freteMod, transportadora, freteGratis, entregaDiferente, entrega,
    modo, assinaturaCalc, calcDesatualizado, itensCalc,
  ]);


  function avancar() {
    setTentou(true);
    if (erros.length) return toast.error(erros[0]!);
    setTentou(false);
    setEtapa((s) => (Math.min(5, s + 1) as typeof s));
  }

  async function salvarProposta(concluir = false) {
    if (concluir && !formaPagamento) {
      setTentou(true);
      return toast.error("Forma de pagamento é obrigatória para concluir o pedido.");
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
          faturamento: fat,
          formaPagamento: formaPagamento || null,
          entregaDiferente,
          entrega,
          freteMod,
          freteAreaRural: areaRural,
          freteValor,
          transportadora,
          cupomCodigo: cupomCodigo || null,
          observacoes: observacoes || null,
          calculo: resultado ? { distribuicao: resultado.distribuicao, comprimentos: resultado.comprimentos } : null,
          itens: itens.map((i) => ({ produtoId: i.produtoId, qtd: i.qtd })),
        },
      });
      setPropostaId(r.id);
      setNumero(r.numero);
      toast.success(concluir ? "Proposta concluída." : `Proposta ${r.numero} salva.`);
      if (concluir) void navigate({ to: "/solar/propostas" });
    } catch (e) {
      toast.error((e as Error).message);
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
  function montarPdfDados() {
    const linhasEnd = (o: Record<string, any>) =>
      [
        [o['logradouro'], o['numero']].filter(Boolean).join(", "),
        [o['complemento'], o['bairro']].filter(Boolean).join(" · "),
        [[o['cidade'], o['uf']].filter(Boolean).join("/"), o['cep']].filter(Boolean).join(" — "),
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
        return {
          codigo: i.avulso?.codigo ?? p?.codigo ?? null,
          nome: i.avulso?.descricao ?? p?.descricao ?? "Item",
          qtd: i.qtd,
          valor: i.valor,
        };
      }),

      subtotal,
      desconto,
      cupom: cupomCodigo || null,
      freteMod,
      freteValor,
      freteGratis,
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

  /** Abre a prévia da proposta (modal). */
  function abrirPreviewPdf() {
    if (!itens.length) return toast.error("Adicione produtos antes de gerar o PDF.");
    setPdfHtml(buildSolarPropostaPdfHtml(montarPdfDados()));
    setPreviewAberto(true);
  }

  /** Baixa/imprime a proposta em PDF. */
  function baixarPdf() {
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
                <Select value={clienteDoc} onValueChange={setClienteDoc}>
                  <SelectTrigger><SelectValue placeholder="Pesquisar no cadastro de clientes" /></SelectTrigger>
                  <SelectContent className="max-h-[320px]">
                    {(clientesQ.data ?? []).map((c: any) => (
                      <SelectItem key={String(c.id)} value={String(c.doc)}>
                        {c.razao_social} — {c.doc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

            <div className="glass rounded-2xl p-5 space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Seleção consolidada estilo slide */}
                <div>
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

                {/* Tabela de preço — mesmo padrão visual do seletor acima */}
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    Tabela de preço
                  </div>
                  <div className="relative grid grid-cols-5 gap-1 rounded-2xl border border-border bg-surface-2 p-1">
                    <span
                      aria-hidden
                      className="absolute inset-y-1 left-1 w-[calc(20%-0.2rem)] rounded-xl bg-primary/15 border border-primary/40 transition-transform duration-300 ease-out"
                      style={{
                        transform: `translateX(calc(${TABELAS_PRECO.findIndex((t) => t.value === listaPreco)} * (100% + 0.25rem)))`,
                      }}
                    />
                    {TABELAS_PRECO.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        aria-pressed={listaPreco === t.value}
                        disabled={trocando}
                        onClick={() => void trocarTabela(t.value)}
                        className={cn(
                          "relative z-10 rounded-xl px-2 py-2.5 text-center transition-colors",
                          listaPreco === t.value
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "block text-sm tabular-nums",
                            listaPreco === t.value && "font-semibold",
                          )}
                        >
                          {t.value}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">Tabela</span>
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
                                  placeholder={semVao(l) ? "—" : "auto"}
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
                              </td>
                              <td className="py-2 px-2">
                                <Input
                                  className="h-9 w-24"
                                  value={l.balanco}
                                  disabled={semVao(l)}
                                  placeholder={semVao(l) ? "—" : "auto"}
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

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={() => void realizarProposta()}
                      disabled={calculando || calcTravado}
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
                      <Select value="" onValueChange={(id) => adicionarProdutoEm(id, "lista")}>
                        <SelectTrigger><SelectValue placeholder="Buscar produto" /></SelectTrigger>
                        <SelectContent className="max-h-[320px]">
                          {produtos.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.codigo} — {p.descricao}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Campo>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-2 p-4">
                    <div className="text-sm font-semibold mb-3">Produto fora do catálogo</div>
                    <div className="grid gap-3 md:grid-cols-[1fr_120px_auto] md:items-end">
                      <Campo label="Descrição do produto">
                        <Input
                          value={avulsoDesc}
                          placeholder="Escreva o produto que deseja incluir"
                          onChange={(e) => setAvulsoDesc(e.target.value)}
                        />
                      </Campo>
                      <Campo label="Quantidade">
                        <Input
                          value={avulsoQtd}
                          onChange={(e) => setAvulsoQtd(e.target.value.replace(/\D/g, ""))}
                        />
                      </Campo>
                      <Button type="button" variant="outline" className="gap-1" onClick={adicionarAvulso}>
                        <Plus className="h-4 w-4" /> Incluir
                      </Button>
                    </div>
                  </div>
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
                    const editavel = i.origem === "manual";
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
                        <td className="px-4 py-3 text-right tabular-nums">
                          {editavel ? (
                            <Input
                              className="h-8 w-28 text-right tabular-nums ml-auto"
                              aria-label="Valor unitário"
                              value={String(i.valor)}
                              onChange={(e) => {
                                const v = Number(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."));
                                setItens((prev) =>
                                  prev.map((x) =>
                                    x.key === i.key ? { ...x, valor: money2(v) } : x,
                                  ),
                                );
                              }}
                            />
                          ) : (
                            fmtBRL(i.valor)
                          )}
                        </td>
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
              {freteMod === "CIF" && (
                <label className="flex items-end gap-2 text-sm pb-2">
                  <Checkbox checked={areaRural} onCheckedChange={(v) => setAreaRural(v === true)} />
                  Entrega em área rural
                </label>
              )}
            </div>

            {(freteMod === "CIF" || freteMod === "DEDICADO") && (
              <FreteCotacao
                unidade="solar"
                itens={itens
                  .filter((i) => !i.avulso)
                  .map((i) => ({
                    codigo: produtos.find((p) => p.id === i.produtoId)?.codigo ?? "",
                    quantidade: i.qtd,
                    nome: produtos.find((p) => p.id === i.produtoId)?.descricao ?? "",
                  }))}

                valorNota={subtotal - desconto}
                destino={destino}
                areaRural={areaRural}
                documento={String(cliente?.['doc'] ?? "")}
                selecionada={transportadora}
                onSelect={setTransportadora}
                onInvalidate={() => setTransportadora(null)}
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
                <Info label="Tipo de NF" value={tipoNf} />
                <Info label="Forma de pagamento" value={formaPagamento || "—"} />
                <Info label="Frete" value={freteMod || "—"} />
                <Info label="Transportadora" value={transportadora?.nome ?? "—"} />
                <Info
                  label="Endereço de faturamento"
                  value={
                    faturarClienteFinal
                      ? `${fat['logradouro'] ?? ""} ${fat['numero'] ?? ""} — ${fat['cidade'] ?? ""}/${fat['uf'] ?? ""}`
                      : `${cliente?.['logradouro'] ?? ""} ${cliente?.['numero'] ?? ""} — ${cliente?.['cidade'] ?? ""}/${cliente?.['uf'] ?? ""}`
                  }
                />
                <Info
                  label="Endereço de entrega"
                  value={
                    entregaDiferente
                      ? `${entrega['logradouro'] ?? ""} ${entrega['numero'] ?? ""} — ${entrega['cidade'] ?? ""}/${entrega['uf'] ?? ""}`
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
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Obrigatória apenas para concluir o pedido.
                </p>
                {tentou && !formaPagamento && <Erro>Obrigatória para concluir.</Erro>}
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
                  value={freteGratis ? "Grátis" : fmtBRL(freteValor)}
                  hint={transportadora?.nome ?? undefined}
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

      {/* Prévia da proposta em PDF */}
      <Dialog open={previewAberto} onOpenChange={setPreviewAberto}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Proposta em PDF</DialogTitle>
            <DialogDescription>
              Prévia gerada com os dados atuais. Revise antes de baixar.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-border overflow-hidden bg-white">
            <iframe title="Proposta 2P Solar" srcDoc={pdfHtml} className="w-full h-[65vh]" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreviewAberto(false)}>
              Continuar editando
            </Button>
            <Button
              className="gap-2"
              onClick={() => {
                setPreviewAberto(false);
                baixarPdf();
              }}
            >
              <FileDown className="h-4 w-4" /> Baixar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
  descricao: string;
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
        <span className="block text-xs text-muted-foreground truncate">{descricao}</span>
      </span>
    </button>
  );
}
