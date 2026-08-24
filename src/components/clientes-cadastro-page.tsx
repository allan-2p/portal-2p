import { cidadeUf } from "@/lib/local-format";
import { useCan, useCanDelete } from "@/components/permission-gate";
import { useEffect, useMemo, useState } from "react";
import { ConfirmarFechamentoDialog } from "@/components/confirmar-saida";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertCircle, Plus, Search, Pencil, Building2, Filter, X, Eye,
  ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, ShieldCheck, Loader2, Sparkles,
  ArrowRight, RefreshCw, History,
} from "lucide-react";
import { sincronizarDonosFn } from "@/lib/owner-sync.functions";
import { ClientHistoryTab } from "@/components/client-history-tab";
import { ClienteIntegracoesDialog } from "@/components/cliente-integracoes-dialog";
import { CreditoClienteCard } from "@/components/credito-cliente-card";

import { ClienteLogoUpload } from "@/components/cliente-logo-upload";

import { toast } from "sonner";
import { cnpjValido, mascaraCnpj, mascaraDoc, soDigitos } from "@/lib/cnpj";
import { FINALIDADES, TABELAS_PRECO, TABELA_PRECO_PADRAO } from "@/lib/sap-clientes-map";

import {
  listClientesPaginaFn, verificarDocFn, enriquecerCnpjFn, salvarClienteFn,
  listConsultoresFn,

} from "@/lib/clientes.functions";
import {
  ContatosEditor, contatosPadrao, normalizarContatos, validarContatos, rotuloErroContato,
  TIPO_ROTULO, type Contato,
} from "@/components/contatos-editor";

export type Instancia = "solar" | "carregadores";
const ORGANIZACAO: Record<Instancia, string> = { solar: "2P Solar", carregadores: "2P Carregadores" };

type Cnae = { codigo: string; descricao: string };

export type Cliente = {
  id: string;
  organizacao?: string | null;
  razao_social: string;
  nome_fantasia: string | null;
  doc: string;
  ie: string | null;
  ie_situacao: string | null;
  suframa: string | null;
  suframa_situacao: string | null;
  contribuinte: boolean;
  regime_tributario: string | null;
  natureza_juridica: string | null;
  porte: string | null;
  situacao_cadastral: string | null;
  data_abertura: string | null;
  cnae_principal_codigo: string | null;
  cnae_principal_descricao: string | null;
  cnaes_secundarios: Cnae[];
  email: string | null;
  telefone: string | null;
  site: string | null;
  contatos: Contato[];
  contato_nome: string | null;
  contato_cargo: string | null;
  contato_email: string | null;
  contato_telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string;
  municipio_ibge: string | null;
  condicao_pagamento: string | null;
  /** Campos exigidos pelo cadastro no SAP. */
  finalidade: string | null;
  tabela_preco: string | null;
  condicao_pgto_sap: string | null;
  numero_sap?: string | null;
  sap_status?: string | null;
  sap_erro?: string | null;
  sf_account_id?: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_by?: string | null;
  created_by_nome?: string | null;
  created_at?: string | null;
  // Campos da migração da plataforma antiga (somente leitura no portal).
  consultor_nome?: string | null;
  consultor_sap?: string | null;
  origem_cadastro?: string | null;
  origem?: string | null;
  sub_origem?: string | null;
  id_antigo?: string | number | null;
  sf_lead_id?: string | null;
  legado?: Record<string, any> | string | null;
};

type Form = Omit<Cliente, "id">;

const vazio = (): Form => ({
  razao_social: "", nome_fantasia: "", doc: "", ie: "", ie_situacao: null,
  suframa: null, suframa_situacao: null, contribuinte: false,
  regime_tributario: null, natureza_juridica: null, porte: null,
  situacao_cadastral: null, data_abertura: null,
  cnae_principal_codigo: null, cnae_principal_descricao: null, cnaes_secundarios: [],
  email: "", telefone: "", site: "",
  contatos: contatosPadrao(),
  contato_nome: "", contato_cargo: "", contato_email: "", contato_telefone: "",
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "",
  uf: "SP", municipio_ibge: null, condicao_pagamento: "",
  finalidade: "Revenda", tabela_preco: "2P-0001", condicao_pgto_sap: "",
  observacoes: "", ativo: true,
});

const REGIMES = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI", "Pessoa Física"];


/**
 * Consultor da conta: nos cadastros importados vem em `consultor_nome`; o
 * `created_by_nome` ("Importação plataforma antiga") é só origem do cadastro.
 */
const consultorDoCliente = (c: Cliente): string =>
  (c.consultor_nome ?? "").trim() || (c.created_by_nome ?? "").trim();

type Erros = Record<string, string>;
const ROTULOS: Record<string, string> = {
  razao_social: "Razão social", doc: "CNPJ", uf: "UF de destino",
  ie: "Inscrição Estadual", cep: "CEP", logradouro: "Logradouro",
  numero: "Número", cidade: "Cidade", consultor: "Consultor",
  finalidade: "Finalidade de uso", tabela_preco: "Tabela de preço",
};
const rotuloCampo = (chave: string, contatos: Contato[]) =>
  ROTULOS[chave] ?? rotuloErroContato(chave, contatos) ?? chave;

