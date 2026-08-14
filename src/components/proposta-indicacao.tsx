import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePadrinhos, useCriarPadrinho } from "@/hooks/use-padrinhos";
import { HeartHandshake, Plus } from "lucide-react";

type Props = {
  indicacao: boolean;
  padrinhoId: string | null;
  padrinhoNome: string;
  onChange: (v: { indicacao: boolean; padrinhoId: string | null; padrinhoNome: string }) => void;
};

/** Bloco de indicação da proposta (Carregadores): sim/não + padrinho. */
export function PropostaIndicacao({ indicacao, padrinhoId, padrinhoNome, onChange }: Props) {
  const padrinhos = usePadrinhos();
  const criar = useCriarPadrinho();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({ nome: "", doc: "", telefone: "", email: "" });

  async function salvarPadrinho() {
    try {
      const novo = await criar.mutateAsync(form);
      onChange({ indicacao: true, padrinhoId: novo.id, padrinhoNome: novo.nome });
      setForm({ nome: "", doc: "", telefone: "", email: "" });
      setAberto(false);
      toast.success("Padrinho cadastrado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cadastrar o padrinho.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Indicação</Label>
        <Select
          value={indicacao ? "sim" : "nao"}
          onValueChange={(v) =>
            onChange(
              v === "sim"
                ? { indicacao: true, padrinhoId, padrinhoNome }
                : { indicacao: false, padrinhoId: null, padrinhoNome: "" },
            )
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nao">Não — venda sem indicação</SelectItem>
            <SelectItem value="sim">Sim — proposta veio de indicação</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {indicacao ? (
        <div className="rounded-xl border border-border bg-surface-2 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <HeartHandshake className="h-4 w-4 text-primary" /> Padrinho da indicação
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select
              value={padrinhoId ?? ""}
              onValueChange={(v) => {
                const p = (padrinhos.data ?? []).find((x) => x.id === v);
                onChange({ indicacao: true, padrinhoId: v, padrinhoNome: p?.nome ?? "" });
              }}
            >
              <SelectTrigger className="flex-1">
                <SelectValue
                  placeholder={padrinhos.isLoading ? "Carregando..." : "Selecionar padrinho cadastrado"}
                />
              </SelectTrigger>
              <SelectContent>
                {(padrinhos.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                    {p.doc ? ` · ${p.doc}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" className="gap-2" onClick={() => setAberto(true)}>
              <Plus className="h-4 w-4" /> Novo padrinho
            </Button>
          </div>
          {padrinhoId ? (
            <p className="text-xs text-muted-foreground">
              Indicação registrada para <b className="text-foreground">{padrinhoNome || "padrinho selecionado"}</b>.
              Não aparece na proposta nem no PDF — apenas no detalhe interno.
            </p>
          ) : (
            <p className="text-xs text-destructive">Selecione ou cadastre um padrinho para continuar.</p>
          )}
        </div>
      ) : null}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo padrinho</DialogTitle>
            <DialogDescription>Apenas o nome é obrigatório.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nome *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Nome do padrinho"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">CPF / CNPJ</Label>
                <Input value={form.doc} onChange={(e) => setForm({ ...form, doc: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Telefone</Label>
                <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarPadrinho} disabled={!form.nome.trim() || criar.isPending}>
              {criar.isPending ? "Salvando..." : "Cadastrar padrinho"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
