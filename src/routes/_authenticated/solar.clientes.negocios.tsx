import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Briefcase } from "lucide-react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";

import { getDossieClienteFn } from "@/lib/cliente-dossie.functions";

const searchSchema = z.object({
  instancia: fallback(z.string(), "solar").default("solar"),
  sfId: fallback(z.string(), "").default(""),
  doc: fallback(z.string(), "").default(""),
  nome: fallback(z.string(), "").default(""),
  tipo: fallback(z.string(), "ganhos").default("ganhos"),
});

export const Route = createFileRoute("/_authenticated/solar/clientes/negocios")({
  validateSearch: zodValidator(searchSchema),
  component: NegociosPage,
  head: () => ({
    meta: [
      { title: "Propostas e pedidos do cliente | Portal 2P" },
      {
        name: "description",
        content: "Histórico completo de propostas e pedidos ganhos e perdidos do cliente.",
      },
      { property: "og:title", content: "Propostas e pedidos do cliente | Portal 2P" },
      {
        property: "og:description",
        content: "Histórico completo de propostas e pedidos ganhos e perdidos do cliente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-sm text-destructive">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Cliente não encontrado.</div>,
});

const fmt = (v: number | null | undefined) =>
  typeof v === "number"
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";
const date = (d?: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR") : "—");

function NegociosPage() {
  const { instancia, sfId, doc, nome, tipo } = Route.useSearch();
  const fetchDossie = useServerFn(getDossieClienteFn);

  const q = useQuery({
    queryKey: ["dossie-cliente-full", instancia, sfId, doc],
    queryFn: () =>
      fetchDossie({
        data: {
          instancia: (instancia === "carregadores" ? "carregadores" : "solar") as
            | "solar"
            | "carregadores",
          sfAccountId: sfId || null,
          doc: doc || null,
        },
      }),
  });

  const ganho = tipo !== "perdidos";
  const rows = (q.data?.negocios ?? [])
    .filter((o: any) => (ganho ? o.isWon : o.isClosed && !o.isWon))
    .sort((a: any, b: any) => String(b.closeDate ?? "").localeCompare(String(a.closeDate ?? "")));
  const total = rows.reduce((s: number, o: any) => s + (o.amount || 0), 0);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <Link
        to="/solar/clientes/perfil"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar ao perfil
      </Link>

      <div className="flex items-center gap-2 flex-wrap">
        <Briefcase className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">
          {ganho ? "Pedidos ganhos" : "Pedidos perdidos"}
          {nome ? ` — ${nome}` : ""}
        </h1>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {rows.length} registros · {fmt(total)}
        </span>
      </div>

      <div className="glass rounded-xl p-4 overflow-x-auto">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum registro.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-2 font-medium">Pedido</th>
                <th className="text-left px-2 py-2 font-medium">Etapa</th>
                <th className="text-right px-2 py-2 font-medium">Valor</th>
                <th className="text-left px-2 py-2 font-medium">Data</th>
                <th className="text-left px-2 py-2 font-medium">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o: any) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="px-2 py-2 font-medium">{o.name}</td>
                  <td className="px-2 py-2 text-muted-foreground">{o.stage ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(o.amount)}</td>
                  <td className="px-2 py-2 text-muted-foreground tabular-nums">
                    {date(o.closeDate)}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{o.owner ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
