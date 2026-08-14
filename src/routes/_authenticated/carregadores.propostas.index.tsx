import { createFileRoute, Link } from "@tanstack/react-router";
import { PROPOSTA_STATUS } from "@/lib/proposta-status";
import { StatusLegend, StatusPicker } from "@/components/proposta-status-ui";
import { useMemo, useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calculator, Copy, Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL } from "@/lib/cpo";
import { cn } from "@/lib/utils";
import { VendedorNamesFilter } from "@/components/vendedor-names-filter";
import { useCpoVendedores } from "@/hooks/use-cpo-vendedores";
import { PermissionGate } from "@/components/permission-gate";

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
  component: HistoricoCpoPage,
});

type Row = {
  id: string;
  numero: string | null;
  cliente_nome: string;
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
};

/** Status universais do portal (mesma lista e cores em todas as instâncias). */
const STATUS = PROPOSTA_STATUS;

function HistoricoCpoPage() {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [uf, setUf] = useState("todos");
  const [vendedor, setVendedor] = useState("__all__");
  const [detalhe, setDetalhe] = useState<Row | null>(null);
  const vend = useCpoVendedores();

  const q = useQuery({
    queryKey: ["cpo-proposals"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("cpo_proposals")
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

  const filtered = rows.filter((r) => {
    if (status !== "todos" && r.status !== status) return false;
    if (uf !== "todos" && r.uf !== uf) return false;
    if (!vend.matches(vendedor, r.created_by)) return false;
    const t = busca.trim().toLowerCase();
    if (t && !`${r.cliente_nome} ${r.numero ?? ""}`.toLowerCase().includes(t)) return false;
    return true;
  });




  async function alterarStatus(id: string, novo: string) {
    const { error } = await supabase.from("cpo_proposals").update({ status: novo }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado.");
    q.refetch();
  }

  async function excluir(id: string) {
    const { error } = await supabase.from("cpo_proposals").delete().eq("id", id);
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
          <PermissionGate feature="cpo.propostas" action="editar" mode="disable">
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
              placeholder="Buscar por cliente ou número"
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
          <VendedorNamesFilter
            value={vendedor}
            onChange={setVendedor}
            options={vend.names}
            allLabel="Todos os vendedores"
          />

        </div>

        {/* Legenda universal de status — clique para filtrar */}
        <StatusLegend
          counts={rows.reduce<Record<string, number>>((acc, r) => {
            acc[r.status] = (acc[r.status] ?? 0) + 1;
            return acc;
          }, {})}
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
                  <th className="text-left px-4 py-3">UF</th>
                  <th className="text-left px-4 py-3">Contribuinte</th>
                  <th className="text-right px-4 py-3">Valor</th>
                  <th className="text-left px-4 py-3">Data</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="px-4 py-3 text-muted-foreground">{r.numero ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">{r.cliente_nome}</td>
                    <td className="px-4 py-3">{r.uf}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.contribuinte ? "Sim" : "Não"}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmtBRL(r.totais.valorTotal ?? 0)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("pt-BR")}
                    </td>
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
                        <Button variant="ghost" size="icon" aria-label="Detalhar" onClick={() => setDetalhe(r)}>
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
                        <Button variant="ghost" size="icon" aria-label="Auditoria de cálculo" asChild>
                          <Link to="/carregadores/propostas/auditoria" search={{ id: r.id }}>
                            <Calculator className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => excluir(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>

                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                      {q.isLoading ? "Carregando…" : "Nenhuma proposta encontrada."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={!!detalhe} onOpenChange={(v) => !v && setDetalhe(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detalhe?.cliente_nome}</DialogTitle>
            <DialogDescription>
              {detalhe?.numero} · {detalhe?.uf} · {detalhe?.contribuinte ? "Contribuinte" : "Não contribuinte"}
            </DialogDescription>
          </DialogHeader>
          {detalhe && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <Info label="Valor total" value={fmtBRL(detalhe.totais.valorTotal ?? 0)} />
                <Info label="ICMS" value={fmtBRL(detalhe.totais.icms ?? 0)} />
                <Info label="PIS/COFINS" value={fmtBRL(detalhe.totais.pisCofins ?? 0)} />
                <Info label="Receita líquida" value={fmtBRL(detalhe.totais.rl ?? 0)} />
                <Info label="Valor dos itens" value={fmtBRL(detalhe.totais.valor ?? 0)} />
                <Info label="Comissão" value={fmtBRL(detalhe.totais.comissao ?? 0)} />
                <Info label="Frete" value={`${detalhe.frete_mod} · ${fmtBRL(detalhe.frete_valor)}`} />
                <Info label="Contato" value={detalhe.cliente_telefone || detalhe.cliente_email || "—"} />
              </div>
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase border-b border-border">
                      <th className="text-left px-3 py-2">Produto</th>
                      <th className="text-right px-3 py-2">Qtd</th>
                      <th className="text-right px-3 py-2">Valor un.</th>
                      <th className="text-right px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalhe.itens.map((i, idx) => (
                      <tr key={idx} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2">{i.nome || "—"}</td>
                        <td className="px-3 py-2 text-right">{i.qtd ?? 0}</td>
                        <td className="px-3 py-2 text-right">{fmtBRL(i.valor ?? 0)}</td>
                        <td className="px-3 py-2 text-right font-medium">{fmtBRL((i.valor ?? 0) * (i.qtd ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
