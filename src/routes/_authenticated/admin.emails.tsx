import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Search } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listarEmailsEnviados, listarTemplatesEmail } from "@/lib/emails-admin.functions";

const STATUS_LABEL: Record<string, string> = {
  sent: "Enviado",
  pending: "Na fila",
  failed: "Falhou",
  suppressed: "Bloqueado",
  bounced: "Devolvido",
  complained: "Marcado como spam",
  dlq: "Falhou (definitivo)",
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "sent") return "default";
  if (status === "pending") return "secondary";
  if (status === "suppressed") return "outline";
  return "destructive";
}

function dataHora(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function EmailsEnviados() {
  const listar = useServerFn(listarEmailsEnviados);
  const listarTemplates = useServerFn(listarTemplatesEmail);
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const [status, setStatus] = useState("todos");
  const [template, setTemplate] = useState("todos");

  const filtros = useMemo(
    () => ({
      ...(buscaAtiva ? { busca: buscaAtiva } : {}),
      ...(status !== "todos" ? { status } : {}),
      ...(template !== "todos" ? { template } : {}),
      limite: 200,
    }),
    [buscaAtiva, status, template],
  );

  const emailsQuery = useQuery({
    queryKey: ["admin-emails", filtros],
    queryFn: () => listar({ data: filtros }),
  });

  const templatesQuery = useQuery({
    queryKey: ["admin-emails-templates"],
    queryFn: () => listarTemplates(),
  });

  const linhas = emailsQuery.data?.emails ?? [];
  const resumo = useMemo(() => {
    const total = linhas.length;
    const enviados = linhas.filter((l) => l.status === "sent").length;
    const falhas = linhas.filter((l) => ["failed", "dlq", "bounced"].includes(l.status)).length;
    const bloqueados = linhas.filter((l) => l.status === "suppressed" || l.descadastrado).length;
    return { total, enviados, falhas, bloqueados };
  }, [linhas]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">E-mails enviados</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe boletos, kits e avisos: status de entrega, tentativas e descadastros.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => emailsQuery.refetch()}
          disabled={emailsQuery.isFetching}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${emailsQuery.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Registros", valor: resumo.total },
          { label: "Enviados", valor: resumo.enviados },
          { label: "Com falha", valor: resumo.falhas },
          { label: "Bloqueados", valor: resumo.bloqueados },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-semibold">{c.valor}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setBuscaAtiva(busca.trim());
          }}
        >
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar por e-mail ou tipo de aviso"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Buscar
          </Button>
        </form>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={template} onValueChange={setTemplate}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Tipo de e-mail" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {(templatesQuery.data?.templates ?? []).map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[220px]">Destinatário</TableHead>
                <TableHead className="w-[170px]">Tipo</TableHead>
                <TableHead className="w-[90px]">Tentativa</TableHead>
                <TableHead className="w-[140px]">Data</TableHead>
                <TableHead>Detalhe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emailsQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              ) : linhas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    Nenhum e-mail encontrado com esses filtros.
                  </TableCell>
                </TableRow>
              ) : (
                linhas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Badge variant={statusVariant(l.status)}>
                        {STATUS_LABEL[l.status] ?? l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="truncate font-medium">{l.destinatario}</TableCell>
                    <TableCell className="truncate text-sm text-muted-foreground">
                      {l.template}
                    </TableCell>
                    <TableCell className="text-sm">{l.tentativa}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {dataHora(l.criadoEm)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.descadastrado ? (
                        <Badge variant="outline" className="mr-2">
                          Descadastrado
                          {l.motivoDescadastro ? ` · ${l.motivoDescadastro}` : ""}
                        </Badge>
                      ) : null}
                      {l.erro ? <span className="break-words">{l.erro}</span> : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        O link de descadastro é incluído automaticamente no rodapé de todo e-mail e a página de
        descadastro fica hospedada pela plataforma de envio. Quem se descadastra aparece aqui com o
        selo “Descadastrado” e deixa de receber avisos até renovar o consentimento.
      </p>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/admin/emails")({
  head: () => ({
    meta: [
      { title: "E-mails enviados | Portal 2P" },
      {
        name: "description",
        content:
          "Rastreamento dos e-mails do Portal 2P: status de entrega, tentativas e descadastros de boletos e kits.",
      },
      { property: "og:title", content: "E-mails enviados | Portal 2P" },
      {
        property: "og:description",
        content: "Acompanhe entrega, falhas e descadastros dos avisos enviados pelo Portal 2P.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminRouteGuard feature="admin.emails" area="configuracoes">
      <AppLayout>
        <EmailsEnviados />
      </AppLayout>
    </AdminRouteGuard>
  ),
});
