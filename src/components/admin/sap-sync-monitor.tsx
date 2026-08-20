import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  ScrollText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listClientesFn, reenviarClienteFn } from "@/lib/clientes.functions";

type Instancia = "solar" | "carregadores";
type Estado = "ok" | "erro" | "pendente";

type Linha = {
  id: string;
  instancia: Instancia;
  razao: string;
  doc: string;
  numeroSap: string | null;
  status: string | null;
  erro: string | null;
  equipe: string | null;
  escritorio: string | null;
  quando: string | null;
};

const LABEL_INSTANCIA: Record<Instancia, string> = {
  solar: "2P Solar",
  carregadores: "2P Carregadores",
};

function estadoSap(status: string | null, numeroSap: string | null): Estado {
  const s = (status ?? "").toLowerCase();
  if (s.includes("erro") || s.includes("fail")) return "erro";
  if (numeroSap || s.includes("ok") || s.includes("sucesso") || s.includes("sincron")) return "ok";
  return "pendente";
}

function StatusBadge({ estado }: { estado: Estado }) {
  if (estado === "ok") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> Sincronizado
      </Badge>
    );
  }
  if (estado === "erro") {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
        <AlertTriangle className="h-3 w-3" /> Erro
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Clock className="h-3 w-3" /> Pendente
    </Badge>
  );
}

