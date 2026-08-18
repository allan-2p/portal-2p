import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { History, RefreshCw } from "lucide-react";
import { listarConclusoes } from "@/lib/carregadores-conclusao-log";

const resultadoBadge: Record<string, { label: string; className: string }> = {
  concluida: { label: "Concluída", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  duplicada: { label: "Tentativa repetida", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  erro: { label: "Erro", className: "bg-destructive/10 text-destructive border-destructive/30" },
  tentativa: { label: "Tentativa", className: "bg-surface-2 text-muted-foreground border-border" },
};

export function ConclusaoLogCard({ propostaId }: { propostaId?: string | null }) {
  const [busca, setBusca] = useState("");
  const [resultado, setResultado] = useState("todos");

  const q = useQuery({
    queryKey: ["carregadores-conclusao-log"],
    queryFn: () => listarConclusoes(200),
    refetchOnMount: "always",
  });

  const rows = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (q.data ?? []).filter((r) => {
      if (propostaId && r.proposta_id !== propostaId) return false;
      if (resultado !== "todos" && r.resultado !== resultado) return false;
      if (!termo) return true;
      return [r.numero, r.actor_email, r.actor_nome, r.origem, r.status, r.detalhe]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(termo));
    });
  }, [q.data, busca, resultado, propostaId]);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          Log de conclusões
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por número, usuário ou origem"
            className="h-9 w-[260px]"
          />
          <Select value={resultado} onValueChange={setResultado}>
            <SelectTrigger className="h-9 w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os resultados</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="duplicada">Tentativa repetida</SelectItem>
              <SelectItem value="erro">Erro</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando histórico…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma conclusão registrada ainda.</p>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Proposta</TableHead>
                  <TableHead>Quem concluiu</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const b = resultadoBadge[r.resultado] ?? resultadoBadge['tentativa']!;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {new Date(r.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-sm">{r.numero ? `#${r.numero}` : "—"}</TableCell>
                      <TableCell className="text-sm">
                        <div>{r.actor_nome ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.actor_email ?? ""}</div>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{r.origem}</TableCell>
                      <TableCell className="text-sm">{r.status ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={b.className}>{b.label}</Badge>
                        {r.detalhe ? (
                          <div className="text-xs text-muted-foreground mt-1">{r.detalhe}</div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
