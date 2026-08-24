import { createFileRoute, Link } from "@tanstack/react-router";
import { PROPOSTA_STATUS } from "@/lib/proposta-status";
import { StatusDot, StatusLegend } from "@/components/proposta-status-ui";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableSkeletonRows, fetchingClass } from "@/components/ui/table-skeleton";

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
import { formatSapNumero, formatPropostaNumero } from "@/lib/sap-numero";
import { bloqueiaReenvioSap } from "@/lib/proposta-legado";
import { supabase } from "@/integrations/supabase/client";
import { listarPropostasPaginaFn, excluirPropostaFn } from "@/lib/propostas.functions";
import { fmtBRL } from "@/lib/carregadores";
import { cn } from "@/lib/utils";
import { VendedorNamesFilter } from "@/components/vendedor-names-filter";
import { useCarregadoresVendedores } from "@/hooks/use-carregadores-vendedores";
import { PermissionGate, useCanDelete } from "@/components/permission-gate";
import { PropostaDetalheDialog } from "@/components/proposta-detalhe";
import { PedidoIntegracoesDialog } from "@/components/pedido-integracoes-dialog";

export const Route = createFileRoute("/_authenticated/carregadores/propostas/")({
  validateSearch: (s: Record<string, unknown>): { ver?: string } =>
    typeof s.ver === "string" ? { ver: s.ver } : {},
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
  sap_ov_numero?: string | null;

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
  sap_ov_status?: string | null;
  sf_status?: string | null;
};

/** Status universais do portal (mesma lista e cores em todas as instâncias). */
const STATUS = PROPOSTA_STATUS;

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR",
  "PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

function HistoricoCarregadoresPage() {
  const { ver } = Route.useSearch();
  const [busca, setBusca] = useState("");
  const [detalheId, setDetalheId] = useState<string | null>(ver ?? null);
  const [integracoesId, setIntegracoesId] = useState<string | null>(null);
  const [status, setStatus] = useState("todos");
  const [uf, setUf] = useState("todos");
  const [sap, setSap] = useState("todos");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [vendedor, setVendedor] = useState("__all__");
  const [excluirId, setExcluirId] = useState<string | null>(null);
  const podeExcluir = useCanDelete();
  const vend = useCarregadoresVendedores();

  // A pesquisa roda no banco (base inteira): espera parar de digitar.
  const [buscaDb, setBuscaDb] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setBuscaDb(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca]);

  const createdByIn = vend.idsDe(vendedor);

  const q = useQuery({
    queryKey: ["carregadores-proposals", { buscaDb, status, uf, sap, createdByIn, pagina, porPagina }],
    queryFn: async (): Promise<{ rows: Row[]; total: number }> => {
      const data = await listarPropostasPaginaFn({
        data: {
          organizacao: "carregadores",
          q: buscaDb,
          status,
          uf,
          comSap: sap,
          createdByIn: createdByIn ?? undefined,
          pagina,
          porPagina,
        },
      });
      return {
        rows: ((data?.rows ?? []) as any[]).map((r) => ({
          ...r,
          frete_valor: Number(r.frete_valor),
          itens: (r.itens as Row["itens"]) ?? [],
          totais: (r.totais as Record<string, number>) ?? {},
        })) as Row[],
        total: data?.total ?? 0,
      };
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  // Filtro, ordenação (mais recente primeiro) e paginação vêm do banco.
  const filtered = rows;
  const visiveis = rows;
  const ufs = UFS;

  useEffect(() => {
    setPagina(1);
  }, [buscaDb, status, uf, sap, vendedor, porPagina]);

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const detalheIdx = detalheId ? filtered.findIndex((r) => r.id === detalheId) : -1;

  const propostaParaExcluir = useMemo(
    () => rows.find((r) => r.id === excluirId) ?? null,
    [rows, excluirId]
  );

  async function confirmarExclusao() {
    if (!excluirId) return;
    try {
      const r = await excluirPropostaFn({ data: { id: excluirId } });
      setExcluirId(null);
      if (r?.aviso) toast.warning(r.aviso, { duration: 10000 });
      else toast.success("Proposta excluída.");
      q.refetch();
      return;
    } catch (e) {
      setExcluirId(null);
      return toast.error((e as Error).message);
    }
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
              <tbody className={fetchingClass(q.isFetching, q.isLoading)}>
                {visiveis.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="px-4 py-3 text-muted-foreground">{formatPropostaNumero(r.numero) || "—"}</td>
                    <td className="px-4 py-3 font-medium">{r.cliente_nome}</td>
                    <td className="px-4 py-3">{r.nome || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatSapNumero(r.sap_ov_numero || r.numero_sap) || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmtBRL(r.totais.valorTotal ?? 0)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">{r.consultor_nome || r.criado_por_nome || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusDot status={r.status} />
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
                        {!bloqueiaReenvioSap(r) && (
                          <Button variant="ghost" size="icon" aria-label="Continuar proposta" asChild>
                            <Link to="/carregadores/propostas/nova" search={{ id: r.id }}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" aria-label="Duplicar proposta" asChild>
                          <Link to="/carregadores/propostas/nova" search={{ dup: r.id }}>
                            <Copy className="h-4 w-4" />
                          </Link>
                        </Button>
                         <Button
                           variant="ghost"
                           size="icon"
                           aria-label="Integrações e auditoria"
                           title="Integrações e auditoria"
                           className={cn(r.sap_ov_status === "criada" && r.sf_status === "sincronizado" ? "text-success" : "text-warning")}
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
                {q.isLoading && <TableSkeletonRows colunas={9} linhas={porPagina > 10 ? 10 : porPagina} />}
                {!q.isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhuma proposta encontrada.
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
                {Math.min(paginaAtual * porPagina, total)} de {total}
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

