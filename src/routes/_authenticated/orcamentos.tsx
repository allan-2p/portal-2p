import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { PropostaWizard, type NovaPropostaResult } from "@/components/proposta-wizard";
import { FilePlus, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/orcamentos")({
  head: () => ({
    meta: [
      { title: "Propostas — Portal 2P" },
      { name: "description", content: "Propostas criadas e emissão de novas propostas." },
    ],
  }),
  component: OrcamentosPage,
});

type Status =
  | "Salvo"
  | "Aguardando Pagamento"
  | "Processando"
  | "Separação"
  | "Faturado"
  | "Coletado"
  | "Entregue"
  | "Cancelado";

type Orcamento = {
  id: string;
  code: string;
  cliente: string;
  data: string;
  valor: number;
  status: Status;
};

const MOCK: Orcamento[] = [
  { id: "1", code: "ORC-1042", cliente: "Solar Prime Ltda", data: "12/07/2026", valor: 48750, status: "Aguardando Pagamento" },
  { id: "2", code: "ORC-1041", cliente: "Energia Verde SA", data: "10/07/2026", valor: 12300, status: "Entregue" },
  { id: "3", code: "ORC-1040", cliente: "Casa & Cia Engenharia", data: "08/07/2026", valor: 27890, status: "Salvo" },
];

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Dot color + label pill background/text for each status
const STATUS_STYLE: Record<Status, { dot: string; pill: string }> = {
  "Salvo":                { dot: "bg-orange-500",  pill: "bg-orange-500/15 text-orange-500" },
  "Aguardando Pagamento": { dot: "bg-indigo-700",  pill: "bg-indigo-700/15 text-indigo-400" },
  "Processando":          { dot: "bg-yellow-400",  pill: "bg-yellow-400/15 text-yellow-500" },
  "Separação":            { dot: "bg-sky-400",     pill: "bg-sky-400/15 text-sky-400" },
  "Faturado":             { dot: "bg-black dark:bg-white", pill: "bg-foreground/10 text-foreground" },
  "Coletado":             { dot: "bg-emerald-500", pill: "bg-emerald-500/15 text-emerald-500" },
  "Entregue":             { dot: "bg-gray-500",    pill: "bg-gray-500/15 text-gray-400" },
  "Cancelado":            { dot: "bg-red-500",     pill: "bg-red-500/15 text-red-500" },
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
      status: "Salvo",
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
            <h1 className="text-3xl font-bold mt-1">Propostas</h1>
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
                      <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded font-medium ${STATUS_STYLE[o.status].pill}`}>
                        <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[o.status].dot}`} />
                        {o.status}
                      </span>
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
