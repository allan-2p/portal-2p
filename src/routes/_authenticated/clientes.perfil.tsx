import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppLayout } from "@/components/app-layout";
import {
  getSalesforceAccounts,
  getSalesforceAccountHistory,
  type SalesforceAccount,
  type SalesforceAccountHistory,
} from "@/lib/salesforce.functions";

import {
  Search,
  Building2,
  Phone,
  Globe,
  Calendar,
  TrendingUp,
  TrendingDown,
  StickyNote,
  Sparkles,
  Tag,
  ExternalLink,
  Instagram,
  Upload,
  X,
} from "lucide-react";


type Search = { account?: string };

export const Route = createFileRoute("/_authenticated/clientes/perfil")({
  head: () => ({ meta: [{ title: "Perfil do Cliente — Portal 2P" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    account: typeof s.account === "string" ? s.account : undefined,
  }),
  component: PerfilPage,
});

const fmt = (n: number | null | undefined) =>
  typeof n === "number"
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    : "—";

function noteKey(id: string) {
  return `portal2p:client-notes:${id}`;
}

function identityKey(id: string) {
  return `portal2p:client-identity:${id}`;
}

type ClientIdentity = {
  logo?: string | null;
  website?: string | null;
  instagram?: string | null;
};


const PAGE_SIZE = 10;

function PerfilPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const fetchAccounts = useServerFn(getSalesforceAccounts);
  const accountsQ = useQuery({
    queryKey: ["sf-accounts-perfil"],
    queryFn: () => fetchAccounts(),
    staleTime: 5 * 60_000,
  });
  const accounts = accountsQ.data?.records ?? [];

  const selected: SalesforceAccount | null = useMemo(
    () => (search.account ? accounts.find((a) => a.id === search.account) ?? null : null),
    [accounts, search.account],
  );

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.cnpj ?? "").toLowerCase().includes(q) ||
        (a.ownerName ?? "").toLowerCase().includes(q),
    );
  }, [accounts, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Clientes</div>
            <h1 className="text-3xl font-bold mt-1">Perfil do Cliente</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {selected
                ? "Dossiê completo para alimentar o Atlas: cadastro, histórico e anotações do vendedor."
                : "Selecione um cliente da lista para abrir o dossiê completo."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selected && (
              <>
                <button
                  onClick={() => navigate({ to: "/clientes/perfil", search: {} })}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface text-sm font-medium"
                >
                  ← Voltar à lista
                </button>
                <Link
                  to="/clientes/sugestoes"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/15 text-primary hover:bg-primary/20 text-sm font-medium"
                >
                  <Sparkles className="h-4 w-4" /> Sugestões do Atlas
                </Link>
              </>
            )}
          </div>
        </header>

        {selected ? (
          <Dossier account={selected} />
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <div className="p-3 border-b border-border flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nome, CNPJ ou responsável…"
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="ml-auto text-xs text-muted-foreground">
                {accountsQ.isLoading
                  ? "Carregando…"
                  : `${filtered.length} cliente${filtered.length === 1 ? "" : "s"}`}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2/40">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Cliente</th>
                    <th className="text-left px-4 py-2.5 font-medium">CNPJ</th>
                    <th className="text-center px-4 py-2.5 font-medium">Seg.</th>
                    <th className="text-left px-4 py-2.5 font-medium">Responsável</th>
                    <th className="text-right px-4 py-2.5 font-medium">Vendido tri. atual</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {accountsQ.isLoading && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                        Carregando clientes…
                      </td>
                    </tr>
                  )}
                  {!accountsQ.isLoading && pageRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                        Nenhum cliente encontrado.
                      </td>
                    </tr>
                  )}
                  {pageRows.map((a) => (
                    <tr
                      key={a.id}
                      onClick={() =>
                        navigate({ to: "/clientes/perfil", search: { account: a.id } })
                      }
                      className="border-t border-border hover:bg-surface-2/60 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium truncate max-w-[280px]">{a.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.cnpj ?? "—"}</td>
                      <td className="px-4 py-3 text-center">
                        {a.segment ? (
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/15 text-primary text-xs font-semibold">
                            {a.segment}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">
                        {a.ownerName ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmt(a.quarterSold)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-primary text-xs font-medium">Abrir →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
                <div className="text-xs text-muted-foreground">
                  Página {pageSafe} de {totalPages} · exibindo{" "}
                  {(pageSafe - 1) * PAGE_SIZE + 1}–
                  {Math.min(pageSafe * PAGE_SIZE, filtered.length)} de {filtered.length}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={pageSafe === 1}
                    className="px-3 py-1.5 rounded-md bg-surface-2 hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium"
                  >
                    ← Anterior
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={pageSafe === totalPages}
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

function Dossier({ account }: { account: SalesforceAccount }) {
  const [notes, setNotes] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Load notes when account changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    setNotes(window.localStorage.getItem(noteKey(account.id)) ?? "");
    setSavedAt(null);
  }, [account.id]);

  // Autosave (debounced)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = setTimeout(() => {
      window.localStorage.setItem(noteKey(account.id), notes);
      setSavedAt(Date.now());
    }, 600);
    return () => clearTimeout(t);
  }, [notes, account.id]);

  const fetchHistory = useServerFn(getSalesforceAccountHistory);
  const historyQ = useQuery({
    queryKey: ["sf-account-history", account.id],
    queryFn: () => fetchHistory({ data: { accountId: account.id } }),
    staleTime: 5 * 60_000,
  });
  const history = historyQ.data;

  const trend = useMemo(() => {
    const qs = history?.quarters ?? [];
    const now = qs[qs.length - 1]?.total ?? 0;
    const prev = qs[qs.length - 2]?.total ?? 0;
    if (prev === 0 && now === 0) return { pct: null as number | null, up: false };
    if (prev === 0) return { pct: null, up: now > 0 };
    return { pct: ((now - prev) / prev) * 100, up: now >= prev };
  }, [history]);


  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold truncate">{account.name}</h2>
              {account.segment && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                  Segmento {account.segment}
                </span>
              )}
              {account.tubos.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-surface-2 text-muted-foreground"
                >
                  <Tag className="h-3 w-3" /> {t}
                </span>
              ))}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {account.cnpj ?? "CNPJ não informado"}
              {account.industry ? ` · ${account.industry}` : ""}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase text-muted-foreground">Responsável</div>
            <div className="text-sm font-medium">{account.ownerName ?? "—"}</div>
          </div>
        </div>
      </div>

      {/* Identidade */}
      <IdentityCard account={account} />

      {/* KPIs (trimestre) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        <StatCard
          label="Vendido tri. atual"
          value={fmt(history?.quarters.at(-1)?.total ?? 0)}
          icon={Calendar}
          hint={history?.quarters.at(-1)?.label}
        />
        <StatCard
          label="Vendido tri. anterior"
          value={fmt(history?.quarters.at(-2)?.total ?? 0)}
          icon={Calendar}
          hint={history?.quarters.at(-2)?.label}
        />
        <div className="glass rounded-xl p-4">
          <div className="text-[11px] uppercase text-muted-foreground">Variação tri.</div>
          <div className="flex items-center gap-2 mt-1">
            {trend.up ? (
              <TrendingUp className="h-5 w-5 text-success" />
            ) : (
              <TrendingDown className="h-5 w-5 text-destructive" />
            )}
            <div className="text-2xl font-bold">
              {trend.pct == null ? "—" : `${trend.pct >= 0 ? "+" : ""}${trend.pct.toFixed(1)}%`}
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">vs. trimestre anterior</div>
        </div>
        <StatCard
          label="Ticket médio (2a)"
          value={fmt(history?.avgTicket ?? 0)}
          icon={TrendingUp}
          hint={history ? `${history.totalCount} pedido${history.totalCount === 1 ? "" : "s"}` : undefined}
        />
      </div>

      {/* Gráfico trimestral + funil */}
      <div className="grid lg:grid-cols-3 gap-3">
        <div className="glass rounded-xl p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Vendas por trimestre</h3>
            <span className="text-[11px] text-muted-foreground ml-auto">
              últimos 8 trimestres
            </span>
          </div>
          {historyQ.isLoading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              Carregando histórico…
            </div>
          ) : (
            <QuarterBars quarters={history?.quarters ?? []} />
          )}
        </div>
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Oportunidades por status</h3>
          </div>
          {historyQ.isLoading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              Carregando…
            </div>
          ) : (
            <StageBreakdown history={history} />
          )}
        </div>
      </div>

      {/* Identidade */}
      <IdentityCard account={account} />

      {/* Cadastro + contato */}

      <div className="grid md:grid-cols-2 gap-3">
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Cadastro</h3>
          </div>
          <dl className="text-sm space-y-1.5">
            <Field label="CNPJ" value={account.cnpj} />
            <Field label="Setor" value={account.industry} />
            <Field
              label="Cadastrado em"
              value={
                account.createdAt
                  ? new Date(account.createdAt).toLocaleDateString("pt-BR")
                  : null
              }
            />
            <Field label="Responsável" value={account.ownerName} />
            <Field
              label="Última compra"
              value={
                history?.lastPurchase
                  ? new Date(history.lastPurchase).toLocaleDateString("pt-BR")
                  : null
              }
            />
            <Field
              label="Primeira compra"
              value={
                history?.firstPurchase
                  ? new Date(history.firstPurchase).toLocaleDateString("pt-BR")
                  : null
              }
            />
            <Field
              label="Taxa de fechamento"
              value={history ? `${(history.wonRate * 100).toFixed(0)}%` : null}
            />
          </dl>
        </div>
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Phone className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Contato</h3>
          </div>
          <dl className="text-sm space-y-1.5">
            <Field label="Telefone" value={account.phone} />
            <Field
              label="Site"
              value={
                account.website ? (
                  <a
                    href={
                      account.website.startsWith("http")
                        ? account.website
                        : `https://${account.website}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {account.website} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null
              }
            />
          </dl>
          {(account.observacoes || account.description) && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-[11px] uppercase text-muted-foreground mb-1">
                Observações (Salesforce)
              </div>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {account.observacoes ?? account.description}
              </p>
            </div>
          )}
        </div>
      </div>


      {/* Anotações do vendedor */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <StickyNote className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Anotações do vendedor</h3>
          <span className="text-[11px] text-muted-foreground ml-auto">
            {savedAt ? "Salvo automaticamente" : "Digite para começar"}
          </span>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Preferências, últimas conversas, momento do cliente, decisor, próximos passos… Tudo isso vira contexto para o Atlas."
          className="w-full min-h-[160px] p-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary/50 resize-y"
        />
        <div className="text-[11px] text-muted-foreground mt-2">
          Salvo apenas neste navegador enquanto conectamos a base do Atlas.
        </div>
      </div>
    </div>
  );
}

function IdentityCard({ account }: { account: SalesforceAccount }) {
  const [identity, setIdentity] = useState<ClientIdentity>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(identityKey(account.id));
    setIdentity(raw ? (JSON.parse(raw) as ClientIdentity) : {});
    setSavedAt(null);
    setError(null);
  }, [account.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = setTimeout(() => {
      window.localStorage.setItem(identityKey(account.id), JSON.stringify(identity));
      setSavedAt(Date.now());
    }, 500);
    return () => clearTimeout(t);
  }, [identity, account.id]);

  const displayWebsite = identity.website ?? account.website ?? "";
  const instagramHandle = (identity.instagram ?? "").replace(/^@/, "").trim();
  const instagramUrl = instagramHandle
    ? `https://instagram.com/${instagramHandle}`
    : null;

  const handleLogoFile = (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Arquivo precisa ser uma imagem.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Imagem muito grande (máx. 2 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setIdentity((prev) => ({ ...prev, logo: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Identidade</h3>
        <span className="text-[11px] text-muted-foreground ml-auto">
          {savedAt ? "Salvo automaticamente" : "Preencha para enriquecer o dossiê"}
        </span>
      </div>
      <div className="grid md:grid-cols-[160px_1fr] gap-5 items-start">
        <div>
          <div className="relative w-[160px] h-[160px] rounded-xl border border-border bg-background/50 flex items-center justify-center overflow-hidden">
            {identity.logo ? (
              <>
                <img
                  src={identity.logo}
                  alt={`Logo ${account.name}`}
                  className="w-full h-full object-contain"
                />
                <button
                  type="button"
                  onClick={() => setIdentity((p) => ({ ...p, logo: null }))}
                  className="absolute top-1 right-1 p-1 rounded-md bg-background/80 border border-border hover:bg-background"
                  aria-label="Remover logo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <div className="text-center text-muted-foreground text-xs px-3">
                <Upload className="h-6 w-6 mx-auto mb-1 opacity-60" />
                Sem logo
              </div>
            )}
          </div>
          <label className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent cursor-pointer w-full justify-center">
            <Upload className="h-3.5 w-3.5" />
            {identity.logo ? "Trocar logo" : "Enviar logo"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleLogoFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {error && <div className="text-[11px] text-destructive mt-1">{error}</div>}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase text-muted-foreground flex items-center gap-1.5 mb-1">
              <Globe className="h-3 w-3" /> Site
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={displayWebsite}
                onChange={(e) => setIdentity((p) => ({ ...p, website: e.target.value }))}
                placeholder="exemplo.com.br"
                className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary/50"
              />
              {displayWebsite && (
                <a
                  href={displayWebsite.startsWith("http") ? displayWebsite : `https://${displayWebsite}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-accent inline-flex items-center gap-1"
                >
                  Abrir <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase text-muted-foreground flex items-center gap-1.5 mb-1">
              <Instagram className="h-3 w-3" /> Instagram
            </label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center rounded-lg bg-background border border-border focus-within:border-primary/50">
                <span className="pl-3 text-sm text-muted-foreground">@</span>
                <input
                  type="text"
                  value={instagramHandle}
                  onChange={(e) =>
                    setIdentity((p) => ({
                      ...p,
                      instagram: e.target.value.replace(/^@/, ""),
                    }))
                  }
                  placeholder="usuario"
                  className="flex-1 px-2 py-2 bg-transparent text-sm focus:outline-none"
                />
              </div>
              {instagramUrl && (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-accent inline-flex items-center gap-1"
                >
                  Abrir <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground">
            Salvo apenas neste navegador enquanto conectamos a base do Atlas.
          </div>
        </div>
      </div>
    </div>
  );
}



function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-[11px] uppercase text-muted-foreground w-24 shrink-0">{label}</dt>
      <dd className="text-sm">{value ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon: typeof Calendar;
  hint?: string;
}) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function QuarterBars({
  quarters,
}: {
  quarters: SalesforceAccountHistory["quarters"];
}) {
  const max = Math.max(1, ...quarters.map((q) => q.total));
  const anyData = quarters.some((q) => q.total > 0);
  return (
    <div>
      <div className="flex items-end gap-2 h-48 pt-4">
        {quarters.map((q, i) => {
          const h = q.total > 0 ? Math.max(4, Math.round((q.total / max) * 100)) : 0;
          const isCurrent = i === quarters.length - 1;
          return (
            <div key={q.key} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div
                className="text-[10px] tabular-nums text-muted-foreground truncate w-full text-center"
                title={fmt(q.total)}
              >
                {q.total > 0
                  ? q.total >= 1000
                    ? `${(q.total / 1000).toFixed(0)}k`
                    : q.total.toFixed(0)
                  : ""}
              </div>
              <div
                className={cn(
                  "w-full rounded-t-md transition-all",
                  isCurrent ? "bg-primary" : "bg-primary/40",
                )}
                style={{ height: `${h}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-2">
        {quarters.map((q, i) => (
          <div
            key={q.key}
            className={cn(
              "flex-1 text-[10px] text-center",
              i === quarters.length - 1 ? "text-primary font-semibold" : "text-muted-foreground",
            )}
          >
            {q.label}
          </div>
        ))}
      </div>
      {!anyData && (
        <div className="text-center text-xs text-muted-foreground mt-3">
          Sem vendas concluídas nos últimos 2 anos.
        </div>
      )}
    </div>
  );
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function StageBreakdown({ history }: { history: SalesforceAccountHistory | undefined }) {
  if (!history) return null;
  const stages = history.stages;
  if (stages.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        Nenhuma oportunidade nos últimos 2 anos.
      </div>
    );
  }
  const maxCount = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <MiniKpi label="Abertas" value={history.openCount} sub={fmt(history.openValue)} />
        <MiniKpi label="Concluídas" value={history.totalCount} sub={fmt(history.totalLifetime)} />
        <MiniKpi label="Perdidas" value={history.lostCount} sub={`${(history.wonRate * 100).toFixed(0)}% win`} />
      </div>
      <ul className="space-y-1.5 pt-2">
        {stages.map((s) => (
          <li key={s.stage}>
            <div className="flex items-baseline justify-between text-xs mb-0.5">
              <span className="truncate mr-2">{s.stage}</span>
              <span className="tabular-nums text-muted-foreground">
                {s.count} · {fmt(s.total)}
              </span>
            </div>
            <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary/70 rounded-full"
                style={{ width: `${(s.count / maxCount) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniKpi({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="bg-surface-2/40 rounded-lg p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground truncate">{sub}</div>
    </div>
  );
}

