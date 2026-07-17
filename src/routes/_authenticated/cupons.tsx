import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CalendarIcon, KeyRound, Plus, RefreshCw, Tag } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/cupons")({
  head: () => ({
    meta: [
      { title: "Cupons — Portal 2P" },
      { name: "description", content: "Criação e gestão de cupons de desconto." },
    ],
  }),
  component: CuponsPage,
});

type TipoCupom = "valor" | "percentual" | "frete";

type Cupom = {
  id: string;
  codigo: string;
  tipos: TipoCupom[];
  valor?: number;
  percentual?: number;
  validade: string;
  reutilizavel: boolean;
  cliente?: string;
  criadoEm: string;
};

const ALFA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function gerarCodigo() {
  let out = "";
  const arr = new Uint32Array(6);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 6; i++) out += ALFA[arr[i] % ALFA.length];
  return out;
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function CuponsPage() {
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [open, setOpen] = useState(false);

  // form
  const [aleatorio, setAleatorio] = useState(true);
  const [codigo, setCodigo] = useState(gerarCodigo());
  const [tipos, setTipos] = useState<TipoCupom[]>(["percentual"]);
  const [valor, setValor] = useState("");
  const [percentual, setPercentual] = useState("");
  const [validade, setValidade] = useState<Date | undefined>();
  const [reutilizavel, setReutilizavel] = useState(false);
  const [cliente, setCliente] = useState("");

  const toggleTipo = (t: TipoCupom) => {
    setTipos((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const resetForm = () => {
    setAleatorio(true);
    setCodigo(gerarCodigo());
    setTipos(["percentual"]);
    setValor("");
    setPercentual("");
    setValidade(undefined);
    setReutilizavel(false);
    setCliente("");
  };

  const handleCreate = () => {
    const codeFinal = aleatorio ? codigo : codigo.trim();
    if (!codeFinal) return toast.error("Informe o código do cupom.");
    if (tipos.length === 0) return toast.error("Selecione ao menos um tipo de desconto.");
    if (!validade) return toast.error("Data de validade é obrigatória.");
    if (tipos.includes("valor") && !valor) return toast.error("Informe o valor em R$.");
    if (tipos.includes("percentual") && !percentual) return toast.error("Informe o percentual.");

    const novo: Cupom = {
      id: crypto.randomUUID(),
      codigo: codeFinal,
      tipos,
      valor: tipos.includes("valor") ? Number(valor) : undefined,
      percentual: tipos.includes("percentual") ? Number(percentual) : undefined,
      validade: format(validade, "dd/MM/yyyy"),
      reutilizavel,
      cliente: cliente.trim() || undefined,
      criadoEm: new Date().toLocaleDateString("pt-BR"),
    };
    setCupons((prev) => [novo, ...prev]);
    setOpen(false);
    resetForm();
    toast.success("Cupom criado.");
  };

  return (
    <AppLayout>
      <div className="max-w-[1700px] mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Marketing</div>
            <h1 className="text-3xl font-bold mt-1">Cupons</h1>
          </div>
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (v) {
                resetForm();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> Criar cupom
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Novo cupom</DialogTitle>
                <DialogDescription>Configure código, tipo de desconto e regras.</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Código */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="aleatorio"
                      checked={aleatorio}
                      onCheckedChange={(v) => {
                        const b = Boolean(v);
                        setAleatorio(b);
                        if (b) setCodigo(gerarCodigo());
                        else setCodigo("");
                      }}
                    />
                    <Label htmlFor="aleatorio" className="cursor-pointer">
                      Gerar código aleatório (6 caracteres)
                    </Label>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value)}
                      placeholder={aleatorio ? "" : "Ex: PROMO10"}
                      disabled={aleatorio}
                      className="font-mono tracking-wider"
                    />
                    {aleatorio && (
                      <Button type="button" variant="outline" size="icon" onClick={() => setCodigo(gerarCodigo())} title="Gerar novo">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Tipo de desconto */}
                <div className="space-y-2">
                  <Label>Tipo de desconto (pode selecionar mais de um)</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className={cn("flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer", tipos.includes("valor") && "border-primary bg-primary/5")}>
                      <Checkbox checked={tipos.includes("valor")} onCheckedChange={() => toggleTipo("valor")} />
                      <span className="text-sm">R$</span>
                    </label>
                    <label className={cn("flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer", tipos.includes("percentual") && "border-primary bg-primary/5")}>
                      <Checkbox checked={tipos.includes("percentual")} onCheckedChange={() => toggleTipo("percentual")} />
                      <span className="text-sm">%</span>
                    </label>
                    <label className={cn("flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer", tipos.includes("frete") && "border-primary bg-primary/5")}>
                      <Checkbox checked={tipos.includes("frete")} onCheckedChange={() => toggleTipo("frete")} />
                      <span className="text-sm">Frete grátis</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {tipos.includes("valor") && (
                      <div className="space-y-1">
                        <Label htmlFor="v-valor" className="text-xs">Valor R$</Label>
                        <Input id="v-valor" type="number" min="0" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
                      </div>
                    )}
                    {tipos.includes("percentual") && (
                      <div className="space-y-1">
                        <Label htmlFor="v-perc" className="text-xs">Percentual %</Label>
                        <Input id="v-perc" type="number" min="0" max="100" value={percentual} onChange={(e) => setPercentual(e.target.value)} placeholder="0" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Validade */}
                <div className="space-y-1.5">
                  <Label>Data de validade *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !validade && "text-muted-foreground")}>
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        {validade ? format(validade, "dd/MM/yyyy") : <span>Selecione uma data</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={validade} onSelect={setValidade} initialFocus className={cn("p-3 pointer-events-auto")} disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))} />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Reutilizável */}
                <div className="flex items-center gap-2">
                  <Checkbox id="reuso" checked={reutilizavel} onCheckedChange={(v) => setReutilizavel(Boolean(v))} />
                  <Label htmlFor="reuso" className="cursor-pointer">Reutilizável (mais de um uso)</Label>
                </div>

                {/* Cliente específico */}
                <div className="space-y-1.5">
                  <Label htmlFor="cli">Cliente específico (opcional)</Label>
                  <Input id="cli" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Deixe em branco para todos" />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate}>Criar cupom</Button>
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
                  <th className="text-left px-4 py-3">Desconto</th>
                  <th className="text-left px-4 py-3">Validade</th>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-left px-4 py-3">Reutilizável</th>
                  <th className="text-left px-4 py-3">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {cupons.map((c) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="px-4 py-3 font-mono font-semibold flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-muted-foreground" /> {c.codigo}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.valor !== undefined && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500 font-medium inline-flex items-center gap-1">
                            <Tag className="h-3 w-3" /> {fmt(c.valor)}
                          </span>
                        )}
                        {c.percentual !== undefined && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-blue-500/15 text-blue-500 font-medium">
                            {c.percentual}%
                          </span>
                        )}
                        {c.tipos.includes("frete") && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-500 font-medium">
                            Frete grátis
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.validade}</td>
                    <td className="px-4 py-3">{c.cliente ?? <span className="text-muted-foreground">Todos</span>}</td>
                    <td className="px-4 py-3">{c.reutilizavel ? "Sim" : "Não"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.criadoEm}</td>
                  </tr>
                ))}
                {cupons.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhum cupom criado ainda. Clique em <b>Criar cupom</b> para começar.
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
