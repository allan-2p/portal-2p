import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Package, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logModeration } from "@/lib/moderation-audit";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";

export const Route = createFileRoute("/_authenticated/admin/produtos-solar")({
  head: () => ({
    meta: [
      { title: "Gestão de Produtos — 2P Solar" },
      { name: "description", content: "Controle de produtos ativos e inativos do catálogo 2P Solar, alimentado pelo SAP." },
      { property: "og:title", content: "Gestão de Produtos — 2P Solar" },
      { property: "og:description", content: "Ative ou inative os produtos disponíveis no portal 2P Solar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.produtos" area="moderacao">
      <ProdutosSolarPage />
    </AdminRouteGuard>
  ),
});

type Row = {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  ativo: boolean;
  visibilidade: string;
  preco_sugerido: number;
  last_synced_at: string | null;
};


const PAGE_SIZES = [10, 25, 50, 100];

function ProdutosSolarPage() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<"todos" | "ativos" | "inativos">("todos");
  const [tipo, setTipo] = useState("all");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const { data: produtos = [], isLoading } = useQuery({
    queryKey: ["produtos-solar"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("sap_produtos")
        .select("id, codigo, descricao, tipo, ativo, visibilidade, last_synced_at")
        .in("visibilidade", ["solar", "ambos"])
        .order("descricao");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 60_000,
  });

  const tipos = useMemo(
    () => Array.from(new Set(produtos.map((p) => p.tipo))).sort(),
    [produtos],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (q && !`${p.codigo} ${p.descricao}`.toLowerCase().includes(q)) return false;
      if (status === "ativos" && !p.ativo) return false;
      if (status === "inativos" && p.ativo) return false;
      if (tipo !== "all" && p.tipo !== tipo) return false;
      return true;
    });
  }, [produtos, busca, status, tipo]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const visiveis = filtrados.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const ativos = produtos.filter((p) => p.ativo).length;

  async function toggleAtivo(p: Row) {
    const { error } = await supabase.from("sap_produtos").update({ ativo: !p.ativo }).eq("id", p.id);
    if (error) return toast.error(error.message);
    void logModeration({
      area: "produtos",
      action: p.ativo ? "desativou" : "ativou",
      target: p.codigo,
      summary: `Produto ${p.ativo ? "desativado" : "ativado"} no 2P Solar: ${p.descricao}`,
    });
    void qc.invalidateQueries({ queryKey: ["produtos-solar"] });
  }

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-primary font-semibold">Moderação · 2P Solar</div>
          <h1 className="text-3xl font-bold mt-1">Gestão de Produtos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Catálogo vindo do SAP e mantido na base do portal. Aqui você controla quais produtos
            ficam ativos para o 2P Solar.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card icon={Package} label="Produtos visíveis no Solar" value={produtos.length} />
          <Card icon={CheckCircle2} label="Ativos" value={ativos} />
          <Card icon={XCircle} label="Inativos" value={produtos.length - ativos} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por código ou descrição"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select value={status} onValueChange={(v: any) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="ativos">Somente ativos</SelectItem>
              <SelectItem value="inativos">Somente inativos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tipo} onValueChange={(v) => { setTipo(v); setPage(1); }}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {tipos.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="text-left px-4 py-3">Código (SKU)</th>
                  <th className="text-left px-4 py-3">Descrição</th>
                  <th className="text-left px-4 py-3">Tipo</th>
                  <th className="text-right px-4 py-3">Preço sugerido (R$)</th>
                  <th className="text-center px-4 py-3">Ativo</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.codigo}</td>
                    <td className="px-4 py-3 font-medium">{p.descricao}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.tipo}</td>
                    <td className="px-4 py-3 text-right">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="h-8 w-32 ml-auto text-right"
                        defaultValue={Number(p.preco_sugerido ?? 0) || ""}
                        placeholder="0,00"
                        onBlur={(e) => void salvarPreco(p, e.currentTarget.value)}
                        aria-label={`Preço sugerido de ${p.codigo}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Switch checked={p.ativo} onCheckedChange={() => toggleAtivo(p)} aria-label="Ativar produto" />
                    </td>
                  </tr>
                ))}
                {visiveis.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      {isLoading ? "Carregando…" : "Nenhum produto encontrado."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>{filtrados.length} produto(s)</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-8 w-[90px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((s) => (
                    <SelectItem key={s} value={String(s)}>{s} / pág.</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={pageSafe <= 1} onClick={() => setPage(pageSafe - 1)}>
                Anterior
              </Button>
              <span className="text-muted-foreground">{pageSafe} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={pageSafe >= totalPages} onClick={() => setPage(pageSafe + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}

function Card({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="glass rounded-2xl p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </div>
  );
}
