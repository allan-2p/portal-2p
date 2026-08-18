import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Search, ScrollText } from "lucide-react";
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

type Linha = {
  id: string;
  instancia: Instancia;
  razao: string;
  doc: string;
  numeroSap: string | null;
  sapStatus: string | null;
  sapErro: string | null;
  sfAccount: string | null;
  sfStatus: string | null;
  sfErro: string | null;
  quando: string | null;
};

const LABEL_INSTANCIA: Record<Instancia, string> = {
  solar: "2P Solar",
  carregadores: "2P Carregadores",
};

function normalizar(status: string | null, id: string | null): "ok" | "erro" | "pendente" {
  const s = (status ?? "").toLowerCase();
  if (s.includes("erro") || s.includes("fail")) return "erro";
  if (id || s.includes("ok") || s.includes("sucesso") || s.includes("sincron")) return "ok";
  return "pendente";
}

function StatusBadge({ estado, texto }: { estado: "ok" | "erro" | "pendente"; texto?: string }) {
  if (estado === "ok") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> {texto ?? "Sincronizado"}
      </Badge>
    );
  }
  if (estado === "erro") {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
        <AlertTriangle className="h-3 w-3" /> {texto ?? "Erro"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Clock className="h-3 w-3" /> {texto ?? "Pendente"}
    </Badge>
  );
}

export function ClientesIntegracaoStatus() {
  const listar = useServerFn(listClientesFn);
  const reenviar = useServerFn(reenviarClienteFn);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "erro" | "pendente" | "ok">("todos");
  const [instancia, setInstancia] = useState<"todas" | Instancia>("todas");
  const [processando, setProcessando] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["clientes-integracao-status"],
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
            sapStatus: c.sap_status ?? null,
            sapErro: c.sap_erro ?? null,
            sfAccount: c.sf_account_id ?? null,
            sfStatus: c.sf_status ?? null,
            sfErro: c.sf_erro ?? null,
            quando: c.sincronizado_em ?? c.updated_at ?? null,
          });
        }
      }
      return linhas;
    },
  });

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (query.data ?? []).filter((l) => {
      if (instancia !== "todas" && l.instancia !== instancia) return false;
      const sap = normalizar(l.sapStatus, l.numeroSap);
      const sf = normalizar(l.sfStatus, l.sfAccount);
      if (filtro === "erro" && sap !== "erro" && sf !== "erro") return false;
      if (filtro === "pendente" && sap !== "pendente" && sf !== "pendente") return false;
      if (filtro === "ok" && !(sap === "ok" && sf === "ok")) return false;
      if (!termo) return true;
      return (
        l.razao.toLowerCase().includes(termo) ||
        l.doc.includes(termo.replace(/\D/g, "")) ||
        (l.numeroSap ?? "").toLowerCase().includes(termo)
      );
    });
  }, [query.data, busca, filtro, instancia]);

  const resumo = useMemo(() => {
    const base = query.data ?? [];
    let erro = 0;
    let pendente = 0;
    let ok = 0;
    for (const l of base) {
      const sap = normalizar(l.sapStatus, l.numeroSap);
      const sf = normalizar(l.sfStatus, l.sfAccount);
      if (sap === "erro" || sf === "erro") erro += 1;
      else if (sap === "pendente" || sf === "pendente") pendente += 1;
      else ok += 1;
    }
    return { erro, pendente, ok, total: base.length };
  }, [query.data]);

  async function reprocessar(l: Linha, alvos?: ("sap" | "salesforce" | "contatos")[]) {
    setProcessando(alvos ? `${l.id}:${alvos.join(",")}` : l.id);
    try {
      await reenviar({ data: { instancia: l.instancia, id: l.id, ...(alvos ? { alvos } : {}) } });
      toast.success(`Reprocessado${alvos ? ` (${alvos.join(", ")})` : ""}: ${l.razao}`);
      await query.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao reprocessar");
    } finally {
      setProcessando(null);
    }
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Status de cadastro por cliente (SAP e Salesforce)</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{resumo.total} cadastros</span>
          <span className="text-destructive">{resumo.erro} com erro</span>
          <span>{resumo.pendente} pendentes</span>
          <span className="text-emerald-600">{resumo.ok} sincronizados</span>
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
            const sap = normalizar(l.sapStatus, l.numeroSap);
            const sf = normalizar(l.sfStatus, l.sfAccount);
            return (
              <div
                key={`${l.instancia}-${l.id}`}
                className="rounded-lg border p-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.razao}</p>
                    <p className="text-xs text-muted-foreground">
                      {LABEL_INSTANCIA[l.instancia]} · {l.doc || "sem documento"}
                      {l.numeroSap ? ` · SAP ${l.numeroSap}` : ""}
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
                      variant="outline"
                      onClick={() => reprocessar(l)}
                      disabled={processando === l.id}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${processando === l.id ? "animate-spin" : ""}`}
                      />
                      Reprocessar tudo
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => reprocessar(l, ["sap"])}
                      disabled={processando === `${l.id}:sap`}
                    >
                      Só SAP
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => reprocessar(l, ["salesforce"])}
                      disabled={processando === `${l.id}:salesforce`}
                    >
                      Só Salesforce
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => reprocessar(l, ["contatos"])}
                      disabled={processando === `${l.id}:contatos`}
                    >
                      Só contatos
                    </Button>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">SAP</span>
                      <StatusBadge estado={sap} />
                    </div>
                    {l.sapErro ? (
                      <p className="break-words text-xs text-destructive">{l.sapErro}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Salesforce</span>
                      <StatusBadge estado={sf} />
                    </div>
                    {l.sfErro ? (
                      <p className="break-words text-xs text-destructive">{l.sfErro}</p>
                    ) : null}
                  </div>
                </div>
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
  );
}
