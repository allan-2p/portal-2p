import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FilePlus, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/orcamentos")({
  head: () => ({
    meta: [
      { title: "Orçamentos — Portal 2P" },
      { name: "description", content: "Orçamentos criados e emissão de novos orçamentos." },
    ],
  }),
  component: OrcamentosPage,
});

type Orcamento = {
  id: string;
  code: string;
  cliente: string;
  data: string;
  valor: number;
  status: "Rascunho" | "Enviado" | "Aprovado";
};

const MOCK: Orcamento[] = [
  { id: "1", code: "ORC-1042", cliente: "Solar Prime Ltda", data: "12/07/2026", valor: 48750, status: "Enviado" },
  { id: "2", code: "ORC-1041", cliente: "Energia Verde SA", data: "10/07/2026", valor: 12300, status: "Aprovado" },
  { id: "3", code: "ORC-1040", cliente: "Casa & Cia Engenharia", data: "08/07/2026", valor: 27890, status: "Rascunho" },
];

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_COLOR: Record<Orcamento["status"], string> = {
  Rascunho: "bg-muted text-muted-foreground",
  Enviado: "bg-blue-500/15 text-blue-500",
  Aprovado: "bg-emerald-500/15 text-emerald-500",
};

function OrcamentosPage() {
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>(MOCK);
  const [open, setOpen] = useState(false);
  const [cliente, setCliente] = useState("");
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");

  const handleCreate = () => {
    if (!cliente.trim() || !valor) {
      toast.error("Informe cliente e valor.");
      return;
    }
    const next: Orcamento = {
      id: crypto.randomUUID(),
      code: `ORC-${1043 + orcamentos.length - MOCK.length}`,
      cliente: cliente.trim(),
      data: new Date().toLocaleDateString("pt-BR"),
      valor: Number(valor),
      status: "Rascunho",
    };
    setOrcamentos((prev) => [next, ...prev]);
    setCliente("");
    setValor("");
    setObs("");
    setOpen(false);
    toast.success("Orçamento criado.");
  };

  return (
    <AppLayout>
      <div className="max-w-[1700px] mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Carteira</div>
            <h1 className="text-3xl font-bold mt-1">Orçamentos</h1>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <FilePlus className="h-4 w-4" /> Realizar orçamento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo orçamento</DialogTitle>
                <DialogDescription>Preencha as informações para gerar um orçamento.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cliente">Cliente</Label>
                  <Input id="cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="valor">Valor (R$)</Label>
                  <Input id="valor" type="number" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="obs">Observações</Label>
                  <Textarea id="obs" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Detalhes do orçamento…" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate}>Criar orçamento</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="text-left px-4 py-3">Código</th>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-left px-4 py-3">Data</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Valor</th>
                </tr>
              </thead>
              <tbody>
                {orcamentos.map((o) => (
                  <tr key={o.id} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="px-4 py-3 font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" /> {o.code}
                    </td>
                    <td className="px-4 py-3">{o.cliente}</td>
                    <td className="px-4 py-3 text-muted-foreground">{o.data}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${STATUS_COLOR[o.status]}`}>{o.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{fmt(o.valor)}</td>
                  </tr>
                ))}
                {orcamentos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhum orçamento cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
