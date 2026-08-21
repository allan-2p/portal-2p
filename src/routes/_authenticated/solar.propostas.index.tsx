import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Copy, Eye, Pencil, Plus, Search, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PROPOSTA_STATUS } from "@/lib/proposta-status";
import { StatusDot, StatusLegend } from "@/components/proposta-status-ui";
import {
  excluirPropostaFn,
  listarPropostasFn,
} from "@/lib/propostas.functions";
import { fmtBRL } from "@/lib/carregadores";
import { PermissionGate, useCanDelete } from "@/components/permission-gate";
import { PropostaDetalheDialog } from "@/components/proposta-detalhe";
import { PedidoIntegracoesDialog } from "@/components/pedido-integracoes-dialog";

export const Route = createFileRoute("/_authenticated/solar/propostas/")({
  head: () => ({
    meta: [
      { title: "Propostas — Portal 2P Solar" },
      { name: "description", content: "Propostas de 2P Solar com valores, cupons, frete e status." },
      { property: "og:title", content: "Propostas — Portal 2P Solar" },
      { property: "og:description", content: "Consulte e emita propostas da unidade 2P Solar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PropostasSolarPage,
});

type Row = {
  id: string;
  numero: string | null;
  nome?: string | null;
  numero_sap?: string | null;
  sap_ov_numero?: string | null;
  cliente_nome: string;
  cliente_doc?: string | null;
  uf: string;
  totais: Record<string, number>;
  status: string;
  created_at: string;
  created_by: string | null;
  consultor_nome?: string | null;
  criado_por_nome?: string | null;
  sap_ov_status?: string | null;
  sf_status?: string | null;
};

const STATUS = PROPOSTA_STATUS;

function PropostasSolarPage() {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [uf, setUf] = useState("todos");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [integracoesId, setIntegracoesId] = useState<string | null>(null);
  const [excluirId, setExcluirId] = useState<string | null>(null);
  const podeExcluir = useCanDelete();

  const q = useQuery({
    queryKey: ["solar-proposals"],
    queryFn: async (): Promise<Row[]> => {
      const data = await listarPropostasFn({ data: { organizacao: "solar" } });
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        totais: (r.totais as Record<string, number>) ?? {},
      })) as Row[];
    },
    staleTime: 30_000,
  });

  const rows = q.data ?? [];
  const ufs = useMemo(() => Array.from(new Set(rows.map((r) => r.uf).filter(Boolean))).sort(), [rows]);

  const norm = (v: string) =>
    v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const filtered = useMemo(() => {
    const t = norm(busca.trim());
    return rows.filter((r) => {
      if (status !== "todos" && r.status !== status) return false;
      if (uf !== "todos" && r.uf !== uf) return false;
      if (!t) return true;
      return norm(
        [r.cliente_nome, r.numero, r.nome, (r.sap_ov_numero || r.numero_sap), r.cliente_doc, r.consultor_nome]
          .filter(Boolean)
          .join(" "),
      ).includes(t);
    });
  }, [rows, busca, status, uf]);

  useEffect(() => setPagina(1), [busca, status, uf, porPagina]);

  const totalPaginas = Math.max(1, Math.ceil(filtered.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtered.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);
  const detalheIdx = detalheId ? filtered.findIndex((r) => r.id === detalheId) : -1;


  async function confirmarExclusao() {
    if (!excluirId) return;
    try {
      await excluirPropostaFn({ data: { id: excluirId } });
    } catch (e) {
      setExcluirId(null);
      return toast.error((e as Error).message);
    }
    setExcluirId(null);
    toast.success("Proposta excluída.");
    q.refetch();
  }

  return (
    <AppLayout>
      <div className="max-w-[1700px] mx-auto space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-primary font-semibold">2P Solar</div>
            <h1 className="text-3xl font-bold mt-1">Propostas</h1>
          </div>
          <PermissionGate feature="propostas" action="editar" mode="disable">
            <Button asChild className="gap-2">
              <Link to="/solar/propostas/nova">
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
        </div>

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
                    <td className="px-4 py-3 text-muted-foreground">{(r.sap_ov_numero || r.numero_sap) || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {fmtBRL(r.totais['valorTotal'] ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">{r.consultor_nome || r.criado_por_nome || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusDot status={r.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" aria-label="Detalhar" onClick={() => setDetalheId(r.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Continuar proposta" asChild>
                          <Link to="/solar/propostas/nova" search={{ id: r.id }}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Duplicar proposta" asChild>
                          <Link to="/solar/propostas/nova" search={{ dup: r.id }}>
                            <Copy className="h-4 w-4" />
                          </Link>
                        </Button>
                         <Button
                           variant="ghost"
                           size="icon"
                           aria-label="Integrações e auditoria"
                           title="Integrações e auditoria"
                           className={r.sap_ov_status === "criada" && r.sf_status === "sincronizado" ? "text-success" : "text-warning"}
                           onClick={() => setIntegracoesId(r.id)}
                         >
                           <RefreshCw className="h-4 w-4" />
                         </Button>
                        {podeExcluir && (
                          <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => setExcluirId(r.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
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
                <Button variant="outline" size="sm" disabled={paginaAtual <= 1} onClick={() => setPagina(paginaAtual - 1)}>
                  Anterior
                </Button>
                <span className="text-muted-foreground">{paginaAtual} / {totalPaginas}</span>
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

      <PedidoIntegracoesDialog
        propostaId={integracoesId}
        open={!!integracoesId}
        onOpenChange={(open) => !open && setIntegracoesId(null)}
      />

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
              Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setExcluirId(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusao}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
