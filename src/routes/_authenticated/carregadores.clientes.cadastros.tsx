import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

type OrdemKey = "cliente" | "classificacao" | "doc" | "fiscal" | "cidade" | "contato";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VendedorNamesFilter } from "@/components/vendedor-names-filter";
import { useCpoVendedores } from "@/hooks/use-cpo-vendedores";
import { Plus, Search, Pencil, Trash2, Building2, Filter, X, Eye, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCpoUfs } from "@/hooks/use-cpo";

/** Destaca o trecho correspondente à busca (texto ou dígitos de CNPJ/CPF). */
function Marca({ texto, termo }: { texto?: string | null; termo: string }) {
  const valor = texto ?? "";
  const t = termo.trim();
  if (!valor || !t) return <>{valor}</>;

  const alvo = valor.toLowerCase();
  const busca = t.toLowerCase();
  const partes: Array<{ s: string; hit: boolean }> = [];

  let i = alvo.indexOf(busca);
  if (i >= 0) {
    let pos = 0;
    while (i >= 0) {
      if (i > pos) partes.push({ s: valor.slice(pos, i), hit: false });
      partes.push({ s: valor.slice(i, i + busca.length), hit: true });
      pos = i + busca.length;
      i = alvo.indexOf(busca, pos);
    }
    if (pos < valor.length) partes.push({ s: valor.slice(pos), hit: false });
  } else {
    const digitos = t.replace(/\D/g, "");
    if (digitos.length < 3) return <>{valor}</>;
    const idx: number[] = [];
    let seq = "";
    for (let k = 0; k < valor.length; k++) {
      if (/\d/.test(valor[k]!)) { seq += valor[k]; idx.push(k); }
    }
    const at = seq.indexOf(digitos);
    if (at < 0) return <>{valor}</>;
    const ini = idx[at]!;
    const fim = idx[at + digitos.length - 1]! + 1;
    if (ini > 0) partes.push({ s: valor.slice(0, ini), hit: false });
    partes.push({ s: valor.slice(ini, fim), hit: true });
    if (fim < valor.length) partes.push({ s: valor.slice(fim), hit: false });
  }

  return (
    <>
      {partes.map((p, k) =>
        p.hit
          ? <mark key={k} className="rounded-sm bg-primary/25 text-foreground px-0.5">{p.s}</mark>
          : <span key={k}>{p.s}</span>,
      )}
    </>
  );
}

