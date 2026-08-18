import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ImageOff, Upload, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCarregadoresInvalidate, useCarregadoresProductsAdmin } from "@/hooks/use-carregadores";
import { useImagensPorPath, BUCKET_PRODUTOS } from "@/lib/produto-imagens";
import type { CarregadoresProduct } from "@/lib/carregadores";

type Filtro = "todos" | "com" | "sem";

const EXT_OK = ["png", "jpg", "jpeg", "webp"];
const MAX_MB = 5;

/** Última sincronização do catálogo com o SAP. */
function useUltimaSync() {
  return useQuery({
    queryKey: ["sap-produtos-ultima-sync"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sap_produtos_sync_runs")
        .select("started_at, finished_at, status, inserted_count, updated_count, error_message")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function CatalogoFotos() {
  const { data: produtos = [], isLoading } = useCarregadoresProductsAdmin();
  const invalidate = useCarregadoresInvalidate();
  const syncQ = useUltimaSync();

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [enviando, setEnviando] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const fotosQ = useImagensPorPath(produtos.map((p) => p.imagem_path));
  const fotos = fotosQ.data ?? {};

  const comFoto = produtos.filter((p) => !!p.imagem_path).length;

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      const casaBusca = !termo || `${p.codigo ?? ""} ${p.nome}`.toLowerCase().includes(termo);
      const casaFiltro =
        filtro === "todos" ? true : filtro === "com" ? !!p.imagem_path : !p.imagem_path;
      return casaBusca && casaFiltro;
    });
  }, [produtos, busca, filtro]);

  async function enviarFoto(p: CarregadoresProduct, file: File) {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!EXT_OK.includes(ext)) return toast.error("Use uma imagem PNG, JPG ou WEBP.");
    if (file.size > MAX_MB * 1024 * 1024) return toast.error(`Imagem acima de ${MAX_MB} MB.`);

    setEnviando(p.id);
    try {
      const path = `skus/${p.codigo || p.id}.${ext === "jpeg" ? "jpg" : ext}`;
      const up = await supabase.storage
        .from(BUCKET_PRODUTOS)
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (up.error) throw new Error(up.error.message);
      const { error } = await supabase.from("sap_produtos").update({ imagem_path: path }).eq("id", p.id);
      if (error) throw new Error(error.message);
      toast.success(`Foto de ${p.codigo || p.nome} atualizada.`);
      invalidate();
      await fotosQ.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar a foto.");
    } finally {
      setEnviando(null);
    }
  }

  async function removerFoto(p: CarregadoresProduct) {
    if (!p.imagem_path) return;
    setEnviando(p.id);
    try {
      const { error } = await supabase.from("sap_produtos").update({ imagem_path: null }).eq("id", p.id);
      if (error) throw new Error(error.message);
      await supabase.storage.from(BUCKET_PRODUTOS).remove([p.imagem_path]);
      toast.success("Foto removida.");
      invalidate();
      await fotosQ.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover a foto.");
    } finally {
      setEnviando(null);
    }
  }

  const sync = syncQ.data;
  const dataSync = sync?.finished_at ?? sync?.started_at;

  return (
    <div className="space-y-4">
      {/* Resumo da sincronização e da cobertura de fotos */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="glass rounded-2xl p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Última sincronização SAP</p>
          <p className="mt-1 text-lg font-semibold">
            {dataSync ? new Date(dataSync).toLocaleString("pt-BR") : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {sync
              ? `${sync.status} · ${sync.inserted_count} novos · ${sync.updated_count} atualizados`
              : "Nenhuma sincronização registrada."}
          </p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Itens no catálogo</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{produtos.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {produtos.filter((p) => p.ativo).length} ativos para proposta
          </p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Com foto</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {comFoto}
            <span className="text-sm font-normal text-muted-foreground"> / {produtos.length}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {produtos.length - comFoto} item(ns) sem imagem
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por código (SKU) ou nome"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {(
            [
              ["todos", "Todos"],
              ["com", "Com foto"],
              ["sem", "Sem foto"],
            ] as [Filtro, string][]
          ).map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant={filtro === k ? "secondary" : "ghost"}
              onClick={() => setFiltro(k)}
            >
              {label}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void fotosQ.refetch();
            void syncQ.refetch();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
        </Button>
      </div>

      {/* Galeria */}
      {isLoading ? (
        <p className="py-10 text-center text-muted-foreground">Carregando catálogo…</p>
      ) : lista.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">Nenhum produto encontrado.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {lista.map((p) => {
            const url = p.imagem_path ? fotos[p.imagem_path] : undefined;
            const ocupado = enviando === p.id;
            return (
              <div key={p.id} className="glass flex gap-3 rounded-2xl p-3">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-2">
                  {url ? (
                    <img src={url} alt={p.nome} className="h-full w-full object-contain" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-6 w-6" />
                    </div>
                  )}
                  {ocupado ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : null}
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate text-sm font-medium" title={p.nome}>
                    {p.nome}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{p.codigo || "sem código"}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant={p.ativo ? "default" : "secondary"} className="text-[10px]">
                      {p.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                    {p.imagem_path ? null : (
                      <Badge variant="outline" className="text-[10px]">
                        sem foto
                      </Badge>
                    )}
                  </div>

                  <div className="mt-auto flex gap-1 pt-2">
                    <input
                      ref={(el) => {
                        inputs.current[p.id] = el;
                      }}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void enviarFoto(p, f);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={ocupado}
                      onClick={() => inputs.current[p.id]?.click()}
                    >
                      <Upload className="mr-2 h-3.5 w-3.5" />
                      {p.imagem_path ? "Trocar" : "Enviar"}
                    </Button>
                    {p.imagem_path ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remover foto"
                        disabled={ocupado}
                        onClick={() => void removerFoto(p)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
