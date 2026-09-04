import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, FileText, Loader2, Package, User } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { buscaGlobalFn, type BuscaResultado, type BuscaTipo } from "@/lib/busca-global.functions";

export type ItemNavegacao = { to: string; label: string; icon: any };

const GRUPO: Record<BuscaTipo, { titulo: string; icon: any }> = {
  cliente: { titulo: "Clientes", icon: Building2 },
  contato: { titulo: "Contatos", icon: User },
  proposta: { titulo: "Propostas", icon: FileText },
  pedido: { titulo: "Pedidos", icon: Package },
};

const UNIDADE: Record<string, string> = { solar: "2P Solar", carregadores: "2P Carregadores" };

export function GlobalSearch({
  open,
  onOpenChange,
  itensNavegacao,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itensNavegacao: ItemNavegacao[];
}) {
  const navigate = useNavigate();
  const buscar = useServerFn(buscaGlobalFn);
  const [termo, setTermo] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(termo.trim()), 300);
    return () => clearTimeout(t);
  }, [termo]);

  useEffect(() => {
    if (!open) setTermo("");
  }, [open]);

  const habilitado = open && debounced.length >= 2;
  const { data, isFetching } = useQuery({
    queryKey: ["busca-global", debounced],
    queryFn: () => buscar({ data: { q: debounced } }),
    enabled: habilitado,
    staleTime: 30_000,
  });

  const telas = useMemo(() => {
    const t = termo.trim().toLowerCase();
    const lista = t
      ? itensNavegacao.filter((i) => i.label.toLowerCase().includes(t))
      : itensNavegacao;
    return lista.slice(0, 8);
  }, [itensNavegacao, termo]);

  const grupos = useMemo(() => {
    const mapa = new Map<BuscaTipo, BuscaResultado[]>();
    for (const r of data?.resultados ?? []) {
      const atual = mapa.get(r.tipo) ?? [];
      atual.push(r);
      mapa.set(r.tipo, atual);
    }
    return [...mapa.entries()];
  }, [data]);

  const abrir = (r: BuscaResultado) => {
    onOpenChange(false);
    void navigate({ to: r.to as any, search: r.search as any });
  };

  const semNada = !telas.length && !grupos.length && !isFetching;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        value={termo}
        onValueChange={setTermo}
        placeholder="Buscar clientes, propostas, pedidos, contatos ou telas…"
      />
      <CommandList>
        {semNada && (
          <CommandEmpty>
            {debounced.length < 2 ? "Digite ao menos 2 caracteres." : "Nada encontrado."}
          </CommandEmpty>
        )}

        {grupos.map(([tipo, itens]) => {
          const Icon = GRUPO[tipo].icon;
          return (
            <CommandGroup key={tipo} heading={GRUPO[tipo].titulo}>
              {itens.map((r) => (
                <CommandItem key={`${r.tipo}-${r.id}`} value={`${r.tipo}-${r.id}`} onSelect={() => abrir(r)}>
                  <Icon className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">{r.titulo}</span>
                  {r.subtitulo && (
                    <span className="ml-2 truncate text-xs text-muted-foreground">
                      {r.subtitulo}
                    </span>
                  )}
                  <span className="ml-auto pl-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {UNIDADE[r.instancia] ?? r.instancia}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}

        {isFetching && (
          <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando registros…
          </div>
        )}

        {!!telas.length && (
          <CommandGroup heading="Navegação">
            {telas.map((i) => {
              const Icon = i.icon;
              return (
                <CommandItem
                  key={i.to + i.label}
                  value={`tela-${i.to}-${i.label}`}
                  onSelect={() => {
                    onOpenChange(false);
                    void navigate({ to: i.to as any });
                  }}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {i.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
