import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { listSapProdutos, syncSapProdutos } from "@/lib/sap-produtos.functions";
import { Loader2, Package, RefreshCw, Search } from "lucide-react";

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

const PAGE_SIZES = [10, 25, 50, 100];

function ProdutosPage() {
  const list = useServerFn(listSapProdutos);
  const sync = useServerFn(syncSapProdutos);

  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("all");
  const [status, setStatus] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["sap-produtos"],
    queryFn: () => list({}),
  });

  const syncMut = useMutation({
    mutationFn: () => sync({}),
    onSuccess: (r) => {
      toast.success(`Sincronização concluída: ${r.inserted} novos, ${r.updated} atualizados.`);
      refetch();
    },
    onError: (e: any) => {
      toast.error(String(e?.message ?? e));
      refetch();
    },
  });

  const produtos = data?.produtos ?? [];
  const tipos = useMemo(
    () => Array.from(new Set(produtos.map((p) => p.tipo))).sort(),
    [produtos],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return produtos.filter((p) => {
      if (tipo !== "all" && p.tipo !== tipo) return false;
      if (status === "ativos" && !p.ativo) return false;
      if (status === "inativos" && p.ativo) return false;
      if (!term) return true;
      return (
        p.codigo.toLowerCase().includes(term) ||
        p.descricao.toLowerCase().includes(term) ||
        (p.lista_preco ?? "").toLowerCase().includes(term)
      );
    });
  }, [produtos, q, tipo, status]);

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
            <Button size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
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
                  {t}
                </SelectItem>
              ))}
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
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Sincronizado</th>
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
                    Nenhum produto encontrado. Clique em “Sinc. SAP” para importar o catálogo.
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">{p.codigo}</td>
                    <td className="px-3 py-2">{p.descricao}</td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary">{p.tipo}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{p.lista_preco ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.permissao}</td>
                    <td className="px-3 py-2">
                      <Badge variant={p.ativo ? "default" : "outline"}>
                        {p.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
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
      </div>
    </AppLayout>
  );
}
