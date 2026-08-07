import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL } from "@/lib/cpo";

export const Route = createFileRoute("/_authenticated/carregadores/clientes/")({
  head: () => ({
    meta: [
      { title: "Clientes — Portal 2P Carregadores" },
      { name: "description", content: "Carteira de clientes da unidade de carregadores, consolidada pelas propostas CPO." },
      { property: "og:title", content: "Clientes — Portal 2P Carregadores" },
      { property: "og:description", content: "Clientes, volume de propostas e valor por conta na unidade de carregadores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CarregadoresClientes,
});

type Prop = {
  cliente_nome: string;
  cliente_email: string | null;
  cliente_telefone: string | null;
  uf: string;
  status: string;
  totais: Record<string, number> | null;
  created_at: string;
};

function CarregadoresClientes() {
  const [q, setQ] = useState("");

  const { data: props = [], isLoading } = useQuery({
    queryKey: ["cpo-clientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cpo_proposals")
        .select("cliente_nome,cliente_email,cliente_telefone,uf,status,totais,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Prop[];
    },
  });

  const rows = useMemo(() => {
    const map = new Map<string, {
      nome: string; email: string | null; tel: string | null; uf: string;
      propostas: number; aprovadas: number; valor: number; ultima: string;
    }>();
    for (const p of props) {
      const key = p.cliente_nome.trim().toUpperCase();
      const cur = map.get(key) ?? {
        nome: p.cliente_nome.trim(), email: p.cliente_email, tel: p.cliente_telefone,
        uf: p.uf, propostas: 0, aprovadas: 0, valor: 0, ultima: p.created_at,
      };
      cur.propostas += 1;
      if (p.status === "Aprovada") cur.aprovadas += 1;
      cur.valor += Number(p.totais?.["total"] ?? p.totais?.["receita"] ?? 0);
      cur.email = cur.email ?? p.cliente_email;
      cur.tel = cur.tel ?? p.cliente_telefone;
      if (p.created_at > cur.ultima) cur.ultima = p.created_at;
      map.set(key, cur);
    }
    const term = q.trim().toLowerCase();
    return [...map.values()]
      .filter((r) => !term || r.nome.toLowerCase().includes(term))
      .sort((a, b) => b.valor - a.valor);
  }, [props, q]);

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">Clientes</h1>
            <p className="text-sm text-muted-foreground">Carteira própria de carregadores, consolidada pelas propostas CPO.</p>
          </div>
          <div className="relative w-64">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Cliente</th>
                  <th className="text-left px-4 py-2">UF</th>
                  <th className="text-left px-4 py-2">Contato</th>
                  <th className="text-right px-4 py-2">Propostas</th>
                  <th className="text-right px-4 py-2">Aprovadas</th>
                  <th className="text-right px-4 py-2">Valor</th>
                  <th className="text-right px-4 py-2">Última</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Carregando…</td></tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Nenhum cliente ainda — crie uma proposta.</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.nome} className="hover:bg-surface-2/40">
                    <td className="px-4 py-2 font-medium">{r.nome}</td>
                    <td className="px-4 py-2">{r.uf}</td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">
                      {r.email ?? "—"}{r.tel ? ` • ${r.tel}` : ""}
                    </td>
                    <td className="px-4 py-2 text-right">{r.propostas}</td>
                    <td className="px-4 py-2 text-right">{r.aprovadas}</td>
                    <td className="px-4 py-2 text-right font-semibold">{fmtBRL(r.valor)}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                      {new Date(r.ultima).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
