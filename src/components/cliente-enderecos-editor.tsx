import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CepInput } from "@/components/cep-input";
import { Loader2, MapPin, Plus, Star, Trash2, Truck } from "lucide-react";
import {
  listEnderecosClienteFn, salvarEnderecoClienteFn,
  favoritarEnderecoClienteFn, excluirEnderecoClienteFn,
  type ClienteEndereco,
} from "@/lib/cliente-enderecos.functions";

export const chaveEnderecos = (clienteId?: string | null) => ["cliente-enderecos", clienteId ?? ""];

type Rascunho = {
  id?: string | null;
  apelido: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  contato: string;
  telefone: string;
  favorito: boolean;
};

const vazio = (): Rascunho => ({
  apelido: "", cep: "", logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", uf: "", contato: "", telefone: "", favorito: false,
});

export const linhaEndereco = (e: ClienteEndereco) =>
  [
    [e.logradouro, e.numero].filter(Boolean).join(", "),
    e.complemento,
    e.bairro,
    [e.cidade, e.uf].filter(Boolean).join(" / "),
    e.cep,
  ]
    .filter((v) => v && String(v).trim())
    .join(" · ");

/**
 * Endereços de entrega do cliente: vários por cadastro, um favorito que já vem
 * pré-selecionado nas propostas. O endereço de faturamento fica no cadastro.
 */
export function ClienteEnderecosEditor({
  instancia, clienteId, clienteDoc, somenteLeitura,
}: {
  instancia: "solar" | "carregadores";
  clienteId?: string | null;
  clienteDoc: string;
  somenteLeitura?: boolean;
}) {
  const qc = useQueryClient();
  const listar = useServerFn(listEnderecosClienteFn);
  const salvarFn = useServerFn(salvarEnderecoClienteFn);
  const favoritarFn = useServerFn(favoritarEnderecoClienteFn);
  const excluirFn = useServerFn(excluirEnderecoClienteFn);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);

  const q = useQuery({
    queryKey: chaveEnderecos(clienteId),
    queryFn: () => listar({ data: { clienteId: clienteId! } }),
    enabled: !!clienteId,
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: chaveEnderecos(clienteId) });

  const salvar = useMutation({
    mutationFn: (r: Rascunho) =>
      salvarFn({
        data: {
          instancia,
          clienteId: clienteId!,
          clienteDoc,
          endereco: { ...r, id: r.id ?? null },
        },
      }),
    onSuccess: () => { toast.success("Endereço de entrega salvo."); setRascunho(null); invalidar(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const favoritar = useMutation({
    mutationFn: (id: string) => favoritarFn({ data: { clienteId: clienteId!, id } }),
    onSuccess: () => { toast.success("Endereço favorito atualizado."); invalidar(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => excluirFn({ data: { id } }),
    onSuccess: () => { toast.success("Endereço removido."); invalidar(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!clienteId) {
    return (
      <p className="text-sm text-muted-foreground">
        Salve o cadastro para poder adicionar endereços de entrega.
      </p>
    );
  }

  if (q.data && q.data.ok === false) {
    return (
      <p className="text-sm text-muted-foreground">
        {q.data.erro} Rode <code>supabase/external/cliente-enderecos.sql</code> no banco do Grupo 2P
        para habilitar os endereços de entrega.
      </p>
    );
  }

  const enderecos = q.data?.enderecos ?? [];
  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) =>
    setRascunho((r) => (r ? { ...r, [k]: v } : r));

  return (
    <div className="space-y-3">
      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando endereços…
        </div>
      ) : enderecos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum endereço de entrega cadastrado — as propostas usam o endereço de faturamento.
        </p>
      ) : (
        <ul className="space-y-2">
          {enderecos.map((e) => (
            <li key={e.id} className="rounded-xl border border-border bg-surface/40 p-3">
              <div className="flex flex-wrap items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{e.apelido || "Endereço de entrega"}</span>
                    {e.favorito && (
                      <Badge className="gap-1"><Star className="h-3 w-3" /> Favorito</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground break-words">{linhaEndereco(e)}</div>
                  {(e.contato || e.telefone) && (
                    <div className="text-xs text-muted-foreground">
                      Recebe: {[e.contato, e.telefone].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                {!somenteLeitura && (
                  <div className="flex items-center gap-1">
                    {!e.favorito && (
                      <Button
                        variant="ghost" size="icon" aria-label="Definir como favorito"
                        title="Definir como favorito"
                        disabled={favoritar.isPending}
                        onClick={() => favoritar.mutate(e.id)}
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="sm"
                      onClick={() =>
                        setRascunho({
                          id: e.id,
                          apelido: e.apelido ?? "", cep: e.cep ?? "", logradouro: e.logradouro ?? "",
                          numero: e.numero ?? "", complemento: e.complemento ?? "", bairro: e.bairro ?? "",
                          cidade: e.cidade ?? "", uf: e.uf ?? "", contato: e.contato ?? "",
                          telefone: e.telefone ?? "", favorito: e.favorito,
                        })
                      }
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost" size="icon" aria-label="Remover endereço"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={excluir.isPending}
                      onClick={() => excluir.mutate(e.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!somenteLeitura && !rascunho && (
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setRascunho(vazio())}>
          <Plus className="h-4 w-4" /> Adicionar endereço de entrega
        </Button>
      )}

      {!somenteLeitura && rascunho && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Truck className="h-4 w-4" /> {rascunho.id ? "Editar endereço" : "Novo endereço de entrega"}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Apelido</Label>
              <Input
                placeholder="Ex.: Obra Campinas"
                value={rascunho.apelido}
                onChange={(ev) => set("apelido", ev.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CEP</Label>
              <CepInput
                value={rascunho.cep}
                onChange={(v) => set("cep", v)}
                onFound={(e) =>
                  setRascunho((r) =>
                    r ? { ...r, cep: e.cep, logradouro: e.logradouro, bairro: e.bairro, cidade: e.cidade, uf: e.uf } : r,
                  )
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Logradouro *</Label>
              <Input value={rascunho.logradouro} onChange={(ev) => set("logradouro", ev.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Número</Label>
              <Input value={rascunho.numero} onChange={(ev) => set("numero", ev.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Complemento</Label>
              <Input value={rascunho.complemento} onChange={(ev) => set("complemento", ev.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bairro</Label>
              <Input value={rascunho.bairro} onChange={(ev) => set("bairro", ev.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cidade *</Label>
              <Input value={rascunho.cidade} onChange={(ev) => set("cidade", ev.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">UF *</Label>
              <Input
                maxLength={2}
                value={rascunho.uf}
                onChange={(ev) => set("uf", ev.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Quem recebe</Label>
              <Input value={rascunho.contato} onChange={(ev) => set("contato", ev.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Telefone do local</Label>
              <Input value={rascunho.telefone} onChange={(ev) => set("telefone", ev.target.value)} />
            </div>
            <label className="sm:col-span-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[hsl(var(--primary))]"
                checked={rascunho.favorito}
                onChange={(ev) => set("favorito", ev.target.checked)}
              />
              Usar como endereço de entrega favorito nas propostas
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setRascunho(null)}>Cancelar</Button>
            <Button
              size="sm" className="gap-2" disabled={salvar.isPending}
              onClick={() => salvar.mutate(rascunho)}
            >
              {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar endereço
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
