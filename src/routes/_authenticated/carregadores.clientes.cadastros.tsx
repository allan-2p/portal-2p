import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Plus, Search, Pencil, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCpoUfs } from "@/hooks/use-cpo";

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
  const [q, setQ] = useState("");
  const [fClasse, setFClasse] = useState<string>("todas");
  const [fUf, setFUf] = useState<string>("todas");
  const [fStatus, setFStatus] = useState<string>("ativos");
  const [fFiscal, setFFiscal] = useState<string>("todos");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Cliente, "id">>(vazio());

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
        const { error } = await supabase.from("cpo_clientes").insert({ ...form, created_by: u.user?.id ?? null });
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

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const tDoc = soDigitos(q);
    return clientes.filter((c) => {
      if (fClasse !== "todas" && (c.classificacao || "C") !== fClasse) return false;
      if (fUf !== "todas" && c.uf !== fUf) return false;
      if (fStatus === "ativos" && !c.ativo) return false;
      if (fStatus === "inativos" && c.ativo) return false;
      if (fFiscal === "contribuinte" && !c.contribuinte) return false;
      if (fFiscal === "nao" && c.contribuinte) return false;
      if (!t) return true;
      const texto = [c.razao_social, c.nome_fantasia, c.doc, c.cidade, c.uf, c.email, c.contato_nome]
        .some((v) => (v ?? "").toLowerCase().includes(t));
      const doc = tDoc.length >= 3 && soDigitos(c.doc ?? "").includes(tDoc);
      return texto || doc;
    });
  }, [clientes, q, fClasse, fUf, fStatus, fFiscal]);

  const ufsDisponiveis = useMemo(
    () => Array.from(new Set(clientes.map((c) => c.uf).filter(Boolean))).sort(),
    [clientes],
  );
  const filtrosAtivos = fClasse !== "todas" || fUf !== "todas" || fStatus !== "ativos" || fFiscal !== "todos" || q.trim() !== "";
  const limparFiltros = () => { setQ(""); setFClasse("todas"); setFUf("todas"); setFStatus("ativos"); setFFiscal("todos"); };


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
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar cadastro…" value={q} onChange={(e) => setQ(e.target.value)} />
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
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Cliente</th>
                  <th className="text-left px-4 py-2">CNPJ / CPF</th>
                  <th className="text-left px-4 py-2">Fiscal</th>
                  <th className="text-left px-4 py-2">Cidade / UF</th>
                  <th className="text-left px-4 py-2">Contato</th>
                  <th className="text-right px-4 py-2">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Carregando…</td></tr>}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    <Building2 className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    Nenhum cadastro ainda — clique em “Novo cadastro”.
                  </td></tr>
                )}
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2/40">
                    <td className="px-4 py-2">
                      <div className="font-medium">{c.razao_social}</div>
                      {c.nome_fantasia && <div className="text-xs text-muted-foreground">{c.nome_fantasia}</div>}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{c.doc || "—"}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={c.contribuinte ? "default" : "secondary"} className="text-[10px]">
                          {c.contribuinte ? "Contribuinte" : "Não contribuinte"}
                        </Badge>
                        {c.regime_tributario && <Badge variant="outline" className="text-[10px]">{c.regime_tributario}</Badge>}
                        {!c.ativo && <Badge variant="destructive" className="text-[10px]">Inativo</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2">{[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {c.contato_nome || c.email || "—"}
                      {c.telefone ? ` • ${c.telefone}` : ""}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" onClick={() => abrirEdicao(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => excluir.mutate(c.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
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
