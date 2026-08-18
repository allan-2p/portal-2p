import { createFileRoute, Link } from "@tanstack/react-router";
import { PROPOSTA_STATUS } from "@/lib/proposta-status";
import { StatusLegend, StatusPicker } from "@/components/proposta-status-ui";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calculator, Copy, Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL } from "@/lib/carregadores";
import { cn } from "@/lib/utils";
import { VendedorNamesFilter } from "@/components/vendedor-names-filter";
import { useCarregadoresVendedores } from "@/hooks/use-carregadores-vendedores";
import { PermissionGate, useCanDelete } from "@/components/permission-gate";
import { PropostaDetalheDialog } from "@/components/proposta-detalhe";

export const Route = createFileRoute("/_authenticated/carregadores/propostas/")({
  head: () => ({
    meta: [
      { title: "Propostas — Portal 2P Carregadores" },
      { name: "description", content: "Todas as propostas emitidas, com valores, impostos e status." },
      { property: "og:title", content: "Propostas — Portal 2P Carregadores" },
      { property: "og:description", content: "Consulte propostas por cliente, estado e status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoricoCarregadoresPage,
});

type Row = {
  id: string;
  numero: string | null;
  nome?: string | null;
  numero_sap?: string | null;

  cliente_nome: string;
  cliente_doc?: string | null;
  cliente_telefone: string | null;
  cliente_email: string | null;
  uf: string;
  contribuinte: boolean;
  frete_mod: string;
  frete_valor: number;
  itens: { nome?: string; qtd?: number; valor?: number }[];
  totais: Record<string, number>;
  status: string;
  created_at: string;
  created_by: string | null;
  consultor_nome?: string | null;
  criado_por_nome?: string | null;
  finalizado_por_nome?: string | null;
  finalizado_em?: string | null;
};

/** Status universais do portal (mesma lista e cores em todas as instâncias). */
const STATUS = PROPOSTA_STATUS;

function HistoricoCarregadoresPage() {
  const [busca, setBusca] = useState("");
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [status, setStatus] = useState("todos");
  const [uf, setUf] = useState("todos");
  const [sap, setSap] = useState("todos");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [vendedor, setVendedor] = useState("__all__");
  const [excluirId, setExcluirId] = useState<string | null>(null);
  const podeExcluir = useCanDelete();
  const vend = useCarregadoresVendedores();

  const q = useQuery({
    queryKey: ["carregadores-proposals"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("propostas")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        frete_valor: Number(r.frete_valor),
        itens: (r.itens as Row["itens"]) ?? [],
        totais: (r.totais as Record<string, number>) ?? {},
      })) as Row[];
    },
    staleTime: 30_000,
  });

  const rows = q.data ?? [];
  const ufs = useMemo(() => Array.from(new Set(rows.map((r) => r.uf))).sort(), [rows]);

  /** Busca tolerante: ignora acento/pontuação para casar Nº e Nº SAP digitados de qualquer jeito. */
  const norm = (v: string) =>
    v
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const soDigitos = (v: string) => v.replace(/\D/g, "");

  const filtered = useMemo(() => {
    const t = norm(busca.trim());
    const tDig = soDigitos(busca);
    return rows.filter((r) => {
      if (status !== "todos" && r.status !== status) return false;
      if (uf !== "todos" && r.uf !== uf) return false;
      if (!vend.matches(vendedor, r.created_by)) return false;
      const temSap = !!(r.numero_sap ?? "").trim();
      if (sap === "com" && !temSap) return false;
      if (sap === "sem" && temSap) return false;
      if (!t) return true;
      // Propostas abertas não têm Nº SAP: a busca continua válida pelos demais campos.
      const alvo = norm(
        [r.cliente_nome, r.numero, r.nome, r.numero_sap, r.cliente_doc, r.consultor_nome]
          .filter(Boolean)
          .join(" ")
      );
      if (alvo.includes(t)) return true;
      if (tDig) {
        const alvoDig = soDigitos(
          [r.numero, r.numero_sap, r.cliente_doc].filter(Boolean).join(" ")
        );
        if (alvoDig.includes(tDig)) return true;
      }
      return false;
    });
  }, [rows, busca, status, uf, sap, vendedor, vend]);

  useEffect(() => {
    setPagina(1);
  }, [busca, status, uf, sap, vendedor, porPagina]);

  const totalPaginas = Math.max(1, Math.ceil(filtered.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtered.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);

  const detalheIdx = detalheId ? filtered.findIndex((r) => r.id === detalheId) : -1;





  async function alterarStatus(id: string, novo: string) {
    const { error } = await supabase.from("propostas").update({ status: novo }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado.");
    q.refetch();
  }

  const propostaParaExcluir = useMemo(
    () => rows.find((r) => r.id === excluirId) ?? null,
    [rows, excluirId]
  );

  async function confirmarExclusao() {
    if (!excluirId) return;
    const { error } = await supabase.from("propostas").delete().eq("id", excluirId);
    setExcluirId(null);
    if (error) return toast.error(error.message);
    toast.success("Proposta excluída.");
    q.refetch();
  }

  return (
    <AppLayout>
      <div className="max-w-[1700px] mx-auto space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-primary font-semibold">Carregadores</div>
            <h1 className="text-3xl font-bold mt-1">Propostas</h1>
          </div>
          <PermissionGate feature="carregadores.propostas" action="editar" mode="disable">
            <Button asChild className="gap-2">
              <Link to="/carregadores/propostas/nova">
                <Plus className="h-4 w-4" /> Nova proposta
              </Link>
            </Button>
          </PermissionGate>
        </div>




        <div className="glass rounded-2xl p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por cliente, nome da proposta, nº ou nº SAP"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={uf} onValueChange={setUf}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as UFs</SelectItem>
              {ufs.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sap} onValueChange={setSap}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Nº SAP: todos</SelectItem>
              <SelectItem value="com">Com Nº SAP</SelectItem>
              <SelectItem value="sem">Sem Nº SAP (abertas)</SelectItem>
            </SelectContent>
          </Select>
          <VendedorNamesFilter
            value={vendedor}
            onChange={setVendedor}
            options={vend.names}
            allLabel="Todos os vendedores"
          />

        </div>

        {/* Legenda universal de status — clique para filtrar */}
        <StatusLegend
          active={status === "todos" ? null : [status]}
          onToggle={(s) => setStatus(status === s ? "todos" : s)}
        />

        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="text-left px-4 py-3">Nº</th>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-left px-4 py-3">Proposta</th>
                  <th className="text-left px-4 py-3">Nº SAP</th>
                  <th className="text-right px-4 py-3">Valor</th>
                  <th className="text-left px-4 py-3">Data</th>
                  <th className="text-left px-4 py-3">Consultor</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="px-4 py-3 text-muted-foreground">{r.numero ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">{r.cliente_nome}</td>
                    <td className="px-4 py-3">{r.nome || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.numero_sap || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmtBRL(r.totais.valorTotal ?? 0)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">{r.consultor_nome || r.criado_por_nome || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusPicker
                        compact
                        value={r.status}
                        options={STATUS}
                        onChange={(v) => alterarStatus(r.id, v)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Detalhar"
                          onClick={() => setDetalheId(r.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Continuar proposta" asChild>
                          <Link to="/carregadores/propostas/nova" search={{ id: r.id }}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Duplicar proposta" asChild>
                          <Link to="/carregadores/propostas/nova" search={{ dup: r.id }}>
                            <Copy className="h-4 w-4" />
                          </Link>
                        </Button>
                        {podeExcluir && (
                          <>
                            <Button variant="ghost" size="icon" aria-label="Auditoria de cálculo" asChild>
                              <Link to="/carregadores/propostas/auditoria" search={{ id: r.id }}>
                                <Calculator className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => setExcluirId(r.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      {q.isLoading ? "Carregando…" : "Nenhuma proposta encontrada."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
              <div className="text-muted-foreground">
                Mostrando {(paginaAtual - 1) * porPagina + 1}–
                {Math.min(paginaAtual * porPagina, filtered.length)} de {filtered.length}
              </div>
              <div className="flex items-center gap-2">
                <Select value={String(porPagina)} onValueChange={(v) => setPorPagina(Number(v))}>
                  <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 / pág.</SelectItem>
                    <SelectItem value="25">25 / pág.</SelectItem>
                    <SelectItem value="50">50 / pág.</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={paginaAtual <= 1}
                  onClick={() => setPagina(paginaAtual - 1)}
                >
                  Anterior
                </Button>
                <span className="text-muted-foreground">
                  {paginaAtual} / {totalPaginas}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={paginaAtual >= totalPaginas}
                  onClick={() => setPagina(paginaAtual + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <PropostaDetalheDialog
        id={detalheId ?? undefined}
        onOpenChange={(open) => !open && setDetalheId(null)}
        hasPrev={detalheIdx > 0}
        hasNext={detalheIdx >= 0 && detalheIdx < filtered.length - 1}
        onNavigate={(dir) => {
          const next = filtered[detalheIdx + dir];
          if (next) setDetalheId(next.id);
        }}
      />

      <AlertDialog open={!!excluirId} onOpenChange={(open) => !open && setExcluirId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir proposta?</AlertDialogTitle>
            <AlertDialogDescription>
              {propostaParaExcluir ? (
                <>
                  Você está prestes a excluir permanentemente a proposta{" "}
                  <strong>{propostaParaExcluir.nome || propostaParaExcluir.numero || "—"}</strong>
                  {propostaParaExcluir.cliente_nome && (
                    <> do cliente <strong>{propostaParaExcluir.cliente_nome}</strong></>
                  )}
                  . Essa ação não pode ser desfeita.
                </>
              ) : (
                "Confirme para excluir a proposta selecionada. Essa ação não pode ser desfeita."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setExcluirId(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

