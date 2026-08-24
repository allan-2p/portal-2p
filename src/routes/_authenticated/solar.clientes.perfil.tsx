import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Client360 } from "@/components/cliente-360/client-360";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { listClientesPerfilFn, getClientePerfilFn } from "@/lib/clientes.functions";
import type { SalesforceAccount } from "@/lib/salesforce.functions";
import { Search, Sparkles, AlertTriangle } from "lucide-react";

type Search = { account?: string };

export const Route = createFileRoute("/_authenticated/solar/clientes/perfil")({
  head: () => ({
    meta: [
      { title: "Perfil do Cliente — Portal 2P" },
      {
        name: "description",
        content: "Dossiê 360 do cliente: cadastro, histórico e anotações do consultor.",
      },
      { property: "og:title", content: "Perfil do Cliente — Portal 2P" },
      {
        property: "og:description",
        content: "Dossiê 360 do cliente: cadastro, histórico e anotações do consultor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    account: typeof s.account === "string" ? s.account : undefined,
  }),
  component: PerfilPage,
});

const PAGE_SIZE = 10;
const INSTANCIA = "solar" as const;

const fmtData = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";

const docFmt = (doc: string | null) => {
  const d = (doc ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return doc ?? "—";
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Converte o cadastro da tabela `clientes` no formato que o dossiê 360 usa.
 * O `id` é o ID da conta no Salesforce (`sf_account_id`), porque o histórico de
 * negócios/atividades ainda vem de lá — a LISTA de clientes, porém, é sempre da
 * tabela `clientes` do Grupo 2P.
 */
function clienteParaAccount(c: Record<string, any>): SalesforceAccount {
  return {
    id: String(c["sf_account_id"] ?? ""),
    name: String(c["razao_social"] ?? c["nome_fantasia"] ?? "—"),
    cnpj: (c["doc"] as string | null) ?? null,
    segment: (["A", "B", "C", "D"].includes(String(c["segmento"] ?? ""))
      ? String(c["segmento"])
      : null) as SalesforceAccount["segment"],
    tubos: [],
    ownerId: (c["consultor_id"] as string | null) ?? (c["created_by"] as string | null) ?? null,
    ownerName:
      ((c["consultor_nome"] as string | null) || (c["created_by_nome"] as string | null)) ?? null,
    createdAt: (c["created_at"] as string | null) ?? null,
    phone: (c["telefone"] as string | null) ?? null,
    website: (c["site"] as string | null) ?? null,
    industry: (c["ramo_atividade"] as string | null) ?? null,
    observacoes: (c["observacoes"] as string | null) ?? null,
    description: (c["observacoes_internas"] as string | null) ?? null,
    quarterProjection: num(c["projecao_trimestre"]),
    quarterSold: num(c["vendido_trimestre"]),
    nomeFantasia: (c["nome_fantasia"] as string | null) ?? null,
    email: (c["email"] as string | null) ?? null,
    instagram: (c["instagram"] as string | null) ?? null,
    nSap: (c["numero_sap"] as string | null) ?? null,
    tipoCliente: (c["tipo_cliente"] as string | null) ?? null,
    carteira: (c["carteira"] as string | null) ?? null,
    condicaoPagamento: (c["condicao_pagamento"] as string | null) ?? null,
    tabelaPrecos: (c["tabela_preco"] as string | null) ?? null,
    regiao: (c["regiao"] as string | null) ?? null,
    finalidadeUso: (c["finalidade"] as string | null) ?? null,
    statusConta: c["ativo"] === false ? "Inativo" : "Ativo",
    regimeTributario: (c["regime_tributario"] as string | null) ?? null,
    contribuinte: c["contribuinte"] ? "Sim" : "Não",
    inscricaoEstadual: (c["inscricao_estadual"] as string | null) ?? null,
  };
}

function PerfilPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const listar = useServerFn(listClientesPerfilFn);
  const buscarCliente = useServerFn(getClientePerfilFn);

  const [query, setQuery] = useState("");
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);

  // Debounce da busca: o filtro roda no banco, sobre toda a base de clientes.
  useEffect(() => {
    const t = setTimeout(() => {
      setBusca(query.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const listaQ = useQuery({
    queryKey: ["clientes-perfil", INSTANCIA, busca, page],
    queryFn: () =>
      listar({ data: { instancia: INSTANCIA, q: busca || undefined, pagina: page, porPagina: PAGE_SIZE } }),
    staleTime: 60_000,
    enabled: !search.account,
  });

  const rows = listaQ.data?.clientes ?? [];
  const total = listaQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const clienteQ = useQuery({
    queryKey: ["cliente-perfil", INSTANCIA, search.account],
    queryFn: () => buscarCliente({ data: { instancia: INSTANCIA, id: search.account! } }),
    enabled: !!search.account,
    staleTime: 60_000,
  });

  const cliente = clienteQ.data?.cliente ?? null;
  const account = useMemo(() => (cliente ? clienteParaAccount(cliente) : null), [cliente]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Clientes</div>
            <h1 className="text-3xl font-bold mt-1">Perfil do Cliente</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {search.account
                ? "Dossiê completo: cadastro do portal, histórico e anotações do consultor."
                : "Selecione um cliente da base do Grupo 2P para abrir o dossiê completo."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {search.account && (
              <>
                <button
                  onClick={() => navigate({ to: "/solar/clientes/perfil", search: {} })}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface text-sm font-medium"
                >
                  ← Voltar à lista
                </button>
                <Link
                  to="/solar/clientes/sugestoes"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/15 text-primary hover:bg-primary/20 text-sm font-medium"
                >
                  <Sparkles className="h-4 w-4" /> Sugestões do Atlas
                </Link>
              </>
            )}
          </div>
        </header>

        {search.account ? (
          clienteQ.isLoading ? (
            <div className="glass rounded-xl p-10 text-center text-muted-foreground">
              Carregando cadastro…
            </div>
          ) : !account ? (
            <div className="glass rounded-xl p-10 text-center text-muted-foreground">
              Cadastro não encontrado nesta unidade.
            </div>
          ) : !account.id ? (
            <div className="glass rounded-xl p-6 space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                {account.name}
              </div>
              <p className="text-sm text-muted-foreground">
                Este cadastro ainda não está vinculado ao Salesforce, então o histórico de negócios
                e atividades do dossiê não pode ser carregado. Envie o cadastro pelas Integrações do
                cliente e abra o perfil novamente.
              </p>
            </div>
          ) : (
            <Client360 account={account} instancia={INSTANCIA} />
          )
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <div className="p-3 border-b border-border flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nome, CNPJ/CPF, nº SAP, cidade ou consultor…"
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="ml-auto text-xs text-muted-foreground">
                {listaQ.isLoading ? "Carregando…" : `${total} cliente${total === 1 ? "" : "s"}`}
              </div>
            </div>

            {listaQ.data?.ok === false && (
              <div className="px-4 py-3 text-sm text-amber-600 border-b border-border">
                A tabela de clientes do Grupo 2P não está acessível.
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2/40">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Cliente</th>
                    <th className="text-left px-4 py-2.5 font-medium">CNPJ/CPF</th>
                    <th className="text-left px-4 py-2.5 font-medium">Nº SAP</th>
                    <th className="text-left px-4 py-2.5 font-medium">Cidade/UF</th>
                    <th className="text-left px-4 py-2.5 font-medium">Consultor</th>
                    <th className="text-left px-4 py-2.5 font-medium">Cliente desde</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {listaQ.isLoading && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                        Carregando clientes…
                      </td>
                    </tr>
                  )}
                  {!listaQ.isLoading && rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                        Nenhum cliente encontrado.
                      </td>
                    </tr>
                  )}
                  {rows.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() =>
                        navigate({ to: "/solar/clientes/perfil", search: { account: c.id } })
                      }
                      className="border-t border-border hover:bg-surface-2/60 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium truncate max-w-[280px]">
                        {c.razaoSocial}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {docFmt(c.doc)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {c.numeroSap ? c.numeroSap.replace(/^0+/, "") : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground truncate max-w-[180px]">
                        {c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ""}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">
                        {c.consultor ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtData(c.criadoEm)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-primary text-xs font-medium">Abrir →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
                <div className="text-xs text-muted-foreground">
                  Página {page} de {totalPages} · exibindo {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, total)} de {total}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-md bg-surface-2 hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium"
                  >
                    ← Anterior
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 rounded-md bg-surface-2 hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium"
                  >
                    Próxima →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
