import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
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
  listSapCatalogoCompleto,
  setSapCatalogoNoPortal,

  listSapProdutos,
  listSapSyncRuns,
  setSapProdutoVisibilidade,
  setSapProdutoOverride,
  varrerCatalogoVendaveisAction,
  syncSapProdutos,
  type SapSyncResult,
  type SapVisibilidade,
} from "@/lib/sap-produtos.functions";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const SYNC_ETAPAS = [
  "Conectando ao SAP Bridge…",
  "Lendo materiais (RFC listar_material)…",
  "Atualizando o espelho completo do SAP…",
  "Classificando e gravando o catálogo do portal…",
  "Finalizando e registrando o histórico…",
] as const;

import { VISIBILIDADE_LABELS, VISIBILIDADE_OPTIONS, validateVisibilidadeChange } from "@/lib/product-visibility";

const VIS_LABELS: Record<string, string> = VISIBILIDADE_LABELS;
import { Loader2, Package, RefreshCw, Search, ShieldCheck, AlertTriangle, XCircle, History, CheckCircle2, Download } from "lucide-react";
import {
  classificarDetalhado,
  validarRegras,
  TIPO_PREFIXOS,
  TIPO_LABELS,
} from "@/lib/sap-produtos-rules";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";

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
  component: () => (
    <AdminRouteGuard feature="admin.objetos.produtos" area="configuracoes">
      <ProdutosPage />
    </AdminRouteGuard>
  ),
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

