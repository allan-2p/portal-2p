import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Clock, RefreshCw } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listarPedidosParadosFn,
  sincronizarPedidoParadoFn,
  type PedidoParado,
} from "@/lib/pedidos-parados.functions";

export const Route = createFileRoute("/_authenticated/admin/integracoes_/pedidos-parados")({
  head: () => ({
    meta: [
      { title: "Pedidos sem atualização · Portal 2P" },
      {
        name: "description",
        content:
          "Pedidos que pararam de avançar no portal e o último status recebido do SAP para cada ordem de venda.",
      },
      { property: "og:title", content: "Pedidos sem atualização · Portal 2P" },
      {
        property: "og:description",
        content: "Acompanhe os pedidos parados e o último retorno do SAP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.integracoes" area="integracoes">
      <PedidosParadosPage />
    </AdminRouteGuard>
  ),
});

const fmtData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR") : "—";

function TempoBadge({ horas }: { horas: number }) {
  const dias = Math.floor(horas / 24);
  const texto = dias >= 1 ? `${dias}d parado` : `${Math.round(horas)}h parado`;
  const cor =
    horas >= 72
      ? "border-destructive/40 text-destructive"
      : horas >= 24
        ? "border-amber-500/40 text-amber-600"
        : "text-muted-foreground";
  return (
    <Badge variant="outline" className={`gap-1 ${cor}`}>
      <Clock className="h-3 w-3" /> {texto}
    </Badge>
  );
}

function Linha({ p, onSincronizar, sincronizando }: {
  p: PedidoParado;
  onSincronizar: (id: string) => void;
  sincronizando: boolean;
}) {
  const divergente = Boolean(p.sap?.sugerido);
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${divergente ? "border-amber-500/40 bg-amber-500/5" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">Pedido {p.numero ?? p.id.slice(0, 8)}</p>
            <Badge variant="secondary">{p.status}</Badge>
            <TempoBadge horas={p.horasParado} />
            {divergente ? (
              <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600">
                <AlertTriangle className="h-3 w-3" /> SAP já indica “{p.sap?.sugerido}”
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {p.cliente ?? "—"}
            {p.organizacao ? ` · ${p.organizacao}` : ""}
            {p.ovNumero ? ` · OV ${p.ovNumero}` : " · sem OV"}
            {p.nfNumero ? ` · NF ${p.nfNumero}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sem mudança desde {fmtData(p.desde)}
          </p>
        </div>
        <Button
          size="sm"
          variant={divergente ? "default" : "outline"}
          onClick={() => onSincronizar(p.id)}
          disabled={sincronizando}
        >
          <RefreshCw className={`h-4 w-4 ${sincronizando ? "animate-spin" : ""}`} />
          Atualizar agora
        </Button>
      </div>

      <div
        className={`mt-2 rounded-md p-2 text-xs ${
          p.sap?.erro ? "bg-destructive/10 text-destructive" : "bg-muted"
        }`}
      >
        <span className="font-medium">Último retorno do SAP: </span>
        {p.sap ? p.sap.erro ?? p.sap.resumo : "consulta indisponível"}
        {p.sap && !p.sap.erro ? (
          <span className="text-muted-foreground"> · consultado {fmtData(p.sap.consultadoEm)}</span>
        ) : null}
      </div>
    </div>
  );
}

function PedidosParadosPage() {
  const listar = useServerFn(listarPedidosParadosFn);
  const sincronizar = useServerFn(sincronizarPedidoParadoFn);
  const [horas, setHoras] = useState("24");
  const [limite, setLimite] = useState("25");
  const [emAndamento, setEmAndamento] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["pedidos-parados", horas, limite],
    queryFn: () => listar({ data: { horas: Number(horas), limite: Number(limite) } }),
    refetchOnWindowFocus: false,
  });

  const mutation = useMutation({
    mutationFn: (propostaId: string) => sincronizar({ data: { propostaId } }),
    onMutate: (id: string) => setEmAndamento(id),
    onSettled: () => setEmAndamento(null),
    onSuccess: async (r) => {
      if (r.para) toast.success(`Pedido atualizado: ${r.de} → ${r.para}`);
      else toast.info("O SAP ainda não devolveu novidade para este pedido.");
      await query.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao consultar o SAP"),
  });

  const dados = query.data;

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
              <Link to="/admin/integracoes">
                <ArrowLeft className="h-4 w-4" /> Integrações
              </Link>
            </Button>
            <h1 className="font-display text-2xl font-bold">Pedidos sem atualização</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pedidos em andamento que não mudam de status há um tempo, com o último status
              recebido do SAP para cada ordem de venda.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            Atualizar lista
          </Button>
        </div>

        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                {dados ? `${dados.totalElegiveis} pedido(s) parados há ${dados.horas}h ou mais` : "Carregando…"}
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Select value={horas} onValueChange={setHoras}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">Parados há 4h+</SelectItem>
                    <SelectItem value="12">Parados há 12h+</SelectItem>
                    <SelectItem value="24">Parados há 24h+</SelectItem>
                    <SelectItem value="72">Parados há 3 dias+</SelectItem>
                    <SelectItem value="168">Parados há 7 dias+</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={limite} onValueChange={setLimite}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">Consultar 10</SelectItem>
                    <SelectItem value="25">Consultar 25</SelectItem>
                    <SelectItem value="50">Consultar 50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {dados?.aviso ? (
              <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{dados.aviso}</p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2">
            {query.isLoading ? (
              [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)
            ) : query.isError ? (
              <p className="py-8 text-center text-sm text-destructive">
                {query.error instanceof Error ? query.error.message : "Erro ao carregar."}
              </p>
            ) : !dados?.pedidos.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum pedido parado nesse período. Tudo em dia.
              </p>
            ) : (
              <>
                {dados.pedidos.map((p) => (
                  <Linha
                    key={p.id}
                    p={p}
                    sincronizando={emAndamento === p.id}
                    onSincronizar={(id) => mutation.mutate(id)}
                  />
                ))}
                {dados.totalElegiveis > dados.consultados ? (
                  <p className="pt-1 text-center text-xs text-muted-foreground">
                    Mostrando os {dados.consultados} mais parados de {dados.totalElegiveis}.
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
