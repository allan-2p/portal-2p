import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  Building2,
  FileText,
  Loader2,
  Package,
  Search,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buscaGlobalFn, type BuscaResultado, type BuscaTipo } from "@/lib/busca-global.functions";

export type ItemNavegacao = { to: string; label: string; icon: any };

export const GRUPO_BUSCA: Record<BuscaTipo, { titulo: string; icon: any }> = {
  cliente: { titulo: "Clientes", icon: Building2 },
  contato: { titulo: "Contatos", icon: User },
  proposta: { titulo: "Propostas", icon: FileText },
  pedido: { titulo: "Pedidos", icon: Package },
};

export const UNIDADE_BUSCA: Record<string, string> = {
  solar: "2P Solar",
  carregadores: "2P Carregadores",
};

export function agruparResultados(resultados: BuscaResultado[]) {
  const mapa = new Map<BuscaTipo, BuscaResultado[]>();
  for (const r of resultados) {
    const atual = mapa.get(r.tipo) ?? [];
    atual.push(r);
    mapa.set(r.tipo, atual);
  }
  return [...mapa.entries()];
}

export type GlobalSearchHandle = { focar: () => void };

/**
 * Busca global do cabeçalho: campo de verdade (sem pop-up), com sugestões
 * enquanto digita e Enter levando à página `/busca` com todos os resultados —
 * inspirado na barra de pesquisa do Salesforce.
 */
export const GlobalSearch = forwardRef<
  GlobalSearchHandle,
  { itensNavegacao: ItemNavegacao[]; className?: string }
>(function GlobalSearch({ itensNavegacao, className }, ref) {
  const navigate = useNavigate();
  const buscar = useServerFn(buscaGlobalFn);
  const [termo, setTermo] = useState("");
  const [debounced, setDebounced] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(ref, () => ({
    focar: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  useEffect(() => {
    const t = setTimeout(() => setDebounced(termo.trim()), 250);
    return () => clearTimeout(t);
  }, [termo]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const habilitado = debounced.length >= 2;
  const { data, isFetching } = useQuery({
    queryKey: ["busca-global", debounced, 5],
    queryFn: () => buscar({ data: { q: debounced, limite: 5 } }),
    enabled: habilitado,
    staleTime: 30_000,
  });

  const telas = useMemo(() => {
    const t = termo.trim().toLowerCase();
    if (!t) return [];
    return itensNavegacao.filter((i) => i.label.toLowerCase().includes(t)).slice(0, 5);
  }, [itensNavegacao, termo]);

  const registros = (data?.resultados ?? []).slice(0, 8);

  /** Lista linear usada pela navegação com as setas. */
  const opcoes = useMemo(
    () => [
      ...registros.map((r) => ({ tipo: "registro" as const, r })),
      ...telas.map((i) => ({ tipo: "tela" as const, i })),
    ],
    [registros, telas],
  );

  useEffect(() => setAtivo(0), [debounced]);

  const irPara = (opcao: (typeof opcoes)[number] | undefined) => {
    setAberto(false);
    if (!opcao) {
      if (termo.trim().length >= 2)
        void navigate({ to: "/busca", search: { q: termo.trim() } as any });
      return;
    }
    if (opcao.tipo === "registro")
      void navigate({ to: opcao.r.to as any, search: opcao.r.search as any });
    else void navigate({ to: opcao.i.to as any });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAberto(true);
      setAtivo((v) => Math.min(v + 1, opcoes.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((v) => Math.max(v - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      irPara(opcoes[ativo]);
    } else if (e.key === "Escape") {
      setAberto(false);
      inputRef.current?.blur();
    }
  };

  const mostrar = aberto && (termo.trim().length > 0 || isFetching);

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <div className="flex items-center gap-2 h-9 rounded-lg border border-border bg-surface px-3 focus-within:ring-2 focus-within:ring-ring/40">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscar propostas, pedidos, clientes, contatos ou telas…"
          aria-label="Busca global"
          className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {termo ? (
          <button
            type="button"
            onClick={() => {
              setTermo("");
              inputRef.current?.focus();
            }}
            aria-label="Limpar busca"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="text-[10px] rounded border border-border px-1 py-0.5 text-muted-foreground">
            ⌘K
          </kbd>
        )}
      </div>

      {mostrar && (
        <div className="absolute left-0 right-0 top-11 z-50 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-surface shadow-xl">
          {isFetching && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
            </div>
          )}

          {!isFetching && !opcoes.length && (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              {termo.trim().length < 2 ? "Digite ao menos 2 caracteres." : "Nada encontrado."}
            </div>
          )}

          {agruparResultados(registros).map(([tipo, itens]) => {
            const Icon = GRUPO_BUSCA[tipo].icon;
            return (
              <div key={tipo}>
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {GRUPO_BUSCA[tipo].titulo}
                </div>
                {itens.map((r) => {
                  const idx = opcoes.findIndex(
                    (o) => o.tipo === "registro" && o.r.id === r.id && o.r.tipo === r.tipo,
                  );
                  return (
                    <button
                      key={`${r.tipo}-${r.id}`}
                      type="button"
                      onMouseEnter={() => setAtivo(idx)}
                      onClick={() => irPara(opcoes[idx])}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                        idx === ativo ? "bg-accent" : "hover:bg-accent/60",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{r.titulo}</span>
                      {r.subtitulo && (
                        <span className="truncate text-xs text-muted-foreground">
                          {r.subtitulo}
                        </span>
                      )}
                      <span className="ml-auto pl-2 text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                        {UNIDADE_BUSCA[r.instancia] ?? r.instancia}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}

          {!!telas.length && (
            <div>
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Navegação
              </div>
              {telas.map((i) => {
                const idx = opcoes.findIndex((o) => o.tipo === "tela" && o.i === i);
                const Icon = i.icon;
                return (
                  <button
                    key={i.to + i.label}
                    type="button"
                    onMouseEnter={() => setAtivo(idx)}
                    onClick={() => irPara(opcoes[idx])}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                      idx === ativo ? "bg-accent" : "hover:bg-accent/60",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{i.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {termo.trim().length >= 2 && (
            <button
              type="button"
              onClick={() => irPara(undefined)}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs font-medium hover:bg-accent/60"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Ver todos os resultados de “{termo.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
});
