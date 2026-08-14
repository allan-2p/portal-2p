import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL, fmtPct } from "@/lib/cpo";
import { StatusDot } from "@/components/proposta-status-ui";
import { PropostaTimeline } from "@/components/proposta-timeline";
import { propostaStatusStyle } from "@/lib/proposta-status";
import { ArrowLeft, Calculator, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/carregadores/propostas/visualizar")({
  head: () => ({
    meta: [
      { title: "Detalhes da proposta — Portal 2P Carregadores" },
      {
        name: "description",
        content: "Resumo objetivo da proposta: cliente, itens, totais e andamento do pedido.",
      },
      { property: "og:title", content: "Detalhes da proposta — Portal 2P Carregadores" },
      {
        property: "og:description",
        content: "Consulte dados do cliente, produtos, valores e o andamento do pedido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    id: typeof s['id'] === "string" ? s['id'] : undefined,
  }),
  component: VisualizarPropostaPage,
});

type Item = { codigo?: string | null; nome?: string; qtd?: number; valor?: number };

const fmtData = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

function VisualizarPropostaPage() {
  const { id } = Route.useSearch();

  const q = useQuery({
    queryKey: ["cpo-proposta", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cpo_proposals")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const p = q.data as Record<string, any> | null | undefined;
  const itens: Item[] = (p?.['itens'] as Item[]) ?? [];
  const totais: Record<string, number> = (p?.['totais'] as Record<string, number>) ?? {};
  const subtotal = itens.reduce((a, i) => a + (i.valor ?? 0) * (i.qtd ?? 0), 0);
  const frete = Number(p?.['frete_valor'] ?? 0);
  const status = String(p?.['status'] ?? "Salvo");
  const st = propostaStatusStyle(status);

  return (
    <AppLayout>
      <div className="max-w-[1200px] mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" className="gap-2" asChild>
            <Link to="/carregadores/propostas">
              <ArrowLeft className="h-4 w-4" /> Voltar às propostas
            </Link>
          </Button>
          {p && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <Link to="/carregadores/propostas/auditoria" search={{ id: p['id'] }}>
                  <Calculator className="h-4 w-4" /> Auditoria
                </Link>
              </Button>
              <Button size="sm" className="gap-2" asChild>
                <Link to="/carregadores/propostas/nova" search={{ id: p['id'] }}>
                  <Pencil className="h-4 w-4" /> Editar
                </Link>
              </Button>
            </div>
          )}
        </div>

        {q.isLoading && <div className="glass rounded-2xl p-8 text-muted-foreground">Carregando…</div>}
        {!q.isLoading && !p && (
          <div className="glass rounded-2xl p-8 text-muted-foreground">Proposta não encontrada.</div>
        )}

        {p && (
          <>
            {/* Cabeçalho objetivo */}
            <div className="glass rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-primary font-semibold">
                    Proposta {p['numero'] ?? "—"}
                  </div>
                  <h1 className="text-2xl font-bold mt-1 truncate">
                    {p['nome'] || p['cliente_nome']}
                  </h1>
                  <div className="text-sm text-muted-foreground mt-1">{p['cliente_nome']}</div>
                </div>
                <div
                  className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold"
                  style={{ backgroundColor: st.bg, color: st.fg }}
                >
                  <StatusDot status={status} size="sm" className="ring-0" />
                  {status}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <Campo label="Data de criação" value={fmtData(p['created_at'])} />
                <Campo label="Criado por" value={p['criado_por_nome'] || "—"} />
                <Campo
                  label="Finalizado em"
                  value={p['finalizado_em'] ? fmtData(p['finalizado_em']) : "—"}
                />
                <Campo label="Finalizado por" value={p['finalizado_por_nome'] || "—"} />
                <Campo label="Consultor responsável" value={p['consultor_nome'] || "—"} />
                <Campo label="Nº SAP" value={p['numero_sap'] || "—"} />
                <Campo label="CNPJ/CPF" value={p['cliente_doc'] || "—"} />
                <Campo label="Inscrição estadual" value={p['cliente_ie'] || "—"} />
              </div>
            </div>

            {/* Andamento do pedido */}
            <div className="glass rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Andamento do pedido
              </h2>
              <PropostaTimeline status={status} />
            </div>

            {/* Dados fiscais e contato */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="glass rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Faturamento
                </h2>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <Campo label="UF de destino" value={String(p['uf'] ?? "—")} />
                  <Campo label="Contribuinte" value={p['contribuinte'] ? "Sim" : "Não"} />
                  <Campo label="Finalidade de uso" value={labelFinalidade(p['finalidade_uso'])} />
                  <Campo
                    label="Frete"
                    value={`${p['frete_mod'] ?? "—"} · ${fmtBRL(frete)}`}
                  />
                </div>
              </div>

              <div className="glass rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Contato do cliente
                </h2>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <Campo label="Telefone" value={p['cliente_telefone'] || "—"} />
                  <Campo label="E-mail" value={p['cliente_email'] || "—"} />
                </div>
                {p['observacoes'] ? (
                  <div className="pt-2">
                    <div className="text-xs text-muted-foreground">Observações</div>
                    <div className="text-sm whitespace-pre-wrap">{p['observacoes']}</div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Itens */}
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-5 pt-5 pb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Produtos da proposta
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase tracking-wider border-y border-border">
                      <th className="text-left px-5 py-3">Código</th>
                      <th className="text-left px-5 py-3">Descrição</th>
                      <th className="text-right px-5 py-3">Qtde</th>
                      <th className="text-right px-5 py-3">Preço unitário</th>
                      <th className="text-right px-5 py-3">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((i, idx) => (
                      <tr key={idx} className="border-b border-border/50 last:border-0">
                        <td className="px-5 py-3 text-muted-foreground">{i.codigo || "—"}</td>
                        <td className="px-5 py-3 font-medium">{i.nome || "—"}</td>
                        <td className="px-5 py-3 text-right">{i.qtd ?? 0}</td>
                        <td className="px-5 py-3 text-right">{fmtBRL(i.valor ?? 0)}</td>
                        <td className="px-5 py-3 text-right font-semibold">
                          {fmtBRL((i.valor ?? 0) * (i.qtd ?? 0))}
                        </td>
                      </tr>
                    ))}
                    {itens.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                          Nenhum item nesta proposta.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-8 border-t border-border px-5 py-4">
                <Total label="Subtotal" value={fmtBRL(subtotal)} />
                <Total label="Frete" value={fmtBRL(frete)} />
                <Total
                  label="Total"
                  value={fmtBRL(totais['valorTotal'] ?? subtotal + frete)}
                  destaque
                />
              </div>
            </div>

            {/* Indicadores internos */}
            <div className="glass rounded-2xl p-5 space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Indicadores internos
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <Campo label="Receita líquida" value={fmtBRL(totais['rl'] ?? 0)} />
                <Campo label="Margem bruta" value={fmtPct(totais['mbPct'] ?? 0)} />
                <Campo label="Comissão estimada" value={fmtBRL(totais['comissao'] ?? 0)} />
                <Campo label="ICMS" value={fmtBRL(totais['icms'] ?? 0)} />
                <Campo label="IPI" value={fmtBRL(totais['ipi'] ?? 0)} />
                <Campo label="PIS/COFINS" value={fmtBRL(totais['pisCofins'] ?? 0)} />
                <Campo label="Valor dos itens" value={fmtBRL(totais['valor'] ?? subtotal)} />
                <Campo label="Margem bruta (R$)" value={fmtBRL(totais['mb'] ?? 0)} />
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function labelFinalidade(v: unknown) {
  const map: Record<string, string> = {
    uso_consumo: "Uso e consumo",
    revenda: "Revenda",
    industrializacao: "Industrialização",
  };
  return map[String(v ?? "")] ?? "—";
}

function Campo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}

function Total({ label, value, destaque }: { label: string; value: string; destaque?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={destaque ? "text-xl font-bold text-primary" : "text-base font-semibold"}>
        {value}
      </div>
    </div>
  );
}
