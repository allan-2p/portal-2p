import { CAMPOS_BUSCA, placeholderBusca } from "@/lib/propostas-busca";
import { MOTIVOS_CANCELAMENTO } from "@/lib/cancelamento-motivos";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Copy, Eye, Pencil, Plus, Search, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { PROPOSTA_STATUS, podeCancelarPedido, podeEditarProposta } from "@/lib/proposta-status";
import { StatusDot, StatusLegend } from "@/components/proposta-status-ui";
import { formatSapNumero, formatPropostaNumero } from "@/lib/sap-numero";
import { bloqueiaReenvioSap } from "@/lib/proposta-legado";
import {
  excluirPropostaFn,
  listarPropostasPaginaFn,
} from "@/lib/propostas.functions";
import { fmtBRL } from "@/lib/carregadores";
import { PermissionGate, useCan, useCanDelete } from "@/components/permission-gate";
import { PropostaDetalheDialog } from "@/components/proposta-detalhe";
import { PedidoIntegracoesDialog } from "@/components/pedido-integracoes-dialog";
import { PropostasMobileCards } from "@/components/propostas-mobile-cards";

export const Route = createFileRoute("/_authenticated/solar/propostas/")({
  validateSearch: (s: Record<string, unknown>): { ver?: string } =>
    typeof s.ver === "string" ? { ver: s.ver } : {},
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
  nf_numero?: string | null;
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
  expedido_em?: string | null;
  finalizado_em?: string | null;
  sap_ov_status?: string | null;
  sf_status?: string | null;
};

const STATUS = PROPOSTA_STATUS;

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR",
  "PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

function PropostasSolarPage() {
  const { ver } = Route.useSearch();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [uf, setUf] = useState("todos");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  // A pesquisa roda no banco (base inteira): espera parar de digitar.
  const [campo, setCampo] = useState<string>("tudo");
  const [buscaDb, setBuscaDb] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setBuscaDb(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca]);
  const [detalheId, setDetalheId] = useState<string | null>(ver ?? null);
  const [integracoesId, setIntegracoesId] = useState<string | null>(null);
  const [excluirId, setExcluirId] = useState<string | null>(null);
  const [motivoCancel, setMotivoCancel] = useState("");
  const podeExcluir = useCanDelete();
  const podeVerIntegracoes = useCan("admin.logs.integracoes");

  const q = useQuery({
    queryKey: ["solar-proposals", { buscaDb, campo, status, uf, pagina, porPagina }],
    queryFn: async (): Promise<{ rows: Row[]; total: number }> => {
      const data = await listarPropostasPaginaFn({
        data: { organizacao: "solar", q: buscaDb, campo, status, uf, pagina, porPagina },
      });
      return {
        rows: ((data?.rows ?? []) as any[]).map((r) => ({
          ...r,
          totais: (r.totais as Record<string, number>) ?? {},
        })) as Row[],
        total: data?.total ?? 0,
      };
    },
    // Status muda no servidor (SAP/Salesforce/cobrança) depois da conclusão:
    // a lista sempre revalida ao abrir e ao voltar o foco, mostrando os dados
    // em cache enquanto atualiza (nada trava a tela).
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
    // Enquanto houver pedido em processamento, atualiza sozinho a cada 6s —
    // e só nesse caso, para não pesar o portal.
    refetchInterval: (query) => {
      const dados = (query.state.data?.rows ?? []) as Row[];
      const pendente = dados.some(
        (r) =>
          r.status === "Aguardando Pagamento" ||
          (r.sap_ov_status && r.sap_ov_status !== "criada" && r.sap_ov_status !== "erro") ||
          (r.sf_status && r.sf_status !== "sincronizado" && r.sf_status !== "erro"),
      );
      return pendente ? 6000 : false;
    },
    refetchIntervalInBackground: false,
  });

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  // Filtro, ordenação (mais recente primeiro) e paginação vêm do banco.
  const filtered = rows;
  const ufs = UFS;

  useEffect(() => setPagina(1), [buscaDb, campo, status, uf, porPagina]);

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = rows;
  const detalheIdx = detalheId ? filtered.findIndex((r) => r.id === detalheId) : -1;


  const propostaParaExcluir = excluirId ? rows.find((r) => r.id === excluirId) ?? null : null;
  // Pedido com ordem no SAP não é apagado: vira "Cancelado" e exige motivo.
  const ehCancelamentoSap = !!propostaParaExcluir?.sap_ov_numero || podeCancelarPedido(propostaParaExcluir?.status);

  async function confirmarExclusao() {
    if (!excluirId) return;
    if (ehCancelamentoSap && !motivoCancel) {
      toast.error("Informe o motivo do cancelamento.");
      return;
    }
    try {
      const r = await excluirPropostaFn({
        data: { id: excluirId, ...(motivoCancel ? { motivo: motivoCancel } : {}) },
      });
      setExcluirId(null);
      setMotivoCancel("");
      if (r?.aviso) toast.warning(r.aviso, { duration: 10000 });
      else toast.success(ehCancelamentoSap ? "Pedido cancelado." : "Proposta excluída.");
      q.refetch();
      return;
    } catch (e) {
      setExcluirId(null);
      setMotivoCancel("");
      return toast.error((e as Error).message);
    }
  }

  return (
    <AppLayout>
      <div className="max-w-[1700px] mx-auto space-y-4 sm:space-y-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-primary font-semibold">2P Solar</div>
            <h1 className="text-2xl sm:text-3xl font-bold mt-1">Propostas</h1>
          </div>
          <PermissionGate feature="propostas" action="editar" mode="disable">
            <Button asChild className="gap-2 shrink-0">
              <Link to="/solar/propostas/nova">
                <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Nova proposta</span>
                <span className="sm:hidden">Nova</span>
              </Link>
            </Button>
          </PermissionGate>
        </div>

        <div className="glass rounded-2xl p-3 sm:p-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <div className="relative col-span-2 sm:flex-1 sm:min-w-[220px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={placeholderBusca(campo)}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Select value={campo} onValueChange={setCampo}>
            <SelectTrigger className="w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CAMPOS_BUSCA.map((c) => (
                <SelectItem key={c.valor} value={c.valor}>{c.rotulo}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={uf} onValueChange={setUf}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as UFs</SelectItem>
              {ufs.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>


        <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
          <StatusLegend
            className="min-w-max sm:min-w-0"
            active={status === "todos" ? null : [status]}
            onToggle={(s) => setStatus(status === s ? "todos" : s)}
          />
        </div>

        <div className="glass rounded-2xl overflow-hidden">
          <div className="md:hidden">
            <PropostasMobileCards
              rows={visiveis as any}
              rotaNova="/solar/propostas/nova"
              carregando={q.isLoading}
              podeExcluir={podeExcluir}
              onDetalhe={setDetalheId}
              onIntegracoes={setIntegracoesId}
              onExcluir={setExcluirId}
            />
          </div>
          <div className="hidden md:block">
            <table className="w-full table-fixed text-[13px]">
              <colgroup>
                <col className="w-[52px]" />
                <col className="w-[150px]" />
                <col className="w-[22%]" />
                <col className="w-[14%]" />
                <col className="w-[76px]" />
                <col className="w-[76px]" />
                <col className="w-[110px]" />
                <col className="w-[96px]" />
                <col className="w-[96px]" />
                <col className="w-[96px]" />
                <col className="w-[172px]" />
              </colgroup>

               <thead>
                 <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                   <th className="text-center px-3 py-2.5">Status</th>
                   <th className="text-left px-3 py-2.5">Proposta</th>
                  <th className="text-left px-3 py-2.5">Cliente</th>
                  <th className="text-left px-3 py-2.5">Consultor</th>
                  <th className="text-left px-3 py-2.5">Nº SAP</th>
                  <th className="text-left px-3 py-2.5">NF</th>
                  <th className="text-right px-3 py-2.5">Valor</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Despacho</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Compra</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Criação</th>
                  <th className="text-right px-3 py-2.5">Ações</th>
                </tr>
              </thead>

              <tbody className={fetchingClass(q.isFetching, q.isLoading)}>
                {visiveis.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="px-3 py-2.5 text-center">
                      <StatusDot status={r.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="truncate text-sm font-bold tabular-nums text-foreground">
                        {formatPropostaNumero(r.numero) || "—"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.nome || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="truncate font-medium">{r.cliente_nome}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="truncate text-sm text-muted-foreground">
                        {r.consultor_nome || r.criado_por_nome || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {formatSapNumero(r.sap_ov_numero || r.numero_sap) || "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {r.nf_numero ? formatSapNumero(r.nf_numero) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">
                      {fmtBRL(r.totais['valorTotal'] ?? 0)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {r.expedido_em
                        ? new Date(`${String(r.expedido_em).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {r.finalizado_em ? new Date(r.finalizado_em).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <StatusDot status={r.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Detalhar" onClick={() => setDetalheId(r.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {!bloqueiaReenvioSap(r) && podeEditarProposta(r.status) && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Continuar proposta" asChild>
                            <Link to="/solar/propostas/nova" search={{ id: r.id }}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Duplicar proposta" asChild>
                          <Link to="/solar/propostas/nova" search={{ dup: r.id }}>
                            <Copy className="h-4 w-4" />
                          </Link>
                        </Button>
                         {podeVerIntegracoes && (
                           <Button
                             variant="ghost"
                             size="icon"
                             aria-label="Integrações e auditoria"
                             title="Integrações e auditoria"
                             className={`h-8 w-8 ${r.sap_ov_status === "criada" && r.sf_status === "sincronizado" ? "text-success" : "text-warning"}`}
                             onClick={() => setIntegracoesId(r.id)}
                           >
                             <RefreshCw className="h-4 w-4" />
                           </Button>
                         )}
                        {podeExcluir && podeCancelarPedido(r.status) && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Cancelar pedido" title="Cancelar pedido" onClick={() => setExcluirId(r.id)}>
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {q.isLoading && <TableSkeletonRows colunas={11} linhas={porPagina > 10 ? 10 : porPagina} />}
                {!q.isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhuma proposta encontrada.
                    </td>
                  </tr>
                )}

              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                Mostrando {(paginaAtual - 1) * porPagina + 1}–
                {Math.min(paginaAtual * porPagina, total)} de {total}
                {q.isFetching && !q.isLoading && (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-transparent" aria-label="Atualizando" />
                )}
              </div>

              <div className="flex items-center justify-between gap-2 sm:justify-end">
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

      <AlertDialog
        open={!!excluirId}
        onOpenChange={(open) => {
          if (!open) {
            setExcluirId(null);
            setMotivoCancel("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ehCancelamentoSap ? "Cancelar pedido?" : "Excluir proposta?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {ehCancelamentoSap
                ? "O pedido já tem ordem de venda no SAP e não será apagado: ele será marcado como Cancelado, o SAP e os setores serão avisados. Informe o motivo do cancelamento."
                : "Essa ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {ehCancelamentoSap && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Motivo do cancelamento <span className="text-destructive">*</span>
              </label>
              <Select value={motivoCancel} onValueChange={setMotivoCancel}>
                <SelectTrigger><SelectValue placeholder="Selecione o motivo…" /></SelectTrigger>
                <SelectContent>
                  {MOTIVOS_CANCELAMENTO.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setExcluirId(null); setMotivoCancel(""); }}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusao}
              disabled={ehCancelamentoSap && !motivoCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {ehCancelamentoSap ? "Sim, cancelar pedido" : "Sim, excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