export const Route = createFileRoute("/_authenticated/carregadores/clientes/cadastros")({
  head: () => ({
    meta: [
      { title: "Cadastros de clientes — Portal 2P Carregadores" },
      { name: "description", content: "Cadastro completo de clientes de carregadores com dados fiscais, endereço e contatos." },
      { property: "og:title", content: "Cadastros de clientes — Portal 2P Carregadores" },
      { property: "og:description", content: "Cadastre clientes com dados fiscais completos para uso nas propostas CPO." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CadastrosPage,
});

type Cliente = {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  doc: string | null;
  ie: string | null;
  im: string | null;
  contribuinte: boolean;
  regime_tributario: string | null;
  email: string | null;
  telefone: string | null;
  site: string | null;
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
  condicao_pagamento: string | null;
  transportadora: string | null;
  observacoes: string | null;
  ativo: boolean;
  classificacao: string;
  created_by?: string;
};

const vazio = (): Omit<Cliente, "id"> => ({
  razao_social: "", nome_fantasia: "", doc: "", ie: "", im: "", contribuinte: false,
  regime_tributario: "Simples Nacional", email: "", telefone: "", site: "",
  contato_nome: "", contato_cargo: "", contato_email: "", contato_telefone: "",
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "",
  uf: "SP", condicao_pagamento: "",
  transportadora: "", observacoes: "", ativo: true, classificacao: "C",
} as Omit<Cliente, "id">);

const REGIMES = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI", "Pessoa Física"];
const CLASSES = ["A", "B", "C", "D"] as const;
const CLASSE_INFO: Record<string, { label: string; cls: string }> = {
  A: { label: "A — Estratégico", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  B: { label: "B — Relevante", cls: "bg-sky-500/10 text-sky-500 border-sky-500/30" },
  C: { label: "C — Regular", cls: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  D: { label: "D — Eventual", cls: "bg-muted text-muted-foreground border-border" },
};
const soDigitos = (v: string) => v.replace(/\D/g, "");

function CadastrosPage() {
  const qc = useQueryClient();
  const ufs = useCpoUfs().data ?? [];
  const vend = useCpoVendedores();
  const [q, setQ] = useState("");
  const [fClasse, setFClasse] = useState<string>("todas");
  const [fUf, setFUf] = useState<string>("todas");
  const [fStatus, setFStatus] = useState<string>("ativos");
  const [fFiscal, setFFiscal] = useState<string>("todos");
  const [fVendedor, setFVendedor] = useState<string>("__all__");
  const [ordem, setOrdem] = useState<OrdemKey>("cliente");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Cliente, "id">>(vazio());
  const [detalhe, setDetalhe] = useState<Cliente | null>(null);


  const set = <K extends keyof Omit<Cliente, "id">>(k: K, v: Omit<Cliente, "id">[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["cpo-cadastros"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cpo_clientes")
        .select("*")
        .order("razao_social");
      if (error) throw error;
      return (data ?? []) as unknown as Cliente[];
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      if (!form.razao_social.trim()) throw new Error("Informe a razão social.");
      if (editId) {
        const { error } = await supabase.from("cpo_clientes").update(form).eq("id", editId);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (!uid) throw new Error("Sessão expirada. Faça login novamente.");
        const { error } = await supabase.from("cpo_clientes").insert({ ...form, created_by: uid });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Cadastro atualizado." : "Cliente cadastrado.");
      qc.invalidateQueries({ queryKey: ["cpo-cadastros"] });
      qc.invalidateQueries({ queryKey: ["cpo-clientes-cadastro"] });
      setOpen(false); setEditId(null); setForm(vazio());
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cpo_clientes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cadastro removido.");
      qc.invalidateQueries({ queryKey: ["cpo-cadastros"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao excluir."),
  });

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    const tDoc = soDigitos(q);
    return clientes.filter((c) => {
      if (fClasse !== "todas" && (c.classificacao || "C") !== fClasse) return false;
      if (fUf !== "todas" && c.uf !== fUf) return false;
      if (fStatus === "ativos" && !c.ativo) return false;
      if (fStatus === "inativos" && c.ativo) return false;
      if (fFiscal === "contribuinte" && !c.contribuinte) return false;
      if (fFiscal === "nao" && c.contribuinte) return false;
      if (!vend.matches(fVendedor, c.created_by)) return false;
      if (!t) return true;
      const texto = [c.razao_social, c.nome_fantasia, c.doc, c.cidade, c.uf, c.email, c.contato_nome]
        .some((v) => (v ?? "").toLowerCase().includes(t));
      const doc = tDoc.length >= 3 && soDigitos(c.doc ?? "").includes(tDoc);
      return texto || doc;
    });
  }, [clientes, q, fClasse, fUf, fStatus, fFiscal, fVendedor, vend]);

  const ordenados = useMemo(() => {
    const val = (c: Cliente) => {
      switch (ordem) {
        case "classificacao": return c.classificacao || "C";
        case "doc": return soDigitos(c.doc ?? "");
        case "fiscal": return c.contribuinte ? "1" : "0";
        case "cidade": return `${c.uf} ${c.cidade ?? ""}`;
        case "contato": return (c.contato_nome || c.email || "").toLowerCase();
        default: return c.razao_social.toLowerCase();
      }
    };
    return [...filtrados].sort((a, b) => {
      const r = val(a).localeCompare(val(b), "pt-BR", { numeric: true });
      return dir === "asc" ? r : -r;
    });
  }, [filtrados, ordem, dir]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const rows = useMemo(
    () => ordenados.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina),
    [ordenados, paginaAtual, porPagina],
  );

  useEffect(() => { setPagina(1); }, [q, fClasse, fUf, fStatus, fFiscal, porPagina, ordem, dir]);

  const ufsDisponiveis = useMemo(
    () => Array.from(new Set(clientes.map((c) => c.uf).filter(Boolean))).sort(),
    [clientes],
  );
  const filtrosAtivos = fClasse !== "todas" || fUf !== "todas" || fStatus !== "ativos" || fFiscal !== "todos" || fVendedor !== "__all__" || q.trim() !== "";
  const limparFiltros = () => { setQ(""); setFClasse("todas"); setFUf("todas"); setFStatus("ativos"); setFFiscal("todos"); };

  const ordenarPor = (k: OrdemKey) => {
    if (ordem === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setOrdem(k); setDir("asc"); }
  };



  const abrirNovo = () => { setEditId(null); setForm(vazio()); setOpen(true); };
  const abrirEdicao = (c: Cliente) => {
    const { id: _id, ...rest } = c;
    setEditId(c.id); setForm(rest); setOpen(true);
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">Cadastros de clientes</h1>
            <p className="text-sm text-muted-foreground">
              Dados fiscais e informações completas da empresa, usados automaticamente nas propostas.
            </p>
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2 ml-auto">
            <div className="relative w-72">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por nome, CNPJ, cidade…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm(vazio()); } }}>
              <DialogTrigger asChild>
                <Button className="gap-2" onClick={abrirNovo}><Plus className="h-4 w-4" /> Novo cadastro</Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editId ? "Editar cadastro" : "Novo cadastro de cliente"}</DialogTitle>
                </DialogHeader>

                <Section title="Dados da empresa">
                  <F label="Razão social *"><Input value={form.razao_social} onChange={(e) => set("razao_social", e.target.value)} /></F>
                  <F label="Nome fantasia"><Input value={form.nome_fantasia ?? ""} onChange={(e) => set("nome_fantasia", e.target.value)} /></F>
                  <F label="CNPJ / CPF"><Input value={form.doc ?? ""} onChange={(e) => set("doc", e.target.value)} placeholder="00.000.000/0000-00" /></F>
                  <F label="Regime tributário">
                    <Select value={form.regime_tributario ?? ""} onValueChange={(v) => set("regime_tributario", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>{REGIMES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </F>
                  <F label="Inscrição Estadual"><Input value={form.ie ?? ""} onChange={(e) => set("ie", e.target.value)} disabled={!form.contribuinte} placeholder={form.contribuinte ? "IE" : "Isento / não contribuinte"} /></F>
                  <F label="Inscrição Municipal"><Input value={form.im ?? ""} onChange={(e) => set("im", e.target.value)} /></F>
                  <F label="Classificação">
                    <Select value={form.classificacao || "C"} onValueChange={(v) => set("classificacao", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CLASSES.map((c) => <SelectItem key={c} value={c}>{CLASSE_INFO[c].label}</SelectItem>)}</SelectContent>
                    </Select>
                  </F>
                  <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold">Cliente contribuinte do ICMS</div>
                      <div className="text-xs text-muted-foreground">Define o cálculo de DIFAL nas propostas.</div>
                    </div>
                    <Switch checked={form.contribuinte} onCheckedChange={(v) => set("contribuinte", v)} />
                  </div>
                </Section>

                <Section title="Contato da empresa">
                  <F label="E-mail"><Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></F>
                  <F label="Telefone"><Input value={form.telefone ?? ""} onChange={(e) => set("telefone", e.target.value)} /></F>
                  <F label="Site"><Input value={form.site ?? ""} onChange={(e) => set("site", e.target.value)} placeholder="https://" /></F>
                </Section>

                <Section title="Responsável">
                  <F label="Nome"><Input value={form.contato_nome ?? ""} onChange={(e) => set("contato_nome", e.target.value)} /></F>
                  <F label="Cargo"><Input value={form.contato_cargo ?? ""} onChange={(e) => set("contato_cargo", e.target.value)} /></F>
                  <F label="E-mail"><Input value={form.contato_email ?? ""} onChange={(e) => set("contato_email", e.target.value)} /></F>
                  <F label="Telefone"><Input value={form.contato_telefone ?? ""} onChange={(e) => set("contato_telefone", e.target.value)} /></F>
                </Section>

                <Section title="Endereço">
                  <F label="CEP"><Input value={form.cep ?? ""} onChange={(e) => set("cep", e.target.value)} /></F>
                  <F label="Logradouro"><Input value={form.logradouro ?? ""} onChange={(e) => set("logradouro", e.target.value)} /></F>
                  <F label="Número"><Input value={form.numero ?? ""} onChange={(e) => set("numero", e.target.value)} /></F>
                  <F label="Complemento"><Input value={form.complemento ?? ""} onChange={(e) => set("complemento", e.target.value)} /></F>
                  <F label="Bairro"><Input value={form.bairro ?? ""} onChange={(e) => set("bairro", e.target.value)} /></F>
                  <F label="Cidade"><Input value={form.cidade ?? ""} onChange={(e) => set("cidade", e.target.value)} /></F>
                  <F label="UF de destino">
                    <Select value={form.uf} onValueChange={(v) => set("uf", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ufs.map((u) => <SelectItem key={u.uf} value={u.uf}>{u.uf} — {u.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </F>
                </Section>

                <Section title="Comercial">
                  <F label="Condição de pagamento"><Input value={form.condicao_pagamento ?? ""} onChange={(e) => set("condicao_pagamento", e.target.value)} placeholder="Ex.: 30/60/90" /></F>
                  <F label="Transportadora"><Input value={form.transportadora ?? ""} onChange={(e) => set("transportadora", e.target.value)} /></F>
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
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                    {salvar.isPending ? "Salvando…" : "Salvar cadastro"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={fClasse} onValueChange={setFClasse}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as classificações</SelectItem>
                {CLASSES.map((c) => <SelectItem key={c} value={c}>{CLASSE_INFO[c].label}</SelectItem>)}
              </SelectContent>
            </Select>
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
            <VendedorNamesFilter
              value={fVendedor}
              onChange={setFVendedor}
              options={vend.names}
              allLabel="Todos os vendedores"
            />
            {filtrosAtivos && (
              <Button variant="ghost" size="sm" className="gap-1" onClick={limparFiltros}>
                <X className="h-3.5 w-3.5" /> Limpar
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {ordenados.length} de {clientes.length} cadastro(s)
            </span>
          </CardContent>
        </Card>


        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  {([
                    ["cliente", "Cliente"],
                    ["classificacao", "Classe"],
                    ["doc", "CNPJ / CPF"],
                    ["fiscal", "Fiscal"],
                    ["cidade", "Cidade / UF"],
                    ["contato", "Contato"],
                  ] as [OrdemKey, string][]).map(([k, label]) => (
                    <th key={k} className="text-left px-4 py-2">
                      <button
                        type="button"
                        onClick={() => ordenarPor(k)}
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
                  <tr
                    key={c.id}
                    className="hover:bg-surface-2/40 cursor-pointer"
                    onClick={() => setDetalhe(c)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Ver detalhes de ${c.razao_social}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetalhe(c); }
                    }}
                  >
                    <td className="px-4 py-2">
                      <div className="font-medium"><Marca texto={c.razao_social} termo={q} /></div>
                      {c.nome_fantasia && (
                        <div className="text-xs text-muted-foreground"><Marca texto={c.nome_fantasia} termo={q} /></div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className={`text-[10px] font-bold ${CLASSE_INFO[c.classificacao || "C"]?.cls ?? ""}`}>
                        {c.classificacao || "C"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{c.doc ? <Marca texto={c.doc} termo={q} /> : "—"}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={c.contribuinte ? "default" : "secondary"} className="text-[10px]">
                          {c.contribuinte ? "Contribuinte" : "Não contribuinte"}
                        </Badge>
                        {c.regime_tributario && <Badge variant="outline" className="text-[10px]">{c.regime_tributario}</Badge>}
                        {!c.ativo && <Badge variant="destructive" className="text-[10px]">Inativo</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2"><Marca texto={[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"} termo={q} /></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      <Marca texto={c.contato_nome || c.email || "—"} termo={q} />
                      {c.telefone ? ` • ${c.telefone}` : ""}
                    </td>

                    <td className="px-4 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" aria-label="Ver detalhes" onClick={() => setDetalhe(c)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => abrirEdicao(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => excluir.mutate(c.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}

              </tbody>
            </table>
          </CardContent>
          {ordenados.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Por página</span>
                <Select value={String(porPagina)} onValueChange={(v) => setPorPagina(Number(v))}>
                  <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <span className="ml-auto">
                {(paginaAtual - 1) * porPagina + 1}–{Math.min(paginaAtual * porPagina, ordenados.length)} de {ordenados.length}
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

        <Sheet open={!!detalhe} onOpenChange={(v) => !v && setDetalhe(null)}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            {detalhe && (
              <>
                <SheetHeader className="text-left">
                  <SheetTitle className="pr-6">{detalhe.razao_social}</SheetTitle>
                  <SheetDescription>{detalhe.nome_fantasia || "Resumo do cadastro"}</SheetDescription>
                </SheetHeader>

                <div className="mt-4 space-y-5">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={`font-bold ${CLASSE_INFO[detalhe.classificacao || "C"]?.cls ?? ""}`}>
                      {CLASSE_INFO[detalhe.classificacao || "C"]?.label ?? detalhe.classificacao}
                    </Badge>
                    <Badge variant={detalhe.contribuinte ? "default" : "secondary"}>
                      {detalhe.contribuinte ? "Contribuinte ICMS" : "Não contribuinte"}
                    </Badge>
                    <Badge variant={detalhe.ativo ? "outline" : "destructive"}>
                      {detalhe.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>

                  <Bloco titulo="Situação fiscal">
                    <Linha rot="CNPJ / CPF" val={detalhe.doc} />
                    <Linha rot="Inscrição Estadual" val={detalhe.contribuinte ? detalhe.ie : "Isento / não contribuinte"} />
                    <Linha rot="Inscrição Municipal" val={detalhe.im} />
                    <Linha rot="Regime tributário" val={detalhe.regime_tributario} />
                    <Linha rot="UF de destino" val={detalhe.uf} />
                  </Bloco>

                  <Bloco titulo="Contato">
                    <Linha rot="Responsável" val={[detalhe.contato_nome, detalhe.contato_cargo].filter(Boolean).join(" · ")} />
                    <Linha rot="E-mail" val={detalhe.contato_email || detalhe.email} />
                    <Linha rot="Telefone" val={detalhe.contato_telefone || detalhe.telefone} />
                    <Linha rot="Site" val={detalhe.site} />
                  </Bloco>

                  <Bloco titulo="Endereço">
                    <Linha
                      rot="Logradouro"
                      val={[detalhe.logradouro, detalhe.numero, detalhe.complemento].filter(Boolean).join(", ")}
                    />
                    <Linha rot="Bairro" val={detalhe.bairro} />
                    <Linha rot="Cidade / UF" val={[detalhe.cidade, detalhe.uf].filter(Boolean).join(" / ")} />
                    <Linha rot="CEP" val={detalhe.cep} />
                  </Bloco>

                  <Bloco titulo="Comercial">
                    <Linha rot="Condição de pagamento" val={detalhe.condicao_pagamento} />
                    <Linha rot="Transportadora" val={detalhe.transportadora} />
                    <Linha rot="Observações" val={detalhe.observacoes} />
                  </Bloco>

                  <div className="flex gap-2 pt-1">
                    <Button
                      className="flex-1 gap-2"
                      onClick={() => { const c = detalhe; setDetalhe(null); abrirEdicao(c); }}
                    >
                      <Pencil className="h-4 w-4" /> Editar cadastro
                    </Button>
                    <Button variant="outline" onClick={() => setDetalhe(null)}>Fechar</Button>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </AppLayout>
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
      <span className="text-right font-medium break-words">{val && val.trim() ? val : "—"}</span>
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

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
