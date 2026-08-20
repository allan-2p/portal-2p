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
import { CalendarIcon, Copy, Plus, RefreshCw, Tag } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PermissionGate } from "@/components/permission-gate";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, Power } from "lucide-react";
import { useSolarCupons, useSolarInvalidate } from "@/hooks/use-solar-catalogo";
import { logModeration } from "@/lib/moderation-audit";
import { ModerationAuditLog } from "@/components/moderation-audit-log";

export const Route = createFileRoute("/_authenticated/solar/cupons")({
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
  inicio?: string;
  reutilizavel: boolean;
  usos: number;
  limiteUsos?: number | null;
  esgotado: boolean;
  ativo: boolean;
  cliente?: string;
  criadoEm: string;
};

const ALFA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function gerarCodigo() {
  let out = "";
  const arr = new Uint32Array(6);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 6; i++) out += ALFA[arr[i] % ALFA.length];
  return out;
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Máscara de moeda: digita só números, formata como 1.234,56 */
function maskMoeda(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  const n = Number(digits) / 100;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const parseMoeda = (masked: string) => Number(masked.replace(/\./g, "").replace(",", ".")) || 0;

/** Máscara de percentual: 0 a 100 com até 2 casas. */
function maskPercentual(raw: string) {
  let v = raw.replace(/[^\d,.]/g, "").replace(/\./g, ",");
  const [int = "", dec] = v.split(",");
  v = dec === undefined ? int : `${int},${dec.slice(0, 2)}`;
  if (parsePercentual(v) > 100) return "100";
  return v;
}
const parsePercentual = (masked: string) => Number(masked.replace(",", ".")) || 0;

function CuponsPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const cuponsQ = useSolarCupons();
  const invalidateSolar = useSolarInvalidate();
  const clientesQ = useQuery({
    queryKey: ["cupons-clientes-solar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("doc, razao_social, nome_fantasia")
        .eq("instancia", "solar")
        .eq("ativo", true)
        .order("razao_social", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as { doc: string; razao_social: string; nome_fantasia: string | null }[];
    },
    staleTime: 60_000,
  });
  const cupons: Cupom[] = (cuponsQ.data ?? []).map((c: any) => ({
    id: c.id,
    codigo: c.codigo,
    tipos: (c.tipos ?? []) as TipoCupom[],
    valor: Number(c.valor) > 0 ? Number(c.valor) : undefined,
    percentual: Number(c.percentual) > 0 ? Number(c.percentual) : undefined,
    validade: c.validade ? format(new Date(`${c.validade}T00:00:00`), "dd/MM/yyyy") : "—",
    inicio: c.validade_inicio
      ? format(new Date(`${c.validade_inicio}T00:00:00`), "dd/MM/yyyy")
      : undefined,
    reutilizavel: !!c.reutilizavel,
    usos: Number(c.usos ?? 0),
    limiteUsos: c.limite_usos == null ? null : Number(c.limite_usos),
    esgotado:
      c.limite_usos != null
        ? Number(c.usos ?? 0) >= Number(c.limite_usos)
        : !c.reutilizavel && Number(c.usos ?? 0) > 0,
    cliente: c.cliente_nome || undefined,
    criadoEm: c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "—",
  }));
  const [salvando, setSalvando] = useState(false);
  const [open, setOpen] = useState(false);

  // form
  const [aleatorio, setAleatorio] = useState(true);
  const [codigo, setCodigo] = useState(gerarCodigo());
  const [tipos, setTipos] = useState<TipoCupom[]>(["percentual"]);
  const [valor, setValor] = useState("");
  const [percentual, setPercentual] = useState("");
  const [validade, setValidade] = useState<Date | undefined>();
  const [inicio, setInicio] = useState<Date | undefined>();
  const [reutilizavel, setReutilizavel] = useState(false);
  const [limiteUsos, setLimiteUsos] = useState("");
  const [clienteDoc, setClienteDoc] = useState("");
  const [excluindo, setExcluindo] = useState<Cupom | null>(null);

  type Errors = {
    codigo?: string;
    tipos?: string;
    valor?: string;
    percentual?: string;
    validade?: string;
    limiteUsos?: string;
  };
  const [errors, setErrors] = useState<Errors>({});

  const toggleTipo = (t: TipoCupom) => {
    setTipos((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
    setErrors((e) => ({ ...e, tipos: undefined }));
  };

  const resetForm = () => {
    setAleatorio(true);
    setCodigo(gerarCodigo());
    setTipos(["percentual"]);
    setValor("");
    setPercentual("");
    setValidade(undefined);
    setInicio(undefined);
    setReutilizavel(false);
    setLimiteUsos("");
    setClienteDoc("");
    setErrors({});
  };

  const handleDelete = async (c: Cupom) => {
    try {
      const { error } = await supabase.from("solar_cupons").delete().eq("id", c.id);
      if (error) throw error;
      invalidateSolar();
      toast.success(`Cupom ${c.codigo} excluído.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível excluir o cupom.");
    } finally {
      setExcluindo(null);
    }
  };

  const handleCreate = async () => {
    const codeFinal = (aleatorio ? codigo : codigo.trim()).toUpperCase();
    const next: Errors = {};
    if (!codeFinal) next.codigo = "Informe o código do cupom.";
    else if (!/^[A-Z0-9_-]{3,20}$/.test(codeFinal))
      next.codigo = "Use de 3 a 20 caracteres (letras, números, hífen ou underscore).";
    else if (cupons.some((c) => c.codigo.trim().toUpperCase() === codeFinal))
      next.codigo = `O código "${codeFinal}" já existe. Escolha outro.`;
    if (tipos.length === 0) next.tipos = "Selecione ao menos um tipo de desconto.";
    if (tipos.includes("valor") && parseMoeda(valor) <= 0) next.valor = "Informe o valor em R$.";
    if (tipos.includes("percentual")) {
      const p = parsePercentual(percentual);
      if (p <= 0) next.percentual = "Informe o percentual.";
      else if (p > 100) next.percentual = "O desconto não pode ser maior que 100%.";
    }
    if (!validade) next.validade = "Data final de validade é obrigatória.";
    else if (inicio && inicio > validade)
      next.validade = "A data final deve ser posterior à data inicial.";
    if (limiteUsos && Number(limiteUsos) < 1)
      next.limiteUsos = "O limite de usos deve ser ao menos 1.";

    if (Object.keys(next).length > 0) {
      setErrors(next);
      toast.error(next.codigo ?? "Preencha os campos obrigatórios.");
      return;
    }

    setSalvando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const cli = (clientesQ.data ?? []).find((c) => c.doc === clienteDoc);
      const { error } = await supabase.from("solar_cupons").insert({
        codigo: codeFinal,
        tipos,
        valor: tipos.includes("valor") ? parseMoeda(valor) : 0,
        percentual: tipos.includes("percentual") ? parsePercentual(percentual) : 0,
        validade: format(validade!, "yyyy-MM-dd"),
        validade_inicio: inicio ? format(inicio, "yyyy-MM-dd") : null,
        reutilizavel,
        limite_usos: reutilizavel && limiteUsos ? Number(limiteUsos) : null,
        cliente_nome: cli?.razao_social ?? null,
        cliente_doc: cli?.doc ?? null,
        ativo: true,
        created_by: userData.user?.id ?? null,
      });
      if (error) {
        if (error.code === "23505" || /duplicate key|unique/i.test(error.message)) {
          setErrors({ codigo: `O código "${codeFinal}" já existe. Escolha outro.` });
          toast.error(`O código "${codeFinal}" já existe.`);
          return;
        }
        throw error;
      }
      invalidateSolar();
      setOpen(false);
      resetForm();
      toast.success("Cupom criado.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível criar o cupom.");
    } finally {
      setSalvando(false);
    }
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
            <PermissionGate feature="cupons" action="editar" mode="disable">
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" /> Criar cupom
                </Button>
              </DialogTrigger>
            </PermissionGate>
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
                      onChange={(e) => {
                        setCodigo(e.target.value);
                        setErrors((er) => ({ ...er, codigo: undefined }));
                      }}
                      placeholder={aleatorio ? "" : "Ex: PROMO10"}
                      disabled={aleatorio}
                      className={cn("font-mono tracking-wider", errors.codigo && "border-destructive focus-visible:ring-destructive")}
                      aria-invalid={!!errors.codigo}
                    />
                    {aleatorio && (
                      <Button type="button" variant="outline" size="icon" onClick={() => setCodigo(gerarCodigo())} title="Gerar novo">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {errors.codigo && <p className="text-xs text-destructive">{errors.codigo}</p>}
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
                  {errors.tipos && <p className="text-xs text-destructive">{errors.tipos}</p>}
                  <div className="grid grid-cols-2 gap-2">
                    {tipos.includes("valor") && (
                      <div className="space-y-1">
                        <Label htmlFor="v-valor" className="text-xs">Valor R$</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                          <Input
                            id="v-valor"
                            inputMode="numeric"
                            value={valor}
                            onChange={(e) => {
                              setValor(maskMoeda(e.target.value));
                              setErrors((er) => ({ ...er, valor: undefined }));
                            }}
                            placeholder="0,00"
                            className={cn("pl-9 text-right", errors.valor && "border-destructive focus-visible:ring-destructive")}
                            aria-invalid={!!errors.valor}
                          />
                        </div>
                        {errors.valor && <p className="text-xs text-destructive">{errors.valor}</p>}
                      </div>
                    )}
                    {tipos.includes("percentual") && (
                      <div className="space-y-1">
                        <Label htmlFor="v-perc" className="text-xs">Percentual %</Label>
                        <div className="relative">
                          <Input
                            id="v-perc"
                            inputMode="decimal"
                            value={percentual}
                            onChange={(e) => {
                              setPercentual(maskPercentual(e.target.value));
                              setErrors((er) => ({ ...er, percentual: undefined }));
                            }}
                            placeholder="0"
                            className={cn("pr-8 text-right", errors.percentual && "border-destructive focus-visible:ring-destructive")}
                            aria-invalid={!!errors.percentual}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                        </div>
                        {errors.percentual && <p className="text-xs text-destructive">{errors.percentual}</p>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Início da validade */}
                <div className="space-y-1.5">
                  <Label>Início da validade (opcional)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !inicio && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        {inicio ? format(inicio, "dd/MM/yyyy") : <span>Válido imediatamente</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={inicio}
                        onSelect={(d) => {
                          setInicio(d);
                          setErrors((er) => ({ ...er, validade: undefined }));
                        }}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  {inicio && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline"
                      onClick={() => setInicio(undefined)}
                    >
                      Limpar data inicial
                    </button>
                  )}
                </div>

                {/* Validade */}
                <div className="space-y-1.5">
                  <Label>Válido até *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !validade && "text-muted-foreground",
                          errors.validade && "border-destructive"
                        )}
                      >
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        {validade ? format(validade, "dd/MM/yyyy") : <span>Selecione uma data</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={validade}
                        onSelect={(d) => {
                          setValidade(d);
                          setErrors((er) => ({ ...er, validade: undefined }));
                        }}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                        disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      />
                    </PopoverContent>
                  </Popover>
                  {errors.validade && <p className="text-xs text-destructive">{errors.validade}</p>}
                </div>

                {/* Reutilizável + limite de usos */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="reuso"
                      checked={reutilizavel}
                      onCheckedChange={(v) => {
                        setReutilizavel(Boolean(v));
                        if (!v) setLimiteUsos("");
                      }}
                    />
                    <Label htmlFor="reuso" className="cursor-pointer">Reutilizável (mais de um uso)</Label>
                  </div>
                  {reutilizavel && (
                    <div className="space-y-1.5">
                      <Label htmlFor="limite">Limite de usos (opcional)</Label>
                      <Input
                        id="limite"
                        inputMode="numeric"
                        placeholder="Ilimitado"
                        value={limiteUsos}
                        onChange={(e) => setLimiteUsos(e.target.value.replace(/\D/g, "").slice(0, 5))}
                        className={cn(errors.limiteUsos && "border-destructive")}
                      />
                      {errors.limiteUsos ? (
                        <p className="text-xs text-destructive">{errors.limiteUsos}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Deixe em branco para uso ilimitado dentro da vigência.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Cliente específico */}
                <div className="space-y-1.5">
                  <Label htmlFor="cli">Cliente específico (opcional)</Label>
                  <Select value={clienteDoc || "todos"} onValueChange={(v) => setClienteDoc(v === "todos" ? "" : v)}>
                    <SelectTrigger id="cli">
                      <SelectValue placeholder="Todos os clientes" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="todos">Todos os clientes</SelectItem>
                      {clientesQ.isLoading && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">Carregando clientes...</div>
                      )}
                      {(clientesQ.data ?? []).map((c) => (
                        <SelectItem key={c.doc} value={c.doc}>
                          {c.razao_social}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={salvando}>
                  {salvando ? "Salvando..." : "Criar cupom"}
                </Button>
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
                  <th className="text-left px-4 py-3">Vigência</th>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-left px-4 py-3">Usos</th>
                  <th className="text-left px-4 py-3">Criado em</th>
                  {isAdmin && <th className="text-right px-4 py-3">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {cupons.map((c) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="px-4 py-3 font-mono font-semibold">
                      <div className="flex items-center gap-2">
                        <span>{c.codigo}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Copiar código"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(c.codigo);
                              toast.success("Código copiado.");
                            } catch {
                              toast.error("Não foi possível copiar.");
                            }
                          }}
                        >
                          <Copy className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
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
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {c.inicio ? `${c.inicio} → ${c.validade}` : `até ${c.validade}`}
                    </td>
                    <td className="px-4 py-3">{c.cliente ?? <span className="text-muted-foreground">Todos</span>}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.usos}
                      {c.limiteUsos != null ? ` / ${c.limiteUsos}` : c.reutilizavel ? " / ∞" : " / 1"}
                      {c.esgotado && (
                        <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
                          Esgotado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.criadoEm}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          title="Excluir cupom"
                          onClick={() => setExcluindo(c)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
                {cupons.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} className="px-4 py-10 text-center text-muted-foreground">
                      {cuponsQ.isLoading
                        ? "Carregando cupons..."
                        : "Nenhum cupom criado ainda. Clique em Criar cupom para começar."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <AlertDialog open={!!excluindo} onOpenChange={(v) => !v && setExcluindo(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir cupom {excluindo?.codigo}?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. O código ficará disponível para uso novamente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => excluindo && handleDelete(excluindo)}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