function CatalogoSapCompleto({ onPropagar }: { onPropagar: () => void }) {
  const listAll = useServerFn(listSapCatalogoCompleto);
  const setNoPortal = useServerFn(setSapCatalogoNoPortal);
  const [q, setQ] = useState("");
  const [escopo, setEscopo] = useState<"todos" | "catalogo" | "fora" | "sem_ncm">("todos");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [salvando, setSalvando] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["sap-catalogo-completo"],
    queryFn: () => listAll({}),
  });

  const alternarCatalogo = async (codigo: string, no_catalogo: boolean) => {
    setSalvando(codigo);
    try {
      await setNoPortal({ data: { codigo, no_catalogo } });
      toast.success(
        no_catalogo
          ? `${codigo} enviado ao catálogo do portal (inativo, defina a visibilidade em Produtos).`
          : `${codigo} removido do catálogo do portal.`,
      );
      await refetch();
      onPropagar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao atualizar o catálogo.");
    } finally {
      setSalvando(null);
    }
  };


  const itens = data?.itens ?? [];
  const semNcm = useMemo(() => itens.filter((i) => !i.ncm_codigo), [itens]);
  const semNcmNoCatalogo = useMemo(() => semNcm.filter((i) => i.no_catalogo), [semNcm]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return itens.filter((i) => {
      if (escopo === "catalogo" && !i.no_catalogo) return false;
      if (escopo === "fora" && i.no_catalogo) return false;
      if (escopo === "sem_ncm" && i.ncm_codigo) return false;
      if (!term) return true;
      return (
        i.codigo.toLowerCase().includes(term) ||
        i.descricao.toLowerCase().includes(term) ||
        (i.ncm_codigo ?? "").includes(term)
      );
    });
  }, [itens, q, escopo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages - 1);
  const rows = filtered.slice(current * pageSize, current * pageSize + pageSize);


  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Espelho de leitura de <strong>todos</strong> os materiais devolvidos pelo SAP, inclusive os que não fazem
        parte do catálogo do portal. Atualizado a cada “Sinc. SAP”.
      </p>

      {!isLoading && semNcm.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-medium">
                {semNcm.length} material(is) sem NCM no SAP
                {semNcmNoCatalogo.length > 0 && ` — ${semNcmNoCatalogo.length} no catálogo do portal`}
              </p>
              <p className="text-muted-foreground">
                A RFC <code className="font-mono">listar_material</code> não devolveu o campo NCM (STEUC) para esses
                itens, por isso a coluna aparece como “—”. Próximo passo: solicitar ao time SAP a liberação do campo
                <code className="font-mono"> MARA-STEUC</code> na estrutura de saída <code className="font-mono">e_t_material</code>
                {" "}e o preenchimento do NCM no cadastro do material. Depois, rode “Sinc. SAP” novamente.
              </p>
              {semNcmNoCatalogo.length > 0 && (
                <p className="text-muted-foreground">
                  Itens do portal: {semNcmNoCatalogo.slice(0, 8).map((i) => i.codigo).join(", ")}
                  {semNcmNoCatalogo.length > 8 && ` +${semNcmNoCatalogo.length - 8}`}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEscopo("sem_ncm");
              setPage(0);
            }}
          >
            Ver itens sem NCM
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por código, descrição ou NCM"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Select value={escopo} onValueChange={(v) => { setEscopo(v as typeof escopo); setPage(0); }}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os materiais</SelectItem>
            <SelectItem value="catalogo">Somente no catálogo do portal</SelectItem>
            <SelectItem value="fora">Fora do catálogo do portal</SelectItem>
            <SelectItem value="sem_ncm">Somente sem NCM</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} aria-label="Atualizar catálogo completo">
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Código</th>
              <th className="text-left px-3 py-2">Descrição</th>
              <th className="text-left px-3 py-2">Unidade</th>
              <th className="text-left px-3 py-2">NCM (SAP)</th>
              <th className="text-left px-3 py-2">No catálogo</th>
              <th className="text-left px-3 py-2">Sincronizado</th>
              <th className="text-right px-3 py-2">Ação</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">

                  Nenhum material. Clique em “Sinc. SAP” para importar o catálogo completo.
                </td>
              </tr>
            ) : (
              rows.map((i) => (
                <tr key={i.codigo} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">{i.codigo}</td>
                  <td className="px-3 py-2">{i.descricao}</td>
                  <td className="px-3 py-2 text-muted-foreground">{i.unidade ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{i.ncm_codigo ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge variant={i.no_catalogo ? "default" : "outline"}>{i.no_catalogo ? "Sim" : "Não"}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fmt(i.last_synced_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant={i.no_catalogo ? "ghost" : "outline"}
                      size="sm"
                      disabled={salvando === i.codigo}
                      onClick={() => alternarCatalogo(i.codigo, !i.no_catalogo)}
                      title={
                        i.no_catalogo
                          ? "Remover do catálogo do portal"
                          : "Enviar este material para o catálogo do portal (entra inativo)"
                      }
                    >
                      {salvando === i.codigo ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : i.no_catalogo ? (
                        "Remover"
                      ) : (
                        "Enviar ao catálogo"
                      )}
                    </Button>
                  </td>
                </tr>
              ))
            )}

          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {filtered.length} material(is) • página {current + 1} de {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
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
          <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Anterior
          </Button>
          <Button variant="outline" size="sm" disabled={current >= totalPages - 1} onClick={() => setPage(current + 1)}>
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProdutosPage() {
  const list = useServerFn(listSapProdutos);
  const setVis = useServerFn(setSapProdutoVisibilidade);
  const sync = useServerFn(syncSapProdutos);
  const listRuns = useServerFn(listSapSyncRuns);
  const setOverride = useServerFn(setSapProdutoOverride);
  const varrerPrecos = useServerFn(varrerCatalogoVendaveisAction);

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
  const [aba, setAba] = useState<"portal" | "sap">("portal");




  const alterarVisibilidade = async (id: string, v: SapVisibilidade, p?: { origem: string | null; custo: number | null; ncm_id: string | null }) => {
    const impedimento = p
      ? validateVisibilidadeChange(v, { origem: p.origem, custo: p.custo, ncm_id: p.ncm_id })
      : null;
    if (impedimento) return toast.error(impedimento);
    try {
      await setVis({ data: { id, visibilidade: v } });
      toast.success(`Visibilidade alterada para “${VIS_LABELS[v]}”.`);
      refetch();
      propagar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao alterar visibilidade.");
    }
  };

  const qc = useQueryClient();
  /** Propaga mudanças do SAP para as telas de Gestão de Produtos (Carregadores/Solar). */
  const propagar = () => {
    qc.invalidateQueries({ queryKey: ["carregadores-products"] });
    qc.invalidateQueries({ queryKey: ["carregadores-products-admin"] });
    qc.invalidateQueries({ queryKey: ["sap-catalogo-completo"] });
    qc.invalidateQueries({ queryKey: ["produtos"] });
  };

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["sap-produtos"],
    queryFn: () => list({}),
  });

  const runsQuery = useQuery({
    queryKey: ["sap-sync-runs"],
    queryFn: () => listRuns({}),
  });

  // Progresso visual: a RFC do SAP é uma chamada única, então avançamos por
  // etapas cronometradas e travamos em 95% até a resposta chegar.
  const [syncEtapa, setSyncEtapa] = useState(0);
  const [syncResultado, setSyncResultado] = useState<SapSyncResult | null>(null);
  const [syncErro, setSyncErro] = useState<string | null>(null);

  const syncMut = useMutation({
    mutationFn: () => sync({}),
    onMutate: () => {
      setSyncResultado(null);
      setSyncErro(null);
      setSyncEtapa(0);
    },
    onSuccess: (r) => {
      setSyncEtapa(SYNC_ETAPAS.length);
      setSyncResultado(r);
      toast.success(
        r.inserted === 0 && r.updated === 0 && !r.deactivated
          ? `Nada mudou no SAP desde a última sincronização (${r.unchanged} produtos verificados).`
          : `Sincronização concluída: ${r.inserted} novos, ${r.updated} atualizados, ${r.unchanged} sem mudança${r.deactivated ? `, ${r.deactivated} inativados` : ""}.`,
      );
      refetch();
      runsQuery.refetch();
      propagar();
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? e);
      setSyncErro(msg);
      toast.error(msg);
      refetch();
      runsQuery.refetch();
    },
  });

  // Varredura de preço: o material só é vendável quando tem preço vigente no SAP.
  const varrerMut = useMutation({
    mutationFn: (codigos?: string[]) => varrerPrecos({ data: codigos?.length ? { codigos } : {} }),
    onSuccess: (r: any) => {
      toast.success(
        r?.skipped
          ? String(r?.motivo ?? "Nada para verificar.")
          : `Preços verificados: ${r?.verificados ?? 0} materiais, ${r?.comPreco ?? 0} com preço, ${r?.ativados ?? 0} ativados, ${r?.desativados ?? 0} desativados.`,
      );
      refetch();
      propagar();
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  const overrideMut = useMutation({
    mutationFn: (v: { id: string; override: boolean | null }) => setOverride({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(
        v.override === null
          ? "Override removido: o status volta a seguir o preço do SAP."
          : `Produto ${v.override ? "ativado" : "desativado"} manualmente (vence a varredura de preço).`,
      );
      refetch();
      propagar();
    },
    onError: (e: any) => toast.error(String(e?.message ?? e)),
  });

  useEffect(() => {
    if (!syncMut.isPending) return;
    setSyncEtapa(1);
    const t = setInterval(() => {
      setSyncEtapa((e) => Math.min(e + 1, SYNC_ETAPAS.length - 1));
    }, 2500);
    return () => clearInterval(t);
  }, [syncMut.isPending]);


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
      if (visibilidade !== "all" && (p.visibilidade ?? "nenhuma") !== visibilidade) return false;
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
      Visibilidade: VIS_LABELS[p.visibilidade ?? "nenhuma"],
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

            <Button
              variant="outline"
              size="sm"
              onClick={() => varrerMut.mutate(undefined)}
              disabled={varrerMut.isPending}
              title="Simula preço no SAP (listas 01 e 02) e ativa/desativa o catálogo. Overrides manuais são preservados."
            >
              {varrerMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-2" />
              )}
              {varrerMut.isPending ? "Verificando preços…" : "Verificar preços"}
            </Button>

            <Button size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending || errosRegras.length > 0}>
              {syncMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {syncMut.isPending ? "Sincronizando…" : "Sinc. SAP"}
            </Button>
          </div>
        </div>

        {syncMut.isPending && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {SYNC_ETAPAS[Math.min(syncEtapa, SYNC_ETAPAS.length - 1)]}
            </div>
            <Progress value={Math.min(5 + syncEtapa * (90 / SYNC_ETAPAS.length), 95)} className="h-2" />
            <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              {SYNC_ETAPAS.map((etapa, i) => (
                <li key={etapa} className="flex items-center gap-2">
                  {i < syncEtapa ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : i === syncEtapa ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-full border border-border" />
                  )}
                  <span className={i <= syncEtapa ? "text-foreground" : ""}>{etapa}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Não feche esta página. O SAP costuma levar de 10 a 60 segundos, dependendo do volume de materiais.
            </p>
          </div>
        )}

        {syncErro && !syncMut.isPending && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Falha na sincronização com o SAP</AlertTitle>
            <AlertDescription className="space-y-2">
              <p className="break-words">{syncErro}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => syncMut.mutate()}>
                  Tentar novamente
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard?.writeText(syncErro);
                    toast.success("Detalhes do erro copiados.");
                  }}
                >
                  Copiar detalhes
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSyncErro(null)}>
                  Dispensar
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {syncResultado && !syncMut.isPending && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Sincronização concluída em {(syncResultado.duracaoMs / 1000).toFixed(1)}s
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSyncResultado(null)}>
                Fechar
              </Button>
            </div>
            <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "Materiais lidos do SAP", valor: syncResultado.totalSap },
                { label: "Liberados p/ o portal", valor: syncResultado.totalLiberados },
                { label: "Novos importados", valor: syncResultado.inserted },
                { label: "Atualizados", valor: syncResultado.updated },
                { label: "Sem mudança", valor: syncResultado.unchanged },
                { label: "Inativados", valor: syncResultado.deactivated },
              ].map((c) => (
                <div key={c.label} className="rounded-md border border-border bg-background px-3 py-2">
                  <div className="text-lg font-semibold tabular-nums">{c.valor}</div>
                  <div className="text-muted-foreground">{c.label}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Espelho completo do SAP: {syncResultado.catalogoAtualizado} registro(s) gravado(s),{" "}
              {syncResultado.catalogoInalterado} sem alteração.
              {syncResultado.semNcm > 0
                ? ` ${syncResultado.semNcm} material(is) ainda vieram sem NCM do SAP.`
                : ""}
            </p>
          </div>
        )}


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

        <div className="flex items-center gap-1 border-b border-border">
          {([
            { id: "portal", label: "Catálogo do portal" },
            { id: "sap", label: "Todos os produtos do SAP" },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setAba(t.id)}
              className={
                aba === t.id
                  ? "px-3 py-2 text-sm font-medium border-b-2 border-primary text-foreground"
                  : "px-3 py-2 text-sm text-muted-foreground border-b-2 border-transparent hover:text-foreground"
              }
            >
              {t.label}
            </button>
          ))}
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

        {aba === "portal" ? (
        <>
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
              <SelectItem value="nenhuma">Sem visibilidade</SelectItem>
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
                <th className="text-left px-3 py-2">NCM</th>
                <th className="text-left px-3 py-2">Lista de preço</th>
                <th className="text-left px-3 py-2">Permissão</th>
                <th className="text-left px-3 py-2">Visibilidade</th>
                <th className="text-left px-3 py-2">Preço no SAP</th>
                <th className="text-left px-3 py-2">Status</th>
                {audit && <th className="text-left px-3 py-2">Regra aplicada</th>}
                {audit && <th className="text-left px-3 py-2">Motivo</th>}
                <th className="text-left px-3 py-2">Sincronizado</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={audit ? 12 : 10} className="px-3 py-10 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={audit ? 12 : 10} className="px-3 py-10 text-center text-muted-foreground">
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
                    <td className="px-3 py-2 font-mono text-xs">
                      {p.ncm_codigo ?? "—"}
                      {p.ncm_codigo && !p.ncm_id ? (
                        <span className="ml-1 text-amber-500" title="NCM do SAP ainda não cadastrado na tabela de alíquotas">
                          !
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{p.lista_preco ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.permissao}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={p.visibilidade ?? "nenhuma"}
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
        </>
        ) : (
          <CatalogoSapCompleto onPropagar={propagar} />
        )}

      </div>
    </AppLayout>
  );
}
