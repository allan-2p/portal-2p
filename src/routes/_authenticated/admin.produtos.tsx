import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { ModerationAuditLog } from "@/components/moderation-audit-log";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listSapProdutos,
  listSapSyncRuns,
  setSapProdutoVisibilidade,
  syncSapProdutos,
  type SapVisibilidade,
} from "@/lib/sap-produtos.functions";

import { VISIBILIDADE_LABELS, VISIBILIDADE_OPTIONS, validateVisibilidadeChange } from "@/lib/product-visibility";

const VIS_LABELS: Record<string, string> = VISIBILIDADE_LABELS;
import { Loader2, Package, RefreshCw, Search, ShieldCheck, AlertTriangle, XCircle, History, CheckCircle2, Download } from "lucide-react";
import {
  classificarDetalhado,
  validarRegras,
  TIPO_PREFIXOS,
  TIPO_LABELS,
} from "@/lib/sap-produtos-rules";

export const Route = createFileRoute("/_authenticated/admin/produtos")({
  head: () => ({
    meta: [
      { title: "Produtos SAP | Portal 2P" },
      {
        name: "description",
        content: "Catálogo de produtos sincronizado com o SAP: códigos, descrições, tipos e listas de preço.",
      },
      { property: "og:title", content: "Produtos SAP | Portal 2P" },
      {
        property: "og:description",
        content: "Catálogo de produtos sincronizado com o SAP no Portal 2P.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProdutosPage,
});

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

function duracao(inicio: string, fim: string | null) {
  if (!fim) return "—";
  const ms = new Date(fim).getTime() - new Date(inicio).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const PAGE_SIZES = [10, 25, 50, 100];

function ProdutosPage() {
  const list = useServerFn(listSapProdutos);
  const setVis = useServerFn(setSapProdutoVisibilidade);
  const sync = useServerFn(syncSapProdutos);
  const listRuns = useServerFn(listSapSyncRuns);

  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("all");
  const [permissao, setPermissao] = useState("all");
  const [visibilidade, setVisibilidade] = useState("all");
  const [status, setStatus] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [audit, setAudit] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const [soDivergentes, setSoDivergentes] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const alterarVisibilidade = async (id: string, v: SapVisibilidade, p?: { origem: string | null; custo: number | null; ncm_id: string | null }) => {
    const impedimento = p
      ? validateVisibilidadeChange(v, { origem: p.origem, custo: p.custo, ncm_id: p.ncm_id })
      : null;
    if (impedimento) return toast.error(impedimento);
    try {
      await setVis({ data: { id, visibilidade: v } });
      toast.success(`Visibilidade alterada para “${VIS_LABELS[v]}”.`);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao alterar visibilidade.");
    }
  };

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["sap-produtos"],
    queryFn: () => list({}),
  });

  const runsQuery = useQuery({
    queryKey: ["sap-sync-runs"],
    queryFn: () => listRuns({}),
  });

  const syncMut = useMutation({
    mutationFn: () => sync({}),
    onSuccess: (r) => {
      toast.success(
        `Sincronização concluída: ${r.inserted} novos, ${r.updated} atualizados${r.deactivated ? `, ${r.deactivated} inativados` : ""}.`,
      );
      refetch();
      runsQuery.refetch();
    },
    onError: (e: any) => {
      toast.error(String(e?.message ?? e));
      refetch();
      runsQuery.refetch();
    },
  });

  const problemasRegras = useMemo(() => validarRegras(), []);
  const errosRegras = problemasRegras.filter((p) => p.nivel === "erro");

  const produtos = useMemo(
    () =>
      (data?.produtos ?? []).map((p) => {
        const det = classificarDetalhado(p.descricao);
        return { ...p, det, divergente: det.tipo !== p.tipo || det.fallback || det.concorrentes.length > 0 };
      }),
    [data],
  );
  const tipos = useMemo(
    () => Array.from(new Set(produtos.map((p) => p.tipo))).sort(),
    [produtos],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return produtos.filter((p) => {
      if (tipo !== "all" && p.tipo !== tipo) return false;
      if (permissao !== "all" && (p.permissao ?? "").toLowerCase() !== permissao) return false;
      if (visibilidade !== "all" && (p.visibilidade ?? "ambos") !== visibilidade) return false;
      if (status === "ativos" && !p.ativo) return false;
      if (status === "inativos" && p.ativo) return false;
      if (soDivergentes && !p.divergente) return false;
      if (!term) return true;
      return (
        p.codigo.toLowerCase().includes(term) ||
        p.descricao.toLowerCase().includes(term) ||
        (p.permissao ?? "").toLowerCase().includes(term) ||
        (p.lista_preco ?? "").toLowerCase().includes(term)
      );
    });
  }, [produtos, q, tipo, permissao, visibilidade, status, soDivergentes]);


  const exportXlsx = async () => {
    if (filtered.length === 0) {
      toast.error("Nenhum produto para exportar com os filtros atuais.");
      return;
    }
    const XLSX = await import("xlsx");
    const linhas = filtered.map((p) => ({
      Código: p.codigo,
      Descrição: p.descricao,
      Tipo: TIPO_LABELS[p.tipo] ?? p.tipo,
      Permissão: p.permissao ?? "",
      Visibilidade: VIS_LABELS[p.visibilidade ?? "ambos"],
      "Lista de preço": p.lista_preco ?? "",
      Status: p.ativo ? "Ativo" : "Inativo",
      "Última sincronização": p.last_synced_at ? new Date(p.last_synced_at).toLocaleString("pt-BR") : "",
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    ws["!cols"] = [{ wch: 14 }, { wch: 60 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produtos SAP");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `produtos-sap-${stamp}.xlsx`);
    toast.success(`${filtered.length} produto(s) exportado(s).`);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages - 1);
  const rows = filtered.slice(current * pageSize, current * pageSize + pageSize);
  const lastRun = data?.lastRun ?? null;


  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Produtos
            </h1>
            <p className="text-sm text-muted-foreground">
              Catálogo espelhado do SAP (RFC listar_material), classificado por prefixo da descrição.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Atualizar lista de produtos"
            >
              <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
            <Button
              variant={showRuns ? "default" : "outline"}
              size="sm"
              onClick={() => setShowRuns((v) => !v)}
            >
              <History className="h-4 w-4 mr-2" />
              Histórico
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportXlsx}
              disabled={isLoading || filtered.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar Excel
            </Button>
            <Button
              variant={audit ? "default" : "outline"}
              size="sm"
              onClick={() => setAudit((v) => !v)}
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              Auditoria
            </Button>

            <Button size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending || errosRegras.length > 0}>
              {syncMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sinc. SAP
            </Button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Última sincronização: {fmt(lastRun?.finished_at ?? lastRun?.started_at ?? null)}
          {lastRun ? (
            <>
              {" • "}
              <span
                className={
                  lastRun.status === "error"
                    ? "text-destructive"
                    : lastRun.status === "success"
                      ? "text-emerald-500"
                      : ""
                }
              >
                {lastRun.status === "success"
                  ? `${lastRun.inserted_count} novos / ${lastRun.updated_count} atualizados`
                  : lastRun.status === "error"
                    ? `erro: ${lastRun.error_message}`
                    : "em andamento"}
              </span>
            </>
          ) : null}
        </div>

        {showRuns && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <span>Histórico de sincronizações (SAP)</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => runsQuery.refetch()}
                disabled={runsQuery.isFetching}
                aria-label="Atualizar histórico de sincronizações"
              >
                <RefreshCw className={runsQuery.isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2">Início</th>
                  <th className="text-left px-3 py-2">Fim</th>
                  <th className="text-left px-3 py-2">Duração</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Inseridos</th>
                  <th className="text-right px-3 py-2">Atualizados</th>
                  <th className="text-left px-3 py-2">Erro</th>
                </tr>
              </thead>
              <tbody>
                {runsQuery.isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin inline" />
                    </td>
                  </tr>
                ) : (runsQuery.data?.runs ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                      Nenhuma sincronização registrada ainda.
                    </td>
                  </tr>
                ) : (
                  (runsQuery.data?.runs ?? []).map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-muted/30 align-top">
                      <td className="px-3 py-2 whitespace-nowrap">{fmt(r.started_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmt(r.finished_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{duracao(r.started_at, r.finished_at)}</td>
                      <td className="px-3 py-2">
                        {r.status === "success" ? (
                          <Badge className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Sucesso
                          </Badge>
                        ) : r.status === "error" ? (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="h-3 w-3" /> Erro
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" /> Em andamento
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.inserted_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.updated_count}</td>
                      <td className="px-3 py-2 text-xs text-destructive max-w-md break-words">
                        {r.error_message ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {audit && (
          <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/20">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="font-medium">Auditoria da classificação</span>
              <span className="text-muted-foreground">
                {TIPO_PREFIXOS.length} regras • {produtos.filter((p) => p.det.fallback).length} sem regra
                (“Acessórios”) • {produtos.filter((p) => p.det.tipo !== p.tipo).length} divergentes do valor gravado
                • {produtos.filter((p) => p.det.concorrentes.length > 0).length} com prefixo ambíguo
              </span>
              <Button
                variant={soDivergentes ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setSoDivergentes((v) => !v);
                  setPage(0);
                }}
              >
                Só itens com atenção
              </Button>
            </div>

            {problemasRegras.length === 0 ? (
              <p className="text-xs text-emerald-500">Nenhum conflito nas regras de prefixo.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {problemasRegras.map((pr, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {pr.nivel === "erro" ? (
                      <XCircle className="h-3.5 w-3.5 mt-0.5 text-destructive shrink-0" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                    )}
                    <span>
                      <span className="font-mono">{pr.prefixo}</span> — {pr.mensagem}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {errosRegras.length > 0 && (
              <p className="text-xs text-destructive">
                Sincronização bloqueada até que os erros de regra sejam corrigidos.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por código, descrição ou lista de preço"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <Select
            value={tipo}
            onValueChange={(v) => {
              setTipo(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {tipos.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_LABELS[t] ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={permissao}
            onValueChange={(v) => {
              setPermissao(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Permissão" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as permissões</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Select value={visibilidade} onValueChange={(v) => { setVisibilidade(v); setPage(0); }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Visibilidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as visibilidades</SelectItem>
              <SelectItem value="solar">2P Solar</SelectItem>
              <SelectItem value="carregadores">2P Carregadores</SelectItem>
              <SelectItem value="ambos">Grupo 2P</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as typeof status);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativos">Ativos</SelectItem>
              <SelectItem value="inativos">Inativos</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Código</th>
                <th className="text-left px-3 py-2">Descrição</th>
                <th className="text-left px-3 py-2">Tipo</th>
                <th className="text-left px-3 py-2">Lista de preço</th>
                <th className="text-left px-3 py-2">Permissão</th>
                <th className="text-left px-3 py-2">Visibilidade</th>
                <th className="text-left px-3 py-2">Status</th>
                {audit && <th className="text-left px-3 py-2">Regra aplicada</th>}
                {audit && <th className="text-left px-3 py-2">Motivo</th>}
                <th className="text-left px-3 py-2">Sincronizado</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={audit ? 10 : 8} className="px-3 py-10 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={audit ? 10 : 8} className="px-3 py-10 text-center text-muted-foreground">
                    Nenhum produto encontrado. Clique em “Sinc. SAP” para importar o catálogo.
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">{p.codigo}</td>
                    <td className="px-3 py-2">{p.descricao}</td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary">{TIPO_LABELS[p.tipo] ?? p.tipo}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{p.lista_preco ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.permissao}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={p.visibilidade ?? "ambos"}
                        onValueChange={(v) =>
                          alterarVisibilidade(p.id, v as SapVisibilidade, {
                            origem: p.origem ?? null,
                            custo: p.custo ?? null,
                            ncm_id: p.ncm_id ?? null,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-[168px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VISIBILIDADE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={p.ativo ? "default" : "outline"}>
                        {p.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                    {audit && (
                      <td className="px-3 py-2 text-xs">
                        {p.det.prefixo ? (
                          <span className="font-mono">
                            {p.det.prefixo} → {p.det.tipoDescricao}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">sem prefixo → Acessórios</span>
                        )}
                      </td>
                    )}
                    {audit && (
                      <td className="px-3 py-2 text-xs">
                        {p.det.tipo !== p.tipo ? (
                          <span className="text-destructive">
                            gravado como “{TIPO_LABELS[p.tipo] ?? p.tipo}”, regra indica “{p.det.tipoDescricao}”
                          </span>
                        ) : p.det.concorrentes.length > 0 ? (
                          <span className="text-amber-500">
                            ambíguo com {p.det.concorrentes.join(", ")}
                          </span>
                        ) : p.det.fallback ? (
                          <span className="text-muted-foreground">nenhuma regra casou</span>
                        ) : (
                          <span className="text-emerald-500">prefixo mais específico</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmt(p.last_synced_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {filtered.length} produto(s) • página {current + 1} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(0);
              }}
            >
              <SelectTrigger className="w-24 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s} / pág
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={current >= totalPages - 1}
              onClick={() => setPage(current + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>

        <ModerationAuditLog area="produtos" description="alterações no catálogo de produtos do Grupo 2P." />
      </div>
    </AppLayout>
  );
}
