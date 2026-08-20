import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Receipt, Search, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { AccessDenied } from "@/components/access-denied";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  listCondicoesPagamento,
  upsertCondicaoPagamento,
  toggleCondicaoPagamento,
  parcelasDaDescricao,
  type CondicaoPagamento,
} from "@/lib/condicoes-pagamento.functions";

export const Route = createFileRoute("/_authenticated/financeiro/condicoes")({
  head: () => ({
    meta: [
      { title: "Condições de Pagamento (ZTERM) — Portal 2P" },
      {
        name: "description",
        content:
          "Catálogo de condições de pagamento (ZTERM) do Grupo 2P: ativas no checkout, descontinuadas e parcelas enviadas ao SAP.",
      },
      { property: "og:title", content: "Condições de Pagamento (ZTERM) — Portal 2P" },
      {
        property: "og:description",
        content: "Gestão do catálogo de condições de pagamento enviadas ao SAP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CondicoesPage,
});

type Filtro = "checkout" | "ativas" | "inativas" | "todas";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "checkout", label: "No checkout" },
  { id: "ativas", label: "Ativas" },
  { id: "inativas", label: "Inativas" },
  { id: "todas", label: "Todas" },
];

function resumoParcelas(c: CondicaoPagamento): string {
  if (!c.parcelas?.length) return "—";
  return c.parcelas.map((p) => `${p.dias}d`).join(" / ");
}

function CondicoesPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const fetchList = useServerFn(listCondicoesPagamento);
  const salvar = useServerFn(upsertCondicaoPagamento);
  const alternar = useServerFn(toggleCondicaoPagamento);
  const qc = useQueryClient();

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("checkout");
  const [edit, setEdit] = useState<CondicaoPagamento | null>(null);

  const q = useQuery({
    queryKey: ["condicoes-pagamento"],
    queryFn: () => fetchList({ data: {} }),
    staleTime: 60_000,
    enabled: isAdmin,
  });

  const mToggle = useMutation({
    mutationFn: (v: { codigo: string; ativo: boolean }) => alternar({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["condicoes-pagamento"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao alterar."),
  });

  const mSalvar = useMutation({
    mutationFn: (v: CondicaoPagamento) => salvar({ data: v }),
    onSuccess: () => {
      toast.success("Condição salva.");
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["condicoes-pagamento"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (q.data ?? []).filter((c) => {
      if (filtro === "checkout" && !(c.ativo && c.parse_automatico)) return false;
      if (filtro === "ativas" && !c.ativo) return false;
      if (filtro === "inativas" && c.ativo) return false;
      if (!termo) return true;
      return c.codigo.toLowerCase().includes(termo) || c.descricao.toLowerCase().includes(termo);
    });
  }, [q.data, busca, filtro]);

  if (!isAdmin) {
    return (
      <AppLayout>
        <AccessDenied />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-[1200px] mx-auto space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Financeiro</div>
            <h1 className="text-2xl md:text-3xl font-bold mt-1 flex items-center gap-2">
              <Receipt className="h-6 w-6 text-primary" /> Condições de Pagamento
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Código ZTERM enviado ao SAP. No checkout aparecem só as condições ativas com parcelas
              calculadas automaticamente.
            </p>
          </div>
          <Button
            onClick={() =>
              setEdit({
                codigo: "",
                descricao: "",
                parcelas: null,
                num_parcelas: null,
                parse_automatico: true,
                ativo: true,
              })
            }
          >
            <Plus className="h-4 w-4 mr-1" /> Nova condição
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por código ou descrição…"
              className="pl-9"
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-border p-1 bg-surface">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                className={
                  "px-3 py-1.5 text-xs rounded-md transition-colors " +
                  (filtro === f.id
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:bg-surface-2")
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          {q.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : linhas.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">
              Nenhuma condição encontrada.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-3">Código</th>
                    <th className="text-left font-medium px-4 py-3">Descrição</th>
                    <th className="text-left font-medium px-4 py-3">Parcelas</th>
                    <th className="text-left font-medium px-4 py-3">Checkout</th>
                    <th className="text-left font-medium px-4 py-3">Ativo</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((c) => (
                    <tr key={c.codigo} className="border-t border-border">
                      <td className="px-4 py-2.5 font-mono font-medium">{c.codigo}</td>
                      <td className="px-4 py-2.5">{c.descricao}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {resumoParcelas(c)}
                        {c.num_parcelas ? (
                          <span className="ml-2 text-xs">({c.num_parcelas}x)</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        {c.ativo && c.parse_automatico ? (
                          <Badge variant="secondary">Disponível</Badge>
                        ) : (
                          <Badge variant="outline">
                            {c.parse_automatico ? "Inativa" : "Parcelas manuais"}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Switch
                          checked={c.ativo}
                          onCheckedChange={(v) => mToggle.mutate({ codigo: c.codigo, ativo: v })}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <EditDialog
        value={edit}
        onClose={() => setEdit(null)}
        onSave={(v) => mSalvar.mutate(v)}
        saving={mSalvar.isPending}
      />
    </AppLayout>
  );
}

function EditDialog({
  value,
  onClose,
  onSave,
  saving,
}: {
  value: CondicaoPagamento | null;
  onClose: () => void;
  onSave: (v: CondicaoPagamento) => void;
  saving: boolean;
}) {
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [dias, setDias] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [carregado, setCarregado] = useState<string | null>(null);

  // Reinicia os campos quando o diálogo abre em outra condição.
  const chave = value ? value.codigo || "__nova__" : null;
  if (chave !== carregado) {
    setCarregado(chave);
    setCodigo(value?.codigo ?? "");
    setDescricao(value?.descricao ?? "");
    setDias((value?.parcelas ?? []).map((p) => p.dias).join("/"));
    setAtivo(value?.ativo ?? true);
  }

  const parcelas = dias
    .split(/[^0-9]+/)
    .filter((s) => s !== "")
    .map((s) => ({ dias: Number(s) }));

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{value?.codigo ? `Editar ${value.codigo}` : "Nova condição"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Código (ZTERM)</label>
              <Input
                value={codigo}
                disabled={!!value?.codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="2P26"
                maxLength={8}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Situação</label>
              <div className="flex items-center gap-2 h-9">
                <Switch checked={ativo} onCheckedChange={setAtivo} />
                <span className="text-sm">{ativo ? "Ativa" : "Inativa"}</span>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Descrição</label>
            <Input
              value={descricao}
              onChange={(e) => {
                setDescricao(e.target.value);
                if (!dias) {
                  const auto = parcelasDaDescricao(e.target.value);
                  if (auto) setDias(auto.map((p) => p.dias).join("/"));
                }
              }}
              placeholder="30/60/90 DDL"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Vencimentos em dias após o faturamento (separados por /)
            </label>
            <Input value={dias} onChange={(e) => setDias(e.target.value)} placeholder="30/60/90" />
            <p className="text-xs text-muted-foreground">
              {parcelas.length
                ? `${parcelas.length} parcela(s), divisão igual do total — a última absorve o arredondamento.`
                : "Sem parcelas: a condição fica fora do checkout (parcelas manuais)."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={saving || !codigo.trim() || !descricao.trim()}
            onClick={() =>
              onSave({
                codigo,
                descricao,
                parcelas: parcelas.length ? parcelas : null,
                num_parcelas: parcelas.length || null,
                parse_automatico: parcelas.length > 0,
                ativo,
              })
            }
          >
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
