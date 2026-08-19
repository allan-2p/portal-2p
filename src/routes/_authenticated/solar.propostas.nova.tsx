import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Eye,
  FileDown,
  ListPlus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Minus,
  Plus,
  Save,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react";

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
  useSolarModulos,
  useSolarProdutos,
  useSolarSuportes,
  useSolarTrilhoSuportes,
  useSolarTrilhos,
} from "@/hooks/use-solar-catalogo";
import {
  calcularEstrutura,
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

type Item = { key: string; produtoId: string; qtd: number; valor: number; origem: "calculadora" | "manual" };

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
  const [itens, setItens] = useState<Item[]>([]);
  const [calculando, setCalculando] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const [resultado, setResultado] = useState<CalcResultado | null>(null);
  const [previewAberto, setPreviewAberto] = useState(false);
  const [pdfHtml, setPdfHtml] = useState("");




  // calculadora
  const [geradorId, setGeradorId] = useState("");
  const [moduloId, setModuloId] = useState("");
  const [modPersonalizado, setModPersonalizado] = useState({ largura: "", altura: "", espessura: "" });
  const [paineis, setPaineis] = useState("");
  const [fileiras, setFileiras] = useState("1");
  const [orientacao, setOrientacao] = useState<Orientacao>("R");
  const [trilhoId, setTrilhoId] = useState("");
  const [suporteId, setSuporteId] = useState("");

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

  const suportesDoTrilho = useMemo(() => {
    const ids = (combQ.data ?? {})[trilhoId] ?? [];
    return (suportesQ.data ?? []).filter((s) => ids.includes(s.id));
  }, [combQ.data, suportesQ.data, trilhoId]);

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
      setItens(
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

  async function realizarProposta() {
    const trilho = (trilhosQ.data ?? []).find((t) => t.id === trilhoId) ?? null;
    const suporte = (suportesQ.data ?? []).find((s) => s.id === suporteId) ?? null;
    if (!modulo) return toast.error("Selecione o módulo.");

    setCalculando(true);
    setResultado(null);
    // Animação característica da Calculadora 2P
    await new Promise((r) => setTimeout(r, 1400));

    const r = calcularEstrutura({
      modulo,
      paineis: Number(paineis) || 0,
      fileiras: Number(fileiras) || 0,
      orientacao,
      trilho,
      suporte,
      config,
    });
    setResultado(r);
    setCalculando(false);
    if (!r.ok) return toast.error(r.erros[0] ?? "Revise os dados da estrutura.");

    // Converte os componentes calculados em itens do catálogo (por código SAP)
    const novos: Item[] = [];
    const faltando: string[] = [];
    for (const c of r.componentes) {
      const prod = c.codigo
        ? produtos.find((p) => normCod(p.codigo) === normCod(c.codigo as string))
        : undefined;
      if (!prod) {
        faltando.push(c.descricao);
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
    setItens((prev) => [...prev.filter((i) => i.origem === "manual"), ...novos]);
    if (faltando.length)
      toast.warning(`Sem código no catálogo: ${faltando.join(", ")}. Inclua manualmente.`);
    else toast.success("Estrutura calculada e itens adicionados.");
    void atualizarPrecos([...itens.filter((i) => i.origem === "manual"), ...novos], listaPreco);
  }

  // ------------------------------------------------------------------
  // Preços por tabela de preço (recalcula tudo ao trocar)
  // ------------------------------------------------------------------
  async function atualizarPrecos(lista: Item[], tabela: string) {
    if (!lista.length) return;
    try {
      const r = await precos({
        data: {
          itens: lista.map((i) => ({
            codigo: produtos.find((p) => p.id === i.produtoId)?.codigo ?? "",
            quantidade: i.qtd,
          })),
          documento: String(cliente?.['doc'] ?? clienteDoc ?? ""),
          listaPreco: tabela,
        },
      });
      setItens((prev) =>
        prev.map((i) => {
          const cod = normCod(produtos.find((p) => p.id === i.produtoId)?.codigo ?? "");
          const v = (r.precos as Record<string, number>)[cod];
          return v ? { ...i, valor: money2(v) } : i;
        }),
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
    if (!/^[A-Z0-9-]{3,20}$/.test(alvo))
      return { status: "erro", cupom: null, mensagem: "Código inválido: use de 3 a 20 caracteres (letras, números ou hífen)." };

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
        return { codigo: p?.codigo ?? null, nome: p?.descricao ?? "Item", qtd: i.qtd, valor: i.valor };
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
                      titulo="Realizar Proposta"
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
                <div className="grid gap-4 md:grid-cols-3">
                  <Campo label="Gerador">
                    <Select value={geradorId} onValueChange={setGeradorId}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {(geradoresQ.data ?? []).map((g) => (
                          <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Campo>
                  <Campo label="Módulo">
                    <Select value={moduloId} onValueChange={setModuloId}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent className="max-h-[320px]">
                        {(modulosQ.data ?? []).map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.nome}
                            {m.personalizado ? "" : ` (${m.largura}×${m.altura}×${m.espessura} mm)`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Campo>
                  <Campo label="Orientação">
                    <Select value={orientacao} onValueChange={(v) => setOrientacao(v as Orientacao)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="R">Retrato</SelectItem>
                        <SelectItem value="P">Paisagem</SelectItem>
                      </SelectContent>
                    </Select>
                  </Campo>

                  {modulo?.personalizado && (
                    <>
                      <Campo label="Largura (mm)">
                        <Input
                          value={modPersonalizado.largura}
                          onChange={(e) => setModPersonalizado((p) => ({ ...p, largura: e.target.value }))}
                        />
                      </Campo>
                      <Campo label="Altura (mm)">
                        <Input
                          value={modPersonalizado.altura}
                          onChange={(e) => setModPersonalizado((p) => ({ ...p, altura: e.target.value }))}
                        />
                      </Campo>
                      <Campo label="Espessura (mm)">
                        <Input
                          value={modPersonalizado.espessura}
                          onChange={(e) => setModPersonalizado((p) => ({ ...p, espessura: e.target.value }))}
                        />
                      </Campo>
                    </>
                  )}

                  <Campo label="Quantidade de painéis">
                    <Input value={paineis} onChange={(e) => setPaineis(e.target.value.replace(/\D/g, ""))} />
                  </Campo>
                  <Campo label="Fileiras">
                    <Input value={fileiras} onChange={(e) => setFileiras(e.target.value.replace(/\D/g, ""))} />
                  </Campo>
                  <Campo label="Trilho">
                    <Select
                      value={trilhoId}
                      onValueChange={(v) => {
                        setTrilhoId(v);
                        setSuporteId("");
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {(trilhosQ.data ?? []).map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Campo>
                  <Campo label="Fixação / suporte">
                    <Select value={suporteId} onValueChange={setSuporteId} disabled={!trilhoId}>
                      <SelectTrigger>
                        <SelectValue placeholder={trilhoId ? "Selecione" : "Escolha o trilho antes"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[320px]">
                        {suportesDoTrilho.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Campo>
                  <div className="md:col-span-3">
                    <Button onClick={() => void realizarProposta()} disabled={calculando} className="gap-2">
                      {calculando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                      Realizar proposta
                    </Button>
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
                <div className="grid gap-3 md:grid-cols-2">
                  <Campo label="Adicionar produto do catálogo">
                    <Select
                      value=""
                      onValueChange={(id) => {
                        const p = produtos.find((x) => x.id === id);
                        if (!p) return;
                        const novos: Item[] = [
                          ...itens,
                          {
                            key: Math.random().toString(36).slice(2),
                            produtoId: p.id,
                            qtd: 1,
                            valor: p.preco_sugerido,
                            origem: "manual",
                          },
                        ];
                        setItens(novos);
                        void atualizarPrecos(novos, listaPreco);
                      }}
                    >
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
                  {itens.map((i) => {
                    const p = produtos.find((x) => x.id === i.produtoId);
                    return (
                      <tr key={i.key} className="border-b border-border/50">
                        <td className="px-4 py-3">
                          <div className="font-medium">{p?.descricao ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {p?.codigo} {i.origem === "calculadora" ? "· Calculadora 2P" : ""}
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
                            <span className="w-10 text-center tabular-nums">{i.qtd}</span>
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
                itens={itens.map((i) => ({
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
                            <div className="font-medium">{p?.descricao ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{p?.codigo}</div>
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
                      onChange={(e) => setCupomCodigo(e.target.value.toUpperCase().trim())}
                      placeholder="Código"
                      className="uppercase pr-9"
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
                      onValueChange={(v) => (v === "__none__" ? removerCupom() : setCupomCodigo(v))}
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