function validarCampos(f: Form, consultorId?: string | null): Erros {
  const e: Erros = {};
  if (!f.razao_social?.trim()) e.razao_social = "Informe a razão social.";
  if (!cnpjValido(f.doc ?? "")) e.doc = "CNPJ inválido.";
  if (!f.uf?.trim()) e.uf = "Selecione a UF de destino.";
  // Contribuinte é derivado da IE retornada pela consulta do CNPJ — nunca definido manualmente.
  Object.assign(e, validarContatos(f.contatos ?? []));
  if (soDigitos(f.cep ?? "").length !== 8) e.cep = "Informe um CEP válido (8 dígitos).";
  if (!f.logradouro?.trim()) e.logradouro = "Informe o logradouro.";
  if (!f.numero?.trim()) e.numero = "Informe o número do endereço.";
  if (!f.cidade?.trim()) e.cidade = "Informe a cidade.";
  if (!consultorId?.trim()) e.consultor = "Selecione o consultor responsável.";
  if (!f.finalidade?.trim()) e.finalidade = "Selecione a finalidade de uso (exigida pelo SAP).";
  // Tabela de preço tem padrão automático (2P-0001) — não bloqueia o cadastro.

  return e;
}


function comLegado(f: Form): Form {
  const principal = (f.contatos ?? []).find((c) => c.tipo === "principal");
  return {
    ...f,
    tabela_preco: f.tabela_preco?.trim() || "2P-0001",
    contato_nome: principal?.nome?.trim() || null,
    contato_cargo: principal?.cargo?.trim() || null,
    contato_email: principal?.emails.find((v) => v.trim())?.trim() || null,
    contato_telefone: principal?.telefones.find((v) => v.trim())?.trim() || null,
  };
}

function Marca({ texto, termo }: { texto?: string | null; termo: string }) {
  const valor = texto ?? "";
  const t = termo.trim().toLowerCase();
  if (!valor || !t) return <>{valor}</>;
  const i = valor.toLowerCase().indexOf(t);
  if (i < 0) return <>{valor}</>;
  return (
    <>
      {valor.slice(0, i)}
      <mark className="rounded-sm bg-primary/25 text-foreground px-0.5">{valor.slice(i, i + t.length)}</mark>
      {valor.slice(i + t.length)}
    </>
  );
}

type OrdemKey = "sap" | "cliente" | "doc" | "fiscal" | "cidade" | "contato" | "cliente_desde";

/** Ordenação padrão do portal: mais recente primeiro. */
type OrdemLista = OrdemKey | "recente";