function formatarDoc(doc: string) {
  const d = doc.replace(/\D/g, "");
  if (d.length === 14) {
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return doc;
}

export function SapSyncMonitor() {
  const listar = useServerFn(listClientesFn);
  const reenviar = useServerFn(reenviarClienteFn);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | Estado>("todos");
  const [instancia, setInstancia] = useState<"todas" | Instancia>("todas");
  const [processando, setProcessando] = useState<string | null>(null);
  const [lote, setLote] = useState<{ feitos: number; total: number } | null>(null);

  const query = useQuery({
    queryKey: ["sap-sync-monitor"],
    queryFn: async () => {
      const instancias: Instancia[] = ["solar", "carregadores"];
      const linhas: Linha[] = [];
      for (const inst of instancias) {
        const res: any = await listar({ data: { instancia: inst } });
        for (const c of res?.clientes ?? []) {
          linhas.push({
            id: c.id,
            instancia: inst,
            razao: c.razao_social ?? c.nome_fantasia ?? "—",
            doc: c.doc ?? "",
            numeroSap: c.numero_sap ?? null,
            status: c.sap_status ?? null,
            erro: c.sap_erro ?? null,
            equipe: c.equipe_vendas ?? null,
            escritorio: c.escritorio_vendas ?? null,
            quando: c.sincronizado_em ?? c.updated_at ?? null,
          });
        }
      }
      return linhas;
    },
  });

  const todas = query.data ?? [];

  const resumo = useMemo(() => {
    let erro = 0;
    let pendente = 0;
    let ok = 0;
    for (const l of todas) {
      const e = estadoSap(l.status, l.numeroSap);
      if (e === "erro") erro += 1;
      else if (e === "pendente") pendente += 1;
      else ok += 1;
    }
    return { erro, pendente, ok, total: todas.length };
  }, [todas]);

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return todas.filter((l) => {
      if (instancia !== "todas" && l.instancia !== instancia) return false;
      const e = estadoSap(l.status, l.numeroSap);
      if (filtro !== "todos" && e !== filtro) return false;
      if (!termo) return true;
      return (
        l.razao.toLowerCase().includes(termo) ||
        l.doc.includes(termo.replace(/\D/g, "")) ||
        (l.numeroSap ?? "").toLowerCase().includes(termo)
      );
    });
  }, [todas, busca, filtro, instancia]);

  async function reenviarUm(l: Linha) {
    setProcessando(l.id);
    try {
      const res: any = await reenviar({
        data: { instancia: l.instancia, id: l.id, alvos: ["sap"] },
      });
      const erro = res?.sap?.erro ?? res?.erro ?? null;
      if (erro) toast.error(`${l.razao}: ${erro}`);
      else toast.success(`${l.razao} sincronizado com o SAP.`);
      await query.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao reenviar para o SAP");
    } finally {
      setProcessando(null);
    }
  }

  async function reenviarFalhas() {
    const alvo = linhas.filter((l) => estadoSap(l.status, l.numeroSap) === "erro");
    if (alvo.length === 0) {
      toast.info("Nenhum cadastro com erro na lista filtrada.");
      return;
    }
    setLote({ feitos: 0, total: alvo.length });
    let sucesso = 0;
    for (let i = 0; i < alvo.length; i += 1) {
      const l = alvo[i]!;
      try {
        const res: any = await reenviar({
          data: { instancia: l.instancia, id: l.id, alvos: ["sap"] },
        });
        if (!(res?.sap?.erro ?? res?.erro)) sucesso += 1;
      } catch {
        /* segue para o próximo */
      }
      setLote({ feitos: i + 1, total: alvo.length });
    }
    setLote(null);
    toast.success(`Reenvio concluído: ${sucesso} de ${alvo.length} sincronizados.`);
    await query.refetch();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Cadastros", valor: resumo.total, cor: "" },
          { label: "Sincronizados", valor: resumo.ok, cor: "text-emerald-600" },
          { label: "Pendentes", valor: resumo.pendente, cor: "text-amber-600" },
          { label: "Com erro", valor: resumo.erro, cor: "text-destructive" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-2xl font-bold ${k.cor}`}>
                {query.isLoading ? "—" : k.valor}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Sincronização de clientes com o SAP</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => query.refetch()}
                disabled={query.isFetching || !!lote}
              >
                <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              <Button size="sm" onClick={reenviarFalhas} disabled={!!lote || query.isLoading}>
                {lote
                  ? `Reenviando ${lote.feitos}/${lote.total}...`
                  : "Reenviar todos com erro"}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por razão social, CNPJ ou nº SAP"
                className="pl-8"
              />
            </div>
            <Select value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
              <SelectTrigger className="sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="erro">Com erro</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
                <SelectItem value="ok">Sincronizados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={instancia} onValueChange={(v) => setInstancia(v as typeof instancia)}>
              <SelectTrigger className="sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as unidades</SelectItem>
                <SelectItem value="solar">2P Solar</SelectItem>
                <SelectItem value="carregadores">2P Carregadores</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {query.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : linhas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum cadastro encontrado com esses filtros.
            </p>
          ) : (
            linhas.map((l) => {
              const estado = estadoSap(l.status, l.numeroSap);
              return (
                <div key={`${l.instancia}-${l.id}`} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{l.razao}</p>
                        <StatusBadge estado={estado} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {LABEL_INSTANCIA[l.instancia]} ·{" "}
                        {l.doc ? formatarDoc(l.doc) : "sem documento"}
                        {l.numeroSap ? ` · KUNNR ${l.numeroSap}` : " · sem nº SAP"}
                        {l.equipe ? ` · equipe ${l.equipe}` : ""}
                        {l.escritorio ? ` · escritório ${l.escritorio}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          to="/admin/logs/integracoes"
                          search={{ cliente: l.id }}
                          aria-label={`Ver logs de ${l.razao}`}
                        >
                          <ScrollText className="h-4 w-4" /> Logs
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant={estado === "ok" ? "outline" : "default"}
                        onClick={() => reenviarUm(l)}
                        disabled={processando === l.id || !!lote}
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${processando === l.id ? "animate-spin" : ""}`}
                        />
                        {estado === "ok" ? "Ressincronizar" : "Tentar novamente"}
                      </Button>
                    </div>
                  </div>
                  {l.erro ? (
                    <p className="mt-2 break-words rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                      {l.erro}
                    </p>
                  ) : null}
                  {l.quando ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Última sincronização: {new Date(l.quando).toLocaleString("pt-BR")}
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
