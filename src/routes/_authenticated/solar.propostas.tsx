import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { PropostaWizard, type NovaPropostaResult } from "@/components/proposta-wizard";
import { PROPOSTA_STATUS, PROPOSTA_STATUS_STYLE, type PropostaStatus } from "@/lib/proposta-status";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { FilePlus, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/solar/propostas")({
  head: () => ({
    meta: [
      { title: "Propostas — Portal 2P" },
      { name: "description", content: "Propostas criadas e emissão de novas propostas." },
    ],
  }),
  component: OrcamentosPage,
});

type Status = PropostaStatus;

type Vendido = "S" | "N" | "E";

type Orcamento = {
  id: string;
  numero: string;
  cliente: string;
  projeto: string;
  vendido: Vendido;
  valor: number;
  status: Status;
  sap: string;
  nf: string;
  dataCompra: string;
  consultor: string;
};

const MOCK: Orcamento[] = [
  {
    id: "1",
    numero: "PROP-0001",
    cliente: "Solar Prime Ltda",
    projeto: "Usina Rural Cascavel",
    vendido: "S",
    valor: 48750,
    status: "Aguardando Pagamento",
    sap: "4500123",
    nf: "—",
    dataCompra: "12/07/2026",
    consultor: "Fernando Lira",
  },
  {
    id: "2",
    numero: "PROP-0002",
    cliente: "Energia Verde SA",
    projeto: "Telhado Metálico Galpão 3",
    vendido: "N",
    valor: 12300,
    status: "Entregue",
    sap: "4500118",
    nf: "NF-88214",
    dataCompra: "10/07/2026",
    consultor: "Gabriel Kendi",
  },
  {
    id: "3",
    numero: "PROP-0003",
    cliente: "Casa & Cia Engenharia",
    projeto: "Residencial Alto da Glória",
    vendido: "E",
    valor: 27890,
    status: "Salvo",
    sap: "—",
    nf: "—",
    dataCompra: "08/07/2026",
    consultor: "Ygor Andreis",
  },
];

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Cor por status — vem dos status universais das propostas (todas as instâncias).
const STATUS_STYLE = PROPOSTA_STATUS_STYLE;

const STATUS_ORDER = PROPOSTA_STATUS as unknown as Status[];

const VENDIDO_LABEL: Record<Vendido, string> = {
  S: "Vendido ao cliente final",
  N: "Não vendido",
  E: "Estoque",
};

function StatusDotCell({ status }: { status: Status }) {
  return <StatusDot status={status} />;
}


function OrcamentosPage() {
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>(MOCK);
  const [wizard, setWizard] = useState(false);
  const [detalhe, setDetalhe] = useState<Orcamento | null>(null);

  const handleFinish = (r: NovaPropostaResult) => {
    const next: Orcamento = {
      id: crypto.randomUUID(),
      numero: `PROP-${String(orcamentos.length + 1).padStart(4, "0")}`,
      cliente: r.cliente,
      projeto: r.projeto,
      vendido: r.vendido === "sim" ? "S" : r.vendido === "estoque" ? "E" : "N",
      valor: 0,
      status: "Salvo",
      sap: "—",
      nf: "—",
      dataCompra: new Date().toLocaleDateString("pt-BR"),
      consultor: "—",
    };
    setOrcamentos((prev) => [next, ...prev]);
    setWizard(false);
    toast.success("Proposta salva.");
  };

  if (wizard) {
    return (
      <AppLayout>
        <div className="max-w-[1700px] mx-auto">
          <PropostaWizard onCancel={() => setWizard(false)} onFinish={handleFinish} />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <TooltipProvider>
      <div className="max-w-[1700px] mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Carteira</div>
            <h1 className="text-3xl font-bold mt-1">Propostas</h1>
          </div>
          <PermissionGate feature="propostas" action="editar" mode="disable">
            <Button className="gap-2" onClick={() => setWizard(true)}>
              <FilePlus className="h-4 w-4" /> Nova proposta
            </Button>
          </PermissionGate>
        </div>

        {/* Legenda de status */}
        <div className="flex items-center gap-x-5 gap-y-2 flex-wrap text-xs">
          {STATUS_ORDER.map((s) => (
            <span key={s} className="inline-flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLE[s].dot}`} />
              <span className="text-muted-foreground">{s}</span>
            </span>
          ))}
        </div>

        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-left px-4 py-3">Nº Proposta</th>
                  <th className="text-left px-4 py-3">Proposta</th>
                  <th className="text-right px-4 py-3">Valor</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Nº SAP</th>
                  <th className="text-left px-4 py-3">NF</th>
                  <th className="text-left px-4 py-3">Data de Compra</th>
                  <th className="text-left px-4 py-3">Consultor</th>
                  <th className="text-right px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {orcamentos.map((o) => (
                  <tr key={o.id} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="px-4 py-3 font-medium">{o.cliente}</td>
                    <td className="px-4 py-3 text-muted-foreground">{o.numero}</td>
                    <td className="px-4 py-3">{o.projeto || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmt(o.valor)}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusDot status={o.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{o.sap}</td>
                    <td className="px-4 py-3 text-muted-foreground">{o.nf}</td>
                    <td className="px-4 py-3 text-muted-foreground">{o.dataCompra}</td>
                    <td className="px-4 py-3">{o.consultor}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Detalhar proposta"
                          onClick={() => setDetalhe(o)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar proposta"
                          onClick={() => setWizard(true)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {orcamentos.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhuma proposta cadastrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={!!detalhe} onOpenChange={(v) => !v && setDetalhe(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detalhe?.cliente}</DialogTitle>
            <DialogDescription>{detalhe?.projeto}</DialogDescription>
          </DialogHeader>
          {detalhe && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Vendido ao cliente final" value={VENDIDO_LABEL[detalhe.vendido]} />
              <Info label="Valor" value={fmt(detalhe.valor)} />
              <Info label="Status" value={detalhe.status} />
              <Info label="Nº SAP" value={detalhe.sap} />
              <Info label="NF" value={detalhe.nf} />
              <Info label="Data de Compra" value={detalhe.dataCompra} />
              <Info label="Consultor" value={detalhe.consultor} />
            </div>
          )}
        </DialogContent>
      </Dialog>
      </TooltipProvider>
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