/** Coluna real no banco para cada opção de ordenação da tabela. */
const COLUNA_ORDEM: Record<OrdemLista, string> = {
  recente: "created_at",
  sap: "numero_sap",
  cliente: "razao_social",
  doc: "doc",
  fiscal: "contribuinte",
  cidade: "cidade",
  contato: "consultor_nome",
  cliente_desde: "created_at",
};

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR",
  "PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export function ClientesCadastroPage({ instancia }: { instancia: Instancia }) {
  const qc = useQueryClient();
  const listar = useServerFn(listClientesPaginaFn);
  const verificarDoc = useServerFn(verificarDocFn);
  const enriquecer = useServerFn(enriquecerCnpjFn);
  const salvarFn = useServerFn(salvarClienteFn);


  const podeExcluir = useCanDelete();
  const podeVerIntegracoes = useCan("admin.clientes.integracoes");
  const [integracoesDe, setIntegracoesDe] = useState<Cliente | null>(null);
  // Campos SAP sensíveis (tabela de preço / condições) só para Administrador do Sistema.
  const ehAdmin = podeExcluir;
  const [q, setQ] = useState("");
  const [fUf, setFUf] = useState("todas");
  const [fStatus, setFStatus] = useState("ativos");
  const [fFiscal, setFFiscal] = useState("todos");
  const [ordem, setOrdem] = useState<OrdemLista>("recente");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  // A busca vai ao banco: espera o usuário parar de digitar.
  const [qBusca, setQBusca] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQBusca(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const [open, setOpen] = useState(false);
  const [etapa, setEtapa] = useState<"documento" | "formulario">("documento");
  const [docBusca, setDocBusca] = useState("");
  const [docErro, setDocErro] = useState<string | null>(null);
  const [duplicado, setDuplicado] = useState<
    Array<{ instancia: string; razao_social: string; organizacao: string; consultor: string; ativo: boolean }>
  >([]);
  const [fontes, setFontes] = useState<string[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(vazio());
  const [detalhe, setDetalhe] = useState<Cliente | null>(null);
  const [tentouSalvar, setTentouSalvar] = useState(false);
  // Consultor responsável pelo cadastro (gravado em created_by/created_by_nome)
  const [consultorId, setConsultorId] = useState<string | null>(null);
  const listarConsultores = useServerFn(listConsultoresFn);
  const consultoresQ = useQuery({
    queryKey: ["clientes-consultores", instancia],
    queryFn: () => listarConsultores({ data: { instancia } }),
    staleTime: 5 * 60_000,
  });
  const consultorEfetivo = consultorId ?? consultoresQ.data?.eu.id ?? null;
  const consultorNomeAtual =
    (consultoresQ.data?.consultores ?? []).find((c: { id: string; nome: string }) => c.id === consultorId)?.nome ??
    consultoresQ.data?.eu.nome ??
    "—";

  const errosAtuais = useMemo(() => validarCampos(form, consultorEfetivo), [form, consultorEfetivo]);

  const erros: Erros = tentouSalvar ? errosAtuais : {};
  const listaErros = Object.keys(erros).map((k) => ({ campo: k, msg: erros[k]! }));

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["clientes", instancia, { qBusca, fUf, fStatus, fFiscal, ordem, dir, pagina, porPagina }],
    queryFn: () =>
      listar({
        data: {
          instancia,
          q: qBusca,
          uf: fUf,
          status: fStatus,
          fiscal: fFiscal,
          ordem: COLUNA_ORDEM[ordem],
          dir,
          pagina,
          porPagina,
        },
      }),
    placeholderData: (anterior) => anterior,
  });
  const clientes = useMemo(() => ((data?.clientes ?? []) as unknown as Cliente[]), [data]);
  const total = data?.total ?? 0;
  const tabelaAusente = data?.ok === false;

  const verificar = useMutation({
    mutationFn: async () => {
      const doc = soDigitos(docBusca);
      if (!cnpjValido(doc)) throw new Error("CNPJ inválido — o cadastro aceita apenas CNPJ (14 dígitos).");
      const dup = await verificarDoc({ data: { doc } });
      if (dup.existe) return { tipo: "duplicado" as const, registros: dup.registros };
      const enr = await enriquecer({ data: { cnpj: doc } });
      return { tipo: "novo" as const, doc, enriquecimento: enr };
    },
    onSuccess: (r) => {
      setDocErro(null);
      if (r.tipo === "duplicado") {
        setDuplicado(r.registros as never);
        return;
      }
      setDuplicado([]);
      const e = r.enriquecimento;
      const base = vazio();
      const proximo: Form = {
        ...base,
        doc: mascaraDoc(r.doc),
        ...(e
          ? {
              razao_social: e.razao_social ?? "",
              nome_fantasia: e.nome_fantasia ?? "",
              ie: e.ie ?? "",
              ie_situacao: e.ie_situacao,
              suframa: e.suframa,
              suframa_situacao: e.suframa_situacao,
              contribuinte: !!e.ie,
              regime_tributario: e.regime_tributario ?? base.regime_tributario,
              natureza_juridica: e.natureza_juridica,
              porte: e.porte,
              situacao_cadastral: e.situacao_cadastral,
              data_abertura: e.data_abertura,
              cnae_principal_codigo: e.cnae_principal?.codigo ?? null,
              cnae_principal_descricao: e.cnae_principal?.descricao ?? null,
              cnaes_secundarios: e.cnaes_secundarios ?? [],
              email: e.email ?? "",
              telefone: e.telefone ?? "",
              cep: e.cep ?? "",
              logradouro: e.logradouro ?? "",
              numero: e.numero ?? "",
              complemento: e.complemento ?? "",
              bairro: e.bairro ?? "",
              cidade: e.cidade ?? "",
              uf: e.uf ?? base.uf,
              municipio_ibge: e.municipio_ibge,
            }
          : {}),
      };
      setForm(proximo);
      const bloq = new Set<keyof Form>();
      if (e?.fontes?.length) {
        // Campos oficiais da Receita/CNPJá não devem ser editados após enriquecimento.
        if (e.razao_social) bloq.add("razao_social");
        if (e.nome_fantasia) bloq.add("nome_fantasia");
        bloq.add("doc");
        if (e.natureza_juridica) bloq.add("natureza_juridica");
        if (e.porte) bloq.add("porte");
        if (e.situacao_cadastral) bloq.add("situacao_cadastral");
        if (e.data_abertura) bloq.add("data_abertura");
        if (e.cnae_principal?.codigo) bloq.add("cnae_principal_codigo");
        if (e.cnaes_secundarios?.length) bloq.add("cnaes_secundarios");
      }

      setFontes(e?.fontes ?? []);
      setAvisos(e?.avisos ?? []);
      setEtapa("formulario");
      if (e?.fontes?.length) toast.success(`Dados encontrados em ${e.fontes.join(" + ")}.`);
    },
    onError: (e: unknown) => setDocErro(e instanceof Error ? e.message : "Falha na verificação."),
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const p = comLegado(form);
      return salvarFn({
        data: {
          instancia,
          id: editId,
          cliente: {
            ...p,
            doc: soDigitos(p.doc),
            cnaes_secundarios: p.cnaes_secundarios ?? [],
            contatos: p.contatos ?? [],
          } as never,
          consultor_id: consultorEfetivo,
        },
      });
    },
    onSuccess: (res: any) => {
      toast.success(editId ? "Cadastro atualizado." : `Cliente cadastrado em ${ORGANIZACAO[instancia]}.`);
      const sync = res?.sync;
      if (sync) {
        if (sync.sap?.ok) toast.success(`Enviado ao SAP${sync.sap.numero_sap ? ` — código ${sync.sap.numero_sap}` : ""}.`);
        else toast.error(`SAP: ${sync.sap?.erro ?? "falha no envio."}`);
        if (sync.salesforce?.ok) toast.success("Conta e contato criados no Salesforce.");
        else toast.error(`Salesforce: ${sync.salesforce?.erro ?? "falha no envio."}`);
      }
      qc.invalidateQueries({ queryKey: ["clientes", instancia] });
      qc.invalidateQueries({ queryKey: ["carregadores-clientes-cadastro"] });
      fechar();
    },

    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  // Reenvio manual das integrações (SAP + Salesforce) de um cadastro.


  // Transferência de carteira: realinha o consultor dos cadastros com o dono
  // atual da conta no Salesforce (registros antigos permanecem intactos).
  const sincronizarDonos = useServerFn(sincronizarDonosFn);
  const sincronizarCarteira = useMutation({
    mutationFn: () => sincronizarDonos({ data: { instancia } }),
    onSuccess: (r: { transferidos: number }) => {
      if (r.transferidos > 0) {
        toast.success(`${r.transferidos} cliente(s) transferido(s) para o novo vendedor.`);
      } else {
        toast.success("Carteira já está atualizada.");
      }
      qc.invalidateQueries({ queryKey: ["clientes", instancia] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao sincronizar."),
  });

  // Filtro, ordenação e paginação acontecem no banco (listClientesPaginaFn):
  // a pesquisa alcança toda a base, não apenas a página carregada.
  const rows = clientes;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  useEffect(() => { setPagina(1); }, [qBusca, fUf, fStatus, fFiscal, porPagina, ordem, dir]);

  const ufsDisponiveis = UFS;
  const filtrosAtivos = fUf !== "todas" || fStatus !== "ativos" || fFiscal !== "todos" || q.trim() !== "";

  // Assinatura do formulário no momento em que o modal abriu: qualquer
  // divergência significa alterações não salvas.
  const assinaturaForm = JSON.stringify([form, docBusca, consultorId]);
  const [baseForm, setBaseForm] = useState<string | null>(null);
  const [confirmarFechar, setConfirmarFechar] = useState(false);
  const formSujo = baseForm !== null && baseForm !== assinaturaForm;

  function tentarFechar() {
    if (formSujo) return setConfirmarFechar(true);
    fechar();
  }

  function fechar() {
    setBaseForm(null); setConfirmarFechar(false);
    setOpen(false); setEditId(null); setForm(vazio()); setTentouSalvar(false);
    setConsultorId(consultoresQ.data?.eu.id ?? null);
    setEtapa("documento"); setDocBusca(""); setDocErro(null); setDuplicado([]);
    setFontes([]); setAvisos([]);
  }
  const abrirNovo = () => {
    fechar();
    setOpen(true);
    setBaseForm(JSON.stringify([vazio(), "", consultoresQ.data?.eu.id ?? null]));
  };
  const abrirEdicao = (c: Cliente) => {
    const { id: _id, ...rest } = c;
    setEditId(c.id);
    const inicial = {
      ...vazio(),
      ...rest,
      doc: mascaraDoc(c.doc ?? ""),
      cnaes_secundarios: (c.cnaes_secundarios ?? []) as Cnae[],
      contatos: normalizarContatos(c.contatos, {
        nome: c.contato_nome, cargo: c.contato_cargo,
        email: c.contato_email, telefone: c.contato_telefone,
      }),
    } as Form;
    const consultor = c.created_by ?? consultoresQ.data?.eu.id ?? null;
    setForm(inicial);
    setConsultorId(consultor);
    setDocBusca("");
    setBaseForm(JSON.stringify([inicial, "", consultor]));
    setTentouSalvar(false); setFontes([]); setAvisos([]);
    setEtapa("formulario"); setOpen(true);
  };
  const focarCampo = (campo: string) => {
    const alvo = document.getElementById(`campo-${campo}`);
    if (!alvo) return;
    alvo.scrollIntoView({ behavior: "smooth", block: "center" });
    const focavel = alvo.matches("input, textarea, select, [contenteditable=true], button")
      ? (alvo as HTMLElement)
      : alvo.querySelector<HTMLElement>(
          "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [role=combobox]:not([disabled]), button:not([disabled])",
        );
    if (!focavel) return;
    window.setTimeout(() => {
      focavel.focus({ preventScroll: true });
      if (focavel instanceof HTMLInputElement || focavel instanceof HTMLTextAreaElement) {
        try { focavel.select(); } catch { /* noop */ }
      }
      // destaque momentâneo para chamar atenção ao campo
      const original = focavel.style.transition;
      focavel.style.transition = "box-shadow 200ms ease, border-color 200ms ease";
      focavel.classList.add("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background", "border-primary");
      window.setTimeout(() => {
        focavel.classList.remove("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background", "border-primary");
        focavel.style.transition = original;
      }, 1200);
    }, 320);
  };
  const tentarSalvar = () => {
    setTentouSalvar(true);
    const e = validarCampos(form, consultorEfetivo);
    const chaves = Object.keys(e);
    if (chaves.length > 0) {
      toast.error(`Corrija ${chaves.length} campo(s) para salvar.`);
      requestAnimationFrame(() => focarCampo(chaves[0]!));
      return;
    }
    salvar.mutate();
  };


  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Cadastro de clientes</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro universal do Grupo 2P — novos registros criados aqui ficam vinculados a{" "}
            <strong>{ORGANIZACAO[instancia]}</strong>.
          </p>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2 ml-auto">
          <div className="relative w-80">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar por Código SAP, nome, CNPJ, cidade…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {consultoresQ.data?.podeEscolher && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => sincronizarCarteira.mutate()}
              disabled={sincronizarCarteira.isPending}
              title="Atualiza o consultor dos cadastros conforme o dono atual da conta no Salesforce"
            >
              <RefreshCw className={`h-4 w-4 ${sincronizarCarteira.isPending ? "animate-spin" : ""}`} />
              Sincronizar carteira
            </Button>
          )}
          <Button className="gap-2" onClick={abrirNovo}><Plus className="h-4 w-4" /> Novo cadastro</Button>


        </div>
      </div>

      {tabelaAusente && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm">
            <div className="flex items-center gap-2 font-semibold text-destructive">
              <AlertCircle className="h-4 w-4" /> Tabela de clientes ainda não criada
            </div>
            <p className="mt-1 text-muted-foreground">
              Rode o script <code>supabase/external/clientes.sql</code> no banco de {ORGANIZACAO[instancia]}
              {" "}para habilitar os cadastros nesta instância.
            </p>
          </CardContent>
        </Card>
      )}

      <ConfirmarFechamentoDialog
        aberto={confirmarFechar}
        onCancelar={() => setConfirmarFechar(false)}
        onDescartar={fechar}
        descricao="Você preencheu informações do cliente que ainda não foram salvas. Se fechar agora, elas serão perdidas."
      />

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : tentarFechar())}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editId && etapa === "formulario"
                ? form.razao_social || "Editar cadastro"
                : editId
                  ? "Editar cadastro"
                  : etapa === "documento"
                    ? "Novo cadastro — identificação"
                    : "Novo cadastro de cliente"}
            </DialogTitle>
            <DialogDescription>
              {editId && etapa === "formulario" ? (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-muted-foreground">Consultor responsável:</span>
                  <Badge variant="secondary" className="font-medium">{consultorNomeAtual}</Badge>
                  <span className="text-muted-foreground">· Vinculado a {ORGANIZACAO[instancia]}</span>
                </span>
              ) : etapa === "documento" ? (
                "Comece pelo CNPJ. Vamos verificar duplicidade e buscar os dados na Receita antes de preencher o restante."
              ) : (
                `Vinculado a ${ORGANIZACAO[instancia]}.`
              )}
            </DialogDescription>
          </DialogHeader>

          {etapa === "documento" ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs">CNPJ</Label>
                <Input
                  autoFocus
                  value={docBusca}
                  onChange={(e) => { setDocBusca(mascaraCnpj(e.target.value)); setDocErro(null); setDuplicado([]); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !verificar.isPending) verificar.mutate(); }}
                  placeholder="00.000.000/0000-00"
                  className={docErro ? "border-destructive" : ""}
                  aria-invalid={!!docErro}
                />
                {docErro && <p className="text-xs text-destructive">{docErro}</p>}
              </div>

              {duplicado.length > 0 && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 space-y-2" role="alert">
                  <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <AlertCircle className="h-4 w-4" /> Este CNPJ já está cadastrado
                  </div>
                  {duplicado.map((d, i) => (
                    <div key={i} className="rounded-lg bg-background/60 p-2 text-sm">
                      <div className="font-medium">{d.razao_social}</div>
                      <div className="text-xs text-muted-foreground">
                        Instância: <strong>{d.organizacao}</strong> · Consultor: <strong>{d.consultor}</strong>
                        {!d.ativo && " · cadastro inativo"}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={tentarFechar}>Cancelar</Button>
                <Button onClick={() => verificar.mutate()} disabled={verificar.isPending || !docBusca.trim()} className="gap-2">
                  {verificar.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Consultando…</>
                    : <><ShieldCheck className="h-4 w-4" /> Verificar e continuar</>}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              {(fontes.length > 0 || avisos.length > 0) && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
                  {fontes.length > 0 && (
                    <div className="flex items-center gap-2 font-semibold text-primary">
                      <Sparkles className="h-3.5 w-3.5" /> Pré-preenchido por {fontes.join(" + ")}
                    </div>
                  )}
                  {avisos.map((a, i) => <div key={i} className="mt-1 text-muted-foreground">• {a}</div>)}
                </div>
              )}

              {listaErros.length > 0 && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3" role="alert">
                  <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    Não foi possível salvar: {listaErros.length} campo(s) precisam de atenção
                  </div>
                  <ul className="mt-2 space-y-1">
                    {listaErros.map(({ campo, msg }) => (
                      <li key={campo}>
                        <button
                          type="button"
                          onClick={() => focarCampo(campo)}
                          className="group flex w-full items-center gap-2 text-left text-xs text-destructive underline-offset-2 hover:underline"
                        >
                          <ArrowRight className="h-3 w-3 shrink-0 transition-transform group-hover:translate-x-0.5" />
                          <span className="font-medium">{rotuloCampo(campo, form.contatos ?? [])}:</span>
                          <span className="text-foreground/90">{msg}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Section title="Dados da empresa">
                <F label="Razão social *" id="campo-razao_social" error={erros.razao_social}>
                  <Input value={form.razao_social} readOnly disabled />
                </F>
                <F label="Nome fantasia">
                  <Input value={form.nome_fantasia ?? ""} onChange={(e) => set("nome_fantasia", e.target.value)} />
                </F>
                <F label="CNPJ *" id="campo-doc" error={erros.doc}>
                  <Input value={form.doc ?? ""} readOnly disabled />
                </F>
                <F label="Regime tributário">
                  <Select value={form.regime_tributario ?? ""} onValueChange={(v) => set("regime_tributario", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>{REGIMES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Natureza jurídica"><Input value={form.natureza_juridica ?? ""} readOnly disabled /></F>
                <F label="Porte"><Input value={form.porte ?? ""} readOnly disabled /></F>
                <F label="Situação cadastral"><Input value={form.situacao_cadastral ?? ""} readOnly disabled /></F>
                <F label="Data de abertura"><Input value={form.data_abertura ?? ""} readOnly disabled placeholder="—" /></F>
                <div className="sm:col-span-2 text-[11px] text-muted-foreground">
                  Os dados da empresa são preenchidos automaticamente pela consulta do CNPJ. Apenas o nome fantasia pode ser ajustado.
                </div>
              </Section>

              <Section title="Situação fiscal">
                <F label="Inscrição Estadual" id="campo-ie" error={erros.ie}>
                  <Input
                    value={form.ie ?? ""}
                    readOnly
                    disabled
                    placeholder="Isento / não contribuinte"
                  />

                  {form.ie_situacao && <p className="mt-1 text-[11px] text-muted-foreground">Situação da IE: {form.ie_situacao}</p>}
                </F>
                <F label="Suframa">
                  <Input value={form.suframa ?? ""} readOnly disabled placeholder="Não localizado" />
                  {form.suframa_situacao && <p className="mt-1 text-[11px] text-muted-foreground">{form.suframa_situacao}</p>}
                </F>

                <F label="CNAE principal">
                  <Input
                    value={[form.cnae_principal_codigo, form.cnae_principal_descricao].filter(Boolean).join(" — ")}
                    readOnly
                    placeholder="—"
                  />
                </F>
                <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold">Cliente contribuinte do ICMS</div>
                    <div className="text-xs text-muted-foreground">Definido automaticamente pela consulta do CNPJ (Inscrição Estadual). Não editável.</div>
                  </div>
                  <Badge variant={form.contribuinte ? "default" : "secondary"}>
                    {form.contribuinte ? "Contribuinte" : "Não contribuinte"}
                  </Badge>
                </div>

                {(form.cnaes_secundarios ?? []).length > 0 && (
                  <div className="sm:col-span-2">
                    <Label className="text-xs">CNAEs secundários</Label>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {form.cnaes_secundarios.map((c) => (
                        <Badge key={c.codigo} variant="outline" className="text-[10px]" title={c.descricao}>
                          {c.codigo}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </Section>

              <Section title="Contato da empresa">
                <F label="E-mail"><Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></F>
                <F label="Telefone"><Input value={form.telefone ?? ""} onChange={(e) => set("telefone", e.target.value)} /></F>
                <F label="Site"><Input value={form.site ?? ""} onChange={(e) => set("site", e.target.value)} placeholder="https://" /></F>
              </Section>

              <Section title="Contatos">
                <div className="sm:col-span-2">
                  <p className="mb-3 text-xs text-muted-foreground">
                    O contato principal e o contato financeiro são obrigatórios. Você pode informar vários
                    e-mails e telefones em cada contato e adicionar quantos contatos precisar.
                  </p>
                  <ContatosEditor contatos={form.contatos ?? []} onChange={(c) => set("contatos", c)} erros={erros} />
                </div>
              </Section>

              <Section title="Endereço">
                <F label="CEP *" id="campo-cep" error={erros.cep}>
                  <Input value={form.cep ?? ""} readOnly disabled placeholder="—" />
                </F>
                <F label="Logradouro *" id="campo-logradouro" error={erros.logradouro}><Input value={form.logradouro ?? ""} readOnly disabled /></F>
                <F label="Número *" id="campo-numero" error={erros.numero}><Input value={form.numero ?? ""} readOnly disabled /></F>
                <F label="Complemento"><Input value={form.complemento ?? ""} readOnly disabled /></F>
                <F label="Bairro"><Input value={form.bairro ?? ""} readOnly disabled /></F>
                <F label="Cidade *" id="campo-cidade" error={erros.cidade}><Input value={form.cidade ?? ""} readOnly disabled /></F>
                <F label="UF de destino *" id="campo-uf" error={erros.uf}>
                  <Input value={form.uf ?? ""} readOnly disabled />
                </F>
                <div className="sm:col-span-2 text-[11px] text-muted-foreground">
                  Endereço obtido automaticamente pela consulta do CNPJ.
                </div>
              </Section>


              <Section title="Comercial">
                <F label="Consultor *" id="campo-consultor" error={erros.consultor}>
                  {consultoresQ.data?.podeEscolher ? (
                    <Select value={consultorEfetivo ?? ""} onValueChange={(v) => setConsultorId(v)}>

                      <SelectTrigger><SelectValue placeholder="Selecione o consultor" /></SelectTrigger>
                      <SelectContent>
                        {(consultoresQ.data?.consultores ?? []).map((c: { id: string; nome: string }) => (
                          <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={consultorNomeAtual} disabled />
                  )}
                </F>
                <F label="Finalidade de uso *" id="campo-finalidade" error={erros.finalidade}>
                  <Select value={form.finalidade ?? ""} onValueChange={(v) => set("finalidade", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {FINALIDADES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </F>
                {/* Tabela de preço: no Solar o vendedor escolhe; em Carregadores é sempre a padrão. */}
                {instancia === "solar" ? (
                  <F label="Tabela de preço (SAP) *" id="campo-tabela_preco" error={erros.tabela_preco}>
                    <Select value={form.tabela_preco || TABELA_PRECO_PADRAO} onValueChange={(v) => set("tabela_preco", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        {TABELAS_PRECO.map((t) => <SelectItem key={t.codigo} value={t.codigo}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </F>
                ) : null}
                {ehAdmin && (
                  <>
                    <F label="Condição de pagamento">
                      <Input value={form.condicao_pagamento ?? ""} onChange={(e) => set("condicao_pagamento", e.target.value)} placeholder="Ex.: 30/60/90" />
                    </F>
                    {instancia !== "solar" && (
                      <F label="Tabela de preço (SAP)" id="campo-tabela_preco" error={erros.tabela_preco}>
                        <Select value={form.tabela_preco || TABELA_PRECO_PADRAO} onValueChange={(v) => set("tabela_preco", v)}>
                          <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                          <SelectContent>
                            {TABELAS_PRECO.map((t) => <SelectItem key={t.codigo} value={t.codigo}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </F>
                    )}
                    <F label="Condição de pagamento SAP (ZTERM)">
                      <Input value={form.condicao_pgto_sap ?? ""} onChange={(e) => set("condicao_pgto_sap", e.target.value)} placeholder="Ex.: 0030" />
                    </F>
                  </>
                )}


                <ClienteLogoUpload doc={form.doc ?? ""} />
                <div className="sm:col-span-2">
                  <Label className="text-xs">Observações</Label>
                  <Textarea rows={3} value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} />
                </div>

                <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-border px-4 py-3">
                  <div className="text-sm font-medium">Cadastro ativo</div>
                  <Switch checked={form.ativo} onCheckedChange={(v) => set("ativo", v)} />
                </div>
              </Section>

              <DialogFooter>
                <Button variant="outline" onClick={tentarFechar}>Cancelar</Button>
                <Button onClick={tentarSalvar} disabled={salvar.isPending}>
                  {salvar.isPending ? "Salvando…" : "Salvar cadastro"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={fUf} onValueChange={setFUf}>
            <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as UFs</SelectItem>
              {ufsDisponiveis.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fFiscal} onValueChange={setFFiscal}>
            <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos (fiscal)</SelectItem>
              <SelectItem value="contribuinte">Contribuinte ICMS</SelectItem>
              <SelectItem value="nao">Não contribuinte</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativos">Ativos</SelectItem>
              <SelectItem value="inativos">Inativos</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          {filtrosAtivos && (
            <Button variant="ghost" size="sm" className="gap-1"
              onClick={() => { setQ(""); setFUf("todas"); setFStatus("ativos"); setFFiscal("todos"); }}>
              <X className="h-3.5 w-3.5" /> Limpar
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {isFetching ? "Buscando…" : `${total} cadastro(s)`}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                {([
                  ["sap", "Código SAP"],
                  ["cliente", "Cliente"],
                  ["doc", "CNPJ"],
                  ["fiscal", "Fiscal"],
                  ["cidade", "Cidade / UF"],
                  ["contato", "Consultor"],
                ] as [OrdemKey, string][]).map(([k, label]) => (
                  <th key={k} className="text-left px-4 py-2">
                    <button
                      type="button"
                      onClick={() => (ordem === k ? setDir((d) => (d === "asc" ? "desc" : "asc")) : (setOrdem(k), setDir("asc")))}
                      className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground transition-colors"
                    >
                      {label}
                      {ordem === k
                        ? (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                        : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </th>
                ))}
                <th className="text-right px-4 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Carregando…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  <Building2 className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  {clientes.length === 0
                    ? "Nenhum cadastro ainda — clique em “Novo cadastro”."
                    : "Nenhum cadastro encontrado com esses filtros."}
                </td></tr>
              )}
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2/40 cursor-pointer" onClick={() => setDetalhe(c)}>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {c.numero_sap ? <Marca texto={c.numero_sap} termo={q} /> : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium"><Marca texto={c.razao_social} termo={q} /></div>
                    {c.nome_fantasia && <div className="text-xs text-muted-foreground">{c.nome_fantasia}</div>}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{c.doc ? mascaraDoc(c.doc) : "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={c.contribuinte ? "default" : "secondary"} className="text-[10px]">
                        {c.contribuinte ? "Contribuinte" : "Não contribuinte"}
                      </Badge>
                      {c.regime_tributario && <Badge variant="outline" className="text-[10px]">{c.regime_tributario}</Badge>}
                      {!c.ativo && <Badge variant="destructive" className="text-[10px]">Inativo</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-2">{cidadeUf(c.cidade, c.uf)}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {consultorDoCliente(c) || "—"}
                    {c.consultor_sap && (
                      <div className="text-[10px] font-mono opacity-70">{c.consultor_sap}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" aria-label="Ver detalhes" onClick={() => setDetalhe(c)}><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => abrirEdicao(c)}><Pencil className="h-4 w-4" /></Button>
                    {podeVerIntegracoes && (
                      <Button variant="ghost" size="icon" aria-label="Integrações e histórico" onClick={() => setIntegracoesDe(c)}><History className="h-4 w-4" /></Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
        {total > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Por página</span>
              <Select value={String(porPagina)} onValueChange={(v) => setPorPagina(Number(v))}>
                <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                <SelectContent>{[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <span className="ml-auto">
              {(paginaAtual - 1) * porPagina + 1}–{Math.min(paginaAtual * porPagina, total)} de {total}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Página anterior"
                disabled={paginaAtual <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2">{paginaAtual} / {totalPaginas}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Próxima página"
                disabled={paginaAtual >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={!!detalhe} onOpenChange={(v) => !v && setDetalhe(null)}>
        <DialogContent className="max-w-5xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          {detalhe && (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="pr-6">{detalhe.razao_social}</DialogTitle>
                <DialogDescription>{detalhe.nome_fantasia || "Resumo do cadastro"}</DialogDescription>
              </DialogHeader>
              <div className="mt-2 space-y-5">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{detalhe.organizacao || ORGANIZACAO[instancia]}</Badge>
                  <Badge variant={detalhe.contribuinte ? "default" : "secondary"}>
                    {detalhe.contribuinte ? "Contribuinte ICMS" : "Não contribuinte"}
                  </Badge>
                  <Badge variant={detalhe.ativo ? "outline" : "destructive"}>{detalhe.ativo ? "Ativo" : "Inativo"}</Badge>
                </div>

                <div className="grid gap-4 lg:grid-cols-2 items-start">
                  <Bloco titulo="Situação fiscal">
                    <Linha rot="CNPJ" val={mascaraDoc(detalhe.doc ?? "")} />
                    <Linha rot="Inscrição Estadual" val={detalhe.contribuinte ? detalhe.ie : "Isento / não contribuinte"} />
                    <Linha rot="Situação da IE" val={detalhe.ie_situacao} />
                    <Linha rot="Suframa" val={[detalhe.suframa, detalhe.suframa_situacao].filter(Boolean).join(" · ")} />
                    <Linha rot="Regime tributário" val={detalhe.regime_tributario} />
                    <Linha rot="Situação cadastral" val={detalhe.situacao_cadastral} />
                    <Linha rot="Natureza jurídica" val={detalhe.natureza_juridica} />
                    <Linha rot="Porte" val={detalhe.porte} />
                    <Linha rot="Abertura" val={detalhe.data_abertura} />
                    <Linha
                      rot="CNAE principal"
                      val={[detalhe.cnae_principal_codigo, detalhe.cnae_principal_descricao].filter(Boolean).join(" — ")}
                    />
                    <Linha rot="UF de destino" val={detalhe.uf} />
                  </Bloco>

                  <Bloco titulo="Contatos">
                    {normalizarContatos(detalhe.contatos, {
                      nome: detalhe.contato_nome, cargo: detalhe.contato_cargo,
                      email: detalhe.contato_email, telefone: detalhe.contato_telefone,
                    }).map((c, i) => (
                      <div key={i} className="space-y-0.5">
                        <Linha rot={TIPO_ROTULO[c.tipo]} val={[c.nome, c.cargo].filter(Boolean).join(" · ")} />
                        <Linha rot="E-mail" val={c.emails.filter((v) => v.trim()).join(", ")} />
                        <Linha rot="Telefone" val={c.telefones.filter((v) => v.trim()).join(", ")} />
                      </div>
                    ))}
                    <Linha rot="E-mail da empresa" val={detalhe.email} />
                    <Linha rot="Telefone da empresa" val={detalhe.telefone} />
                    <Linha rot="Site" val={detalhe.site} />
                  </Bloco>

                  <Bloco titulo="Endereço">
                    <Linha rot="Logradouro" val={[detalhe.logradouro, detalhe.numero, detalhe.complemento].filter(Boolean).join(", ")} />
                    <Linha rot="Bairro" val={detalhe.bairro} />
                    <Linha rot="Cidade / UF" val={cidadeUf(detalhe.cidade, detalhe.uf, "")} />
                    <Linha rot="CEP" val={detalhe.cep} />
                  </Bloco>

                  <Bloco titulo="Comercial">
                    <Linha rot="Condição de pagamento" val={detalhe.condicao_pagamento} />
                    <Linha rot="Finalidade de uso" val={detalhe.finalidade} />
                    <Linha rot="Tabela de preço" val={detalhe.tabela_preco} />
                    <Linha rot="Consultor" val={consultorDoCliente(detalhe)} />
                    <Linha rot="Cód. do consultor (SAP)" val={detalhe.consultor_sap} />
                    <Linha rot="Observações" val={detalhe.observacoes} />
                  </Bloco>

                  <Bloco titulo="Origem do cadastro">
                    <Linha rot="Origem" val={detalhe.origem} />
                    <Linha rot="Sub-origem" val={detalhe.sub_origem} />
                    <Linha rot="Cadastrado via" val={detalhe.origem_cadastro} />
                    <Linha rot="Cadastrado por" val={detalhe.created_by_nome} />
                    <Linha rot="Lead do Salesforce" val={detalhe.sf_lead_id} />
                  </Bloco>

                  {(detalhe.id_antigo || detalhe.legado) && (
                    <Bloco titulo="Plataforma antiga">
                      <Linha rot="ID do cliente na antiga" val={detalhe.id_antigo != null ? String(detalhe.id_antigo) : null} />
                      {detalhe.legado ? (
                        <details className="rounded-lg bg-muted/30 p-2 text-xs">
                          <summary className="cursor-pointer font-semibold text-muted-foreground">
                            Dados importados
                          </summary>
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">
                            {typeof detalhe.legado === "string"
                              ? detalhe.legado
                              : JSON.stringify(detalhe.legado, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </Bloco>
                  )}
                </div>

                <CreditoClienteCard
                  instancia={instancia}
                  clienteId={detalhe.id}
                  clienteDoc={detalhe.doc}
                  clienteNome={detalhe.razao_social}
                />

                <ClientHistoryTab clienteNome={detalhe.razao_social} />
              </div>

              <DialogFooter className="gap-2 sm:justify-end">
                <Button variant="outline" onClick={() => setDetalhe(null)}>Fechar</Button>
                <Button className="gap-2" onClick={() => { const c = detalhe; setDetalhe(null); abrirEdicao(c); }}>
                  <Pencil className="h-4 w-4" /> Editar cadastro
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>


      <ClienteIntegracoesDialog
        cliente={integracoesDe}
        instancia={instancia}
        open={!!integracoesDe}
        onOpenChange={(v) => !v && setIntegracoesDe(null)}
      />
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-3 space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-primary">{titulo}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Linha({ rot, val }: { rot: string; val?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{rot}</span>
      <span className="text-right font-medium break-words">{val && String(val).trim() ? val : "—"}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-bold uppercase tracking-wider text-primary">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function F({ label, children, error, id }: { label: string; children: React.ReactNode; error?: string; id?: string }) {
  return (
    <div className="space-y-1" {...(id ? { id } : {})}>
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
