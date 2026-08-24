import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sincronizarDonoContaFn } from "@/lib/owner-sync.functions";

import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { getDossieClienteFn } from "@/lib/cliente-dossie.functions";
import {
  getSalesforceAccountContacts,
  getSalesforceAccountActivities,
  getSalesforceAccount360,
  createSalesforceTask,
  logSalesforceInteraction,
  type SalesforceAccount,
  type SalesforceContact,
  type SalesforceActivity,
} from "@/lib/salesforce.functions";
import {
  getClientNotes,
  saveClientNotes,
  type ClientNoteCard,
} from "@/lib/client-notes.functions";
import { AtlasBoard } from "@/components/cliente-360/atlas-board";
import { cn } from "@/lib/utils";

import {
  Building2,
  Phone,
  Mail,
  Globe,
  Instagram,
  ChevronDown,
  Users,
  Briefcase,
  LifeBuoy,
  MapPin,
  GraduationCap,
  Wallet,
  Sparkles,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Circle,
  CalendarClock,
  Smartphone,
  Clock,
  BarChart3,
  ShieldCheck,
  Hash,
  Save,
  Plus,
  PhoneCall,
} from "lucide-react";

const fmt = (n: number | null | undefined) =>
  typeof n === "number"
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    : "—";

const date = (v: string | null | undefined) =>
  v ? new Date(v.length <= 10 ? `${v}T12:00:00` : v).toLocaleDateString("pt-BR") : "—";

type TabKey = "visao" | "negocios" | "casos" | "campo" | "financeiro" | "atlas";

const TABS: Array<{ key: TabKey; label: string; icon: typeof Users }> = [
  { key: "visao", label: "Visão geral", icon: BarChart3 },
  { key: "negocios", label: "Propostas & pedidos", icon: Briefcase },
  { key: "casos", label: "Casos", icon: LifeBuoy },
  { key: "campo", label: "Visitas & treinamentos", icon: MapPin },
  { key: "financeiro", label: "Financeiro", icon: Wallet },
];


/** Dossiê 360 do cliente: cadastro, negócios, campo, financeiro e Atlas. */
export function Client360({
  account,
  instancia = "solar",
}: {
  account: SalesforceAccount;
  instancia?: "solar" | "carregadores";
}) {
  const temSf = /^[a-zA-Z0-9]{15,18}$/.test(account.id ?? "");
  const [tab, setTab] = useState<TabKey>("visao");
  const queryClient = useQueryClient();

  const fetchDossie = useServerFn(getDossieClienteFn);
  const fetch360 = useServerFn(getSalesforceAccount360);
  const sincronizarDono = useServerFn(sincronizarDonoContaFn);

  // Transferência de carteira: se a conta mudou de vendedor no Salesforce,
  // o cadastro do portal é realinhado ao abrir o perfil.
  const syncQ = useQuery({
    queryKey: ["sync-dono-conta", instancia, account.id],
    queryFn: () => sincronizarDono({ data: { instancia, accountId: account.id } }),
    staleTime: 10 * 60_000,
    enabled: temSf,
  });
  useEffect(() => {
    if ((syncQ.data?.transferidos ?? 0) > 0) {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      queryClient.invalidateQueries({ queryKey: ["sf-accounts"] });
    }
  }, [syncQ.data, queryClient]);

  // Histórico (propostas e pedidos) vem do banco do Grupo 2P — não do Salesforce.
  const dossieQ = useQuery({
    queryKey: ["dossie-cliente", instancia, account.id, account.cnpj],
    queryFn: () =>
      fetchDossie({ data: { instancia, sfAccountId: account.id || null, doc: account.cnpj || null } }),
    staleTime: 2 * 60_000,
  });

  // Casos, visitas, treinamentos e crédito seguem no Salesforce (não há espelho
  // desses objetos no banco do Grupo 2P).
  const q360 = useQuery({
    queryKey: ["sf-account-360", account.id],
    queryFn: () => fetch360({ data: { accountId: account.id } }),
    staleTime: 5 * 60_000,
    enabled: temSf,
  });

  const history = dossieQ.data?.historico;
  const d = useMemo(
    () => ({
      opportunities: dossieQ.data?.negocios ?? [],
      cases: q360.data?.cases ?? [],
      visitas: q360.data?.visitas ?? [],
      treinamentos: q360.data?.treinamentos ?? [],
      creditos: q360.data?.creditos ?? [],
    }),
    [dossieQ.data, q360.data],
  );

  return (
    <div className="space-y-4">
      <Banner account={account} history={history} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        <div className="min-w-0 space-y-4">
          {/* Abas */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium transition-colors border",
                  tab === t.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-surface-2 text-muted-foreground hover:bg-surface border-transparent",
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
                <TabCount tabKey={t.key} data={d} />
              </button>
            ))}
          </div>

          {tab === "visao" && (
            <div className="space-y-4">
              {temSf && <AtlasPanelTab account={account} />}
              <VisaoGeral account={account} history={history} data={d} loading={dossieQ.isLoading} />
            </div>
          )}
          {tab === "negocios" && <NegociosPanel data={d} loading={dossieQ.isLoading} />}
          {tab === "casos" && <CasosPanel data={d} loading={q360.isLoading} />}
          {tab === "campo" && <CampoPanel data={d} loading={q360.isLoading} />}
          {tab === "financeiro" && <FinanceiroPanel data={d} history={history} loading={dossieQ.isLoading} />}
        </div>

        <div className="space-y-4 xl:sticky xl:top-4">
          {temSf && <ActivityRail accountId={account.id} />}
          {temSf && <ContactsRail accountId={account.id} />}
        </div>
      </div>
    </div>
  );
}

function TabCount({ tabKey, data }: { tabKey: TabKey; data: any }) {
  if (!data) return null;
  const n =
    tabKey === "negocios"
      ? data.opportunities.length
      : tabKey === "casos"
        ? data.cases.length
        : tabKey === "campo"
          ? data.visitas.length + data.treinamentos.length
          : tabKey === "financeiro"
            ? data.creditos.length
            : null;
  if (n == null) return null;
  return <span className="ml-0.5 opacity-70 tabular-nums">{n}</span>;
}

/* ------------------------------------------------------------------ Banner */

function Banner({
  account,
  history,
}: {
  account: SalesforceAccount;
  history: any;
}) {
  const [open, setOpen] = useState(false);
  const initials = account.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const site = account.website
    ? account.website.startsWith("http")
      ? account.website
      : `https://${account.website}`
    : null;

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-primary via-primary/40 to-transparent" />
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="h-14 w-14 shrink-0 rounded-2xl bg-primary/15 text-primary grid place-items-center font-bold text-lg">
              {initials || <Building2 className="h-6 w-6" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold truncate">{account.name}</h2>
              <div className="text-xs text-muted-foreground truncate">
                {account.nomeFantasia || account.industry || "—"}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                {account.cnpj && (
                  <span className="inline-flex items-center gap-1">
                    <Hash className="h-3 w-3" /> {account.cnpj}
                  </span>
                )}
                {account.nSap && (
                  <span className="inline-flex items-center gap-1">
                    SAP {account.nSap}
                  </span>
                )}
                {account.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {account.phone}
                  </span>
                )}
                {account.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {account.email}
                  </span>
                )}
                {site && (
                  <a
                    href={site}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-primary"
                  >
                    <Globe className="h-3 w-3" /> site
                  </a>
                )}
                {account.instagram && (
                  <span className="inline-flex items-center gap-1">
                    <Instagram className="h-3 w-3" /> {account.instagram}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Segmentação — canto superior direito */}
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Segmentação
              </div>
              <div className="text-[11px] text-muted-foreground">
                {account.ownerName ?? "sem responsável"}
              </div>
            </div>
            <div
              className={cn(
                "h-12 w-12 rounded-2xl grid place-items-center text-lg font-bold",
                account.segment === "A"
                  ? "bg-success/20 text-success"
                  : account.segment === "B"
                    ? "bg-primary/20 text-primary"
                    : account.segment === "C"
                      ? "bg-amber-400/20 text-amber-500"
                      : account.segment
                        ? "bg-muted text-muted-foreground"
                        : "bg-surface-2 text-muted-foreground",
              )}
            >
              {account.segment ?? "—"}
            </div>
          </div>
        </div>

        {/* Indicadores comerciais direto no banner */}
        <BannerStats account={account} history={history} />

        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          {open ? "Recolher dados cadastrais" : "Expandir dados cadastrais"}
        </button>


        {open && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 border-t border-border pt-3">
            <Field label="Tipo de cliente" value={account.tipoCliente} />
            <Field label="Carteira" value={account.carteira} />
            <Field label="Status da conta" value={account.statusConta} />
            <Field label="Organização" value={account.organizacao} />
            <Field label="Condição de pagamento" value={account.condicaoPagamento} />
            <Field label="Tabela de preços" value={account.tabelaPrecos} />
            <Field label="Regime tributário" value={account.regimeTributario} />
            <Field label="Contribuinte ICMS" value={account.contribuinte} />
            <Field label="Inscrição estadual" value={account.inscricaoEstadual} />
            <Field label="Região de atuação" value={account.regiao} />
            <Field label="Finalidade de uso" value={account.finalidadeUso} />
            <Field label="Porte" value={account.porte} />
            <Field label="Origem" value={account.origem} />
            <Field label="ICP" value={account.icp != null ? String(account.icp) : null} />
            <Field label="Primeira compra" value={account.primeiraCompra ? date(account.primeiraCompra) : null} />
            <Field label="Cliente desde" value={date(account.createdAt)} />
            <Field label="Plano fidelidade" value={account.planoFidelidade} />
            <Field
              label="Pontuação fidelidade"
              value={account.pontuacaoFidelidade != null ? String(account.pontuacaoFidelidade) : null}
            />
            <Field label="Segmentação tubos" value={account.tubos.join(", ") || null} />
            <Field label="Setor" value={account.industry} />
            {account.observacoes && (
              <div className="col-span-2 md:col-span-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Observações do cadastro
                </div>
                <p className="text-xs mt-0.5 whitespace-pre-wrap">{account.observacoes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Indicadores comerciais (faturamento, variação, vendido) direto no banner. */
function BannerStats({ account, history }: { account: SalesforceAccount; history: any }) {
  const trend = useMemo(() => {
    const qs = history?.quarters ?? [];
    const now = qs[qs.length - 1]?.total ?? 0;
    const prev = qs[qs.length - 2]?.total ?? 0;
    if (!prev) return { pct: null as number | null, up: now > 0 };
    return { pct: ((now - prev) / prev) * 100, up: now >= prev };
  }, [history]);

  return (
    <div className="mt-4 border-t border-border pt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
      <MiniStat label="Faturamento 24m" value={fmt(history?.totalLifetime ?? null)} />
      <div className="rounded-xl bg-surface-2/50 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Variação tri.</div>
        <div className="flex items-center gap-1.5">
          {trend.up ? (
            <TrendingUp className="h-4 w-4 text-success" />
          ) : (
            <TrendingDown className="h-4 w-4 text-destructive" />
          )}
          <span className="text-base font-bold tabular-nums">
            {trend.pct == null ? "—" : `${trend.pct >= 0 ? "+" : ""}${trend.pct.toFixed(1)}%`}
          </span>
        </div>
      </div>
      <MiniStat
        label="Vendido tri. atual"
        value={fmt(history?.quarters?.at(-1)?.total ?? account.quarterSold ?? 0)}
      />
      <MiniStat
        label="Vendido tri. anterior"
        value={fmt(history?.quarters?.at(-2)?.total ?? account.quarterProjection ?? 0)}
      />
      <MiniStat label="Em aberto" value={`${history?.openCount ?? 0} · ${fmt(history?.openValue ?? 0)}`} />
      <MiniStat
        label="Taxa de ganho"
        value={history?.wonRate != null ? `${Math.round(history.wonRate * 100)}%` : "—"}
      />
      <MiniStat label="Ticket médio" value={fmt(history?.avgTicket ?? null)} />
      <MiniStat label="Última compra" value={date(history?.lastPurchase)} />
    </div>
  );
}


function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
      <div className="text-base font-bold tabular-nums truncate">{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
      <div className="text-xs font-medium truncate">{value || "—"}</div>
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  right,
  children,
}: {
  title: string;
  icon: typeof Users;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="glass rounded-xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">{title}</h3>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </div>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <div className="text-sm text-muted-foreground text-center py-8">{children}</div>
);

/* ------------------------------------------------------------- Visão geral */

function VisaoGeral({
  account,
  history,
  data,
  loading,
}: {
  account: SalesforceAccount;
  history: any;
  data: any;
  loading: boolean;
}) {
  void history;
  return (
    <div className="space-y-4">




      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Funil do cliente" icon={Briefcase}>
          {(history?.stages ?? []).length === 0 ? (
            <Empty>Sem oportunidades no período.</Empty>
          ) : (
            <ul className="space-y-2">
              {history.stages.map((s: any) => (
                <li key={s.stage} className="flex items-center gap-2 text-sm">
                  <span className="truncate flex-1">{s.stage}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{s.count}</span>
                  <span className="tabular-nums text-xs font-medium">{fmt(s.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Sinais rápidos" icon={ShieldCheck}>
          {loading ? (
            <Empty>Carregando…</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              <Signal
                label="Casos abertos"
                value={String((data?.cases ?? []).filter((c: any) => !c.closedDate).length)}
              />
              <Signal label="Visitas registradas" value={String((data?.visitas ?? []).length)} />
              <Signal label="Treinamentos" value={String((data?.treinamentos ?? []).length)} />
              <Signal
                label="Crédito aprovado"
                value={fmt(
                  Math.max(0, ...((data?.creditos ?? []).map((c: any) => c.creditoAprovado ?? 0) as number[]), 0),
                )}
              />
              <Signal label="Contatos-chave" value={account.tubos.length ? account.tubos.join(", ") : "—"} />
            </ul>
          )}
        </Card>
      </div>

    </div>
  );
}



function Signal({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums truncate">{value}</span>
    </li>
  );
}

/* ---------------------------------------------------------------- Contatos */

/** Bloco lateral compacto de contatos, com rolagem e paginação. */
function ContactsRail({ accountId }: { accountId: string }) {
  const fetchContacts = useServerFn(getSalesforceAccountContacts);
  const q = useQuery({
    queryKey: ["sf-account-contacts", accountId],
    queryFn: () => fetchContacts({ data: { accountId } }),
    staleTime: 5 * 60_000,
  });
  const contacts: SalesforceContact[] = q.data?.records ?? [];
  const PAGE = 5;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(contacts.length / PAGE));
  const pageSafe = Math.min(page, totalPages);
  const rows = contacts.slice((pageSafe - 1) * PAGE, pageSafe * PAGE);

  return (
    <aside className="glass rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Contatos</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">{contacts.length}</span>
      </div>

      {q.isLoading ? (
        <div className="text-xs text-muted-foreground py-3">Carregando contatos…</div>
      ) : contacts.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3">Nenhum contato cadastrado.</div>
      ) : (
        <>
          <ul className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {rows.map((c) => (
              <li key={c.id} className="rounded-lg border border-border bg-background/40 p-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-primary/15 text-primary grid place-items-center text-[11px] font-semibold">
                    {c.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{c.title ?? "—"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  {(c.mobile || c.phone) && (
                    <a
                      href={`tel:${(c.mobile || c.phone)!.replace(/\s/g, "")}`}
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary truncate"
                    >
                      <Smartphone className="h-3 w-3" /> {c.mobile || c.phone}
                    </a>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary truncate"
                    >
                      <Mail className="h-3 w-3" /> e-mail
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {totalPages > 1 && <Pager page={pageSafe} total={totalPages} onChange={setPage} />}
        </>
      )}
    </aside>
  );
}

/** Paginação compacta usada nos blocos laterais. */
function Pager({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-border">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="px-2 py-1 rounded-md bg-surface-2 hover:bg-surface disabled:opacity-40 text-[11px] font-medium"
      >
        ←
      </button>
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {page} / {total}
      </span>
      <button
        onClick={() => onChange(Math.min(total, page + 1))}
        disabled={page === total}
        className="px-2 py-1 rounded-md bg-surface-2 hover:bg-surface disabled:opacity-40 text-[11px] font-medium"
      >
        →
      </button>
    </div>
  );
}

/* ------------------------------------------------------- Propostas/pedidos */

function NegociosPanel({ data, loading }: { data: any; loading: boolean }) {
  const opps = (data?.opportunities ?? []) as any[];
  const abertas = opps.filter((o) => !o.isClosed);
  const ganhas = opps.filter((o) => o.isWon);
  const perdidas = opps.filter((o) => o.isClosed && !o.isWon);
  const sum = (arr: any[]) => arr.reduce((s, o) => s + (o.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label={`Em aberto (${abertas.length})`} value={fmt(sum(abertas))} />
        <MiniStat label={`Fechadas (${ganhas.length})`} value={fmt(sum(ganhas))} />
        <MiniStat label={`Perdidas (${perdidas.length})`} value={fmt(sum(perdidas))} />
      </div>
      <Card title="Propostas & pedidos" icon={Briefcase}>
        {loading ? (
          <Empty>Carregando negócios…</Empty>
        ) : opps.length === 0 ? (
          <Empty>Nenhuma oportunidade nos últimos 3 anos.</Empty>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-2 font-medium">Negócio</th>
                  <th className="text-left px-2 py-2 font-medium">Etapa</th>
                  <th className="text-right px-2 py-2 font-medium">Valor</th>
                  <th className="text-left px-2 py-2 font-medium">Data</th>
                  <th className="text-left px-2 py-2 font-medium">Responsável</th>
                </tr>
              </thead>
              <tbody>
                {opps.map((o) => (
                  <tr key={o.id} className="border-t border-border">
                    <td className="px-2 py-2 max-w-[260px] truncate font-medium">{o.name}</td>
                    <td className="px-2 py-2">
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded",
                          o.isWon
                            ? "bg-success/15 text-success"
                            : o.isClosed
                              ? "bg-destructive/15 text-destructive"
                              : "bg-primary/15 text-primary",
                        )}
                      >
                        {o.stage ?? "—"}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt(o.amount)}</td>
                    <td className="px-2 py-2 text-muted-foreground tabular-nums">{date(o.closeDate)}</td>
                    <td className="px-2 py-2 text-muted-foreground truncate max-w-[160px]">
                      {o.owner ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------- Casos */

function CasosPanel({ data, loading }: { data: any; loading: boolean }) {
  const cases = (data?.cases ?? []) as any[];
  return (
    <Card title="Casos" icon={LifeBuoy}>
      {loading ? (
        <Empty>Carregando casos…</Empty>
      ) : cases.length === 0 ? (
        <Empty>Nenhum caso registrado para este cliente.</Empty>
      ) : (
        <ul className="space-y-2">
          {cases.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-background/40 p-3">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <div className="text-sm font-medium truncate">
                  {c.number ? `#${c.number} · ` : ""}
                  {c.subject}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {date(c.createdDate)}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded",
                    c.closedDate ? "bg-success/15 text-success" : "bg-primary/15 text-primary",
                  )}
                >
                  {c.status ?? (c.closedDate ? "Fechado" : "Aberto")}
                </span>
                {c.priority && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-muted-foreground">
                    {c.priority}
                  </span>
                )}
                {c.type && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-muted-foreground">
                    {c.type}
                  </span>
                )}
                {c.owner && <span className="text-[10px] text-muted-foreground">· {c.owner}</span>}
              </div>
              {c.description && (
                <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap line-clamp-4">
                  {c.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------ Visitas e treinamentos */

function CampoPanel({ data, loading }: { data: any; loading: boolean }) {
  const visitas = (data?.visitas ?? []) as any[];
  const treinos = (data?.treinamentos ?? []) as any[];
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Visitas" icon={MapPin} right={<span className="text-[11px] text-muted-foreground">{visitas.length}</span>}>
        {loading ? (
          <Empty>Carregando…</Empty>
        ) : visitas.length === 0 ? (
          <Empty>Nenhuma visita registrada.</Empty>
        ) : (
          <ul className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {visitas.map((v) => (
              <li key={v.id} className="rounded-lg border border-border bg-background/40 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm font-medium truncate">
                    {v.motivo || v.numero || "Visita"}
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">{date(v.date)}</div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {v.status && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                      {v.status}
                    </span>
                  )}
                  {v.cidade && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-muted-foreground">
                      {v.cidade}
                    </span>
                  )}
                  {v.contato && <span className="text-[10px] text-muted-foreground">· {v.contato}</span>}
                  {v.owner && <span className="text-[10px] text-muted-foreground">· {v.owner}</span>}
                </div>
                {(v.descricao || v.planoAcao) && (
                  <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap line-clamp-4">
                    {[v.descricao, v.planoAcao].filter(Boolean).join("\n\nPlano de ação: ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Treinamentos"
        icon={GraduationCap}
        right={<span className="text-[11px] text-muted-foreground">{treinos.length}</span>}
      >
        {loading ? (
          <Empty>Carregando…</Empty>
        ) : treinos.length === 0 ? (
          <Empty>Nenhum treinamento registrado.</Empty>
        ) : (
          <ul className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {treinos.map((t) => (
              <li key={t.id} className="rounded-lg border border-border bg-background/40 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm font-medium truncate">{t.tipo || t.nome || "Treinamento"}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">{date(t.date)}</div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {t.contato && <span className="text-[10px] text-muted-foreground">· {t.contato}</span>}
                  {t.owner && <span className="text-[10px] text-muted-foreground">· {t.owner}</span>}
                </div>
                {t.observacoes && (
                  <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap line-clamp-4">
                    {t.observacoes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------- Financeiro */

function FinanceiroPanel({
  data,
  history,
  loading,
}: {
  data: any;
  history: any;
  loading: boolean;
}) {
  const creditos = (data?.creditos ?? []) as any[];
  const aprovado = Math.max(0, ...creditos.map((c) => c.creditoAprovado ?? 0), 0);
  const emAberto = (data?.opportunities ?? []).filter((o: any) => !o.isClosed);
  const totalAberto = emAberto.reduce((s: number, o: any) => s + (o.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat label="Crédito aprovado" value={fmt(aprovado)} />
        <MiniStat label="Pedidos em aberto" value={fmt(totalAberto)} />
        <MiniStat label="Faturamento 24m" value={fmt(history?.totalLifetime ?? null)} />
        <MiniStat label="Análises de crédito" value={String(creditos.length)} />
      </div>

      <Card title="Análises de crédito" icon={Wallet}>
        {loading ? (
          <Empty>Carregando…</Empty>
        ) : creditos.length === 0 ? (
          <Empty>Nenhuma análise de crédito para este cliente.</Empty>
        ) : (
          <ul className="space-y-2">
            {creditos.map((c) => (
              <li key={c.id} className="rounded-lg border border-border bg-background/40 p-3">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <div className="text-sm font-medium truncate">{c.nome ?? "Análise"}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {date(c.solicitadoEm)} {c.concluidoEm ? `→ ${date(c.concluidoEm)}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {c.status && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                      {c.status}
                    </span>
                  )}
                  {c.conclusao && (
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded",
                        /aprov/i.test(c.conclusao)
                          ? "bg-success/15 text-success"
                          : "bg-destructive/15 text-destructive",
                      )}
                    >
                      {c.conclusao}
                    </span>
                  )}
                  {c.restricao && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-500">
                      Restrição: {c.restricao}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 mt-2">
                  <Field label="Solicitado" value={c.creditoSolicitado != null ? fmt(c.creditoSolicitado) : null} />
                  <Field label="Aprovado" value={c.creditoAprovado != null ? fmt(c.creditoAprovado) : null} />
                  <Field label="Cond. solicitada" value={c.condicaoSolicitada} />
                  <Field label="Cond. aprovada" value={c.condicaoAprovada} />
                  <Field label="Serasa" value={c.serasa != null ? String(c.serasa) : null} />
                  <Field label="Prioridade" value={c.prioridade} />
                </div>
                {(c.observacoesFinanceiro || c.observacoesVendedor) && (
                  <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">
                    {[c.observacoesVendedor, c.observacoesFinanceiro].filter(Boolean).join("\n")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Pedidos em aberto" icon={Clock}>
        {emAberto.length === 0 ? (
          <Empty>Nada em aberto no momento.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {emAberto.map((o: any) => (
              <li key={o.id} className="flex items-center gap-2 text-sm">
                <span className="truncate flex-1">{o.name}</span>
                <span className="text-[11px] text-muted-foreground">{o.stage}</span>
                <span className="tabular-nums font-medium">{fmt(o.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------- Atlas tab */

function AtlasPanelTab({ account }: { account: SalesforceAccount }) {
  const fetchNotes = useServerFn(getClientNotes);
  const save = useServerFn(saveClientNotes);

  const q = useQuery({
    queryKey: ["client-notes", account.id],
    queryFn: () => fetchNotes({ data: { accountId: account.id, instancia: "solar" } }),
    staleTime: 60_000,
  });

  const [notes, setNotes] = useState("");
  const [cards, setCards] = useState<ClientNoteCard[]>([]);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!q.data) return;
    setNotes(q.data.notes);
    setCards(q.data.canvas);
    setSavedAt(q.data.updatedAt);
    setDirty(false);
  }, [q.data]);

  const mutation = useMutation({
    mutationFn: (payload: { notes: string; canvas: ClientNoteCard[] }) =>
      save({
        data: {
          accountId: account.id,
          accountName: account.name,
          instancia: "solar",
          notes: payload.notes,
          canvas: payload.canvas,
        },
      }),
    onSuccess: (r: any) => {
      setSavedAt(r?.updatedAt ?? new Date().toISOString());
      setDirty(false);
    },
  });

  // Autosave com debounce
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => mutation.mutate({ notes, canvas: cards }), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, cards, dirty]);

  const touch = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };

  return (
    <Card
      title="Atlas do cliente"
      icon={Sparkles}
      right={
        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
          <Save className="h-3 w-3" />
          {mutation.isPending
            ? "Salvando…"
            : dirty
              ? "Alterações não salvas"
              : savedAt
                ? `Salvo ${new Date(savedAt).toLocaleString("pt-BR")}`
                : "Sem anotações ainda"}
        </span>
      }
    >
      <div className="space-y-3">
        {q.isError && (
          <div className="text-xs text-destructive">Não foi possível carregar as anotações.</div>
        )}
        <AtlasBoard cards={cards} onChange={touch(setCards)} />
      </div>
    </Card>
  );
}

/* -------------------------------------------------- Trilha de atividades */

function ActivityRail({ accountId }: { accountId: string }) {
  const fetchActivities = useServerFn(getSalesforceAccountActivities);
  const q = useQuery({
    queryKey: ["sf-account-activities", accountId],
    queryFn: () => fetchActivities({ data: { accountId } }),
    staleTime: 2 * 60_000,
  });
  const activities: SalesforceActivity[] = q.data?.records ?? [];
  const hoje = new Date().toISOString().slice(0, 10);

  const abertas = useMemo(
    () =>
      activities.filter(
        (a) => (a.kind === "task" && a.status !== "Completed") || (a.date ?? "") >= hoje,
      ),
    [activities, hoje],
  );
  const ultimas = useMemo(
    () =>
      activities
        .filter((a) => !abertas.includes(a))
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    [activities, abertas],
  );

  const [view, setView] = useState<"abertas" | "ultimas">("abertas");
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [view]);

  const lista = view === "abertas" ? abertas : ultimas;
  const PAGE = 5;
  const totalPages = Math.max(1, Math.ceil(lista.length / PAGE));
  const pageSafe = Math.min(page, totalPages);
  const rows = lista.slice((pageSafe - 1) * PAGE, pageSafe * PAGE);

  return (
    <aside className="glass rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Atividades</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">{activities.length}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <ActivityComposer accountId={accountId} mode="task" />
        <ActivityComposer accountId={accountId} mode="call" />
      </div>

      <div className="flex items-center gap-1 mb-2">
        {(
          [
            ["abertas", `Em aberto (${abertas.length})`],
            ["ultimas", `Últimas (${ultimas.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={cn(
              "flex-1 text-[11px] px-2 py-1.5 rounded-md font-medium transition-colors",
              view === key
                ? "bg-primary text-primary-foreground"
                : "bg-surface-2 text-muted-foreground hover:bg-surface",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="text-xs text-muted-foreground py-3">Carregando…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3">
          {view === "abertas" ? "Nada pendente." : "Sem atividades anteriores."}
        </div>
      ) : (
        <ul className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {rows.map((a) => (
            <ActivityItem key={a.id} a={a} />
          ))}
        </ul>
      )}

      {totalPages > 1 && <Pager page={pageSafe} total={totalPages} onChange={setPage} />}
    </aside>
  );
}

function ActivityItem({ a }: { a: SalesforceActivity }) {
  const [open, setOpen] = useState(false);
  const done = a.kind === "task" && a.status === "Completed";
  const Icon = a.kind === "event" ? CalendarClock : done ? CheckCircle2 : Circle;
  return (
    <li className="rounded-lg border border-border bg-background/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left p-2.5 flex items-start gap-2 hover:bg-surface-2/40 rounded-lg"
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5 mt-0.5 shrink-0",
            done ? "text-success" : a.kind === "event" ? "text-primary" : "text-muted-foreground",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium truncate">{a.subject}</div>
          <div className="text-[10px] text-muted-foreground truncate">
            {date(a.date)}
            {a.owner ? ` · ${a.owner}` : ""}
            {a.status ? ` · ${a.status}` : ""}
          </div>
        </div>
      </button>
      {open && a.description && (
        <p className="px-2.5 pb-2.5 -mt-1 text-[11px] text-muted-foreground whitespace-pre-wrap">
          {a.description}
        </p>
      )}
    </li>
  );
}

/* ------------------------------------------- Nova tarefa / nova interação */

const TIPOS_INTERACAO = ["Ligação", "WhatsApp", "E-mail", "Reunião", "Visita"];

/** Botão + modal para criar uma tarefa ou registrar uma interação (Log a Call). */
function ActivityComposer({
  accountId,
  mode,
}: {
  accountId: string;
  mode: "task" | "call";
}) {
  const isCall = mode === "call";
  const queryClient = useQueryClient();
  const criarTarefa = useServerFn(createSalesforceTask);
  const registrarInteracao = useServerFn(logSalesforceInteraction);

  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [activityDate, setActivityDate] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [tipoInteracao, setTipoInteracao] = useState(TIPOS_INTERACAO[0]);
  const [conseguiuFalar, setConseguiuFalar] = useState<"Sim" | "Não">("Sim");
  const [whoId, setWhoId] = useState("");

  const fetchContacts = useServerFn(getSalesforceAccountContacts);
  const contactsQ = useQuery({
    queryKey: ["sf-account-contacts", accountId],
    queryFn: () => fetchContacts({ data: { accountId } }),
    staleTime: 5 * 60_000,
    enabled: open,
  });
  const contacts: SalesforceContact[] = contactsQ.data?.records ?? [];

  const reset = () => {
    setSubject("");
    setActivityDate("");
    setDescription("");
    setPriority("Normal");
    setTipoInteracao(TIPOS_INTERACAO[0]);
    setConseguiuFalar("Sim");
    setWhoId("");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        subject: subject.trim(),
        description: description.trim() || null,
        whatId: accountId,
        whoId: whoId || null,
        ...(isCall
          ? { tipoInteracao, conseguiuFalar }
          : { activityDate: activityDate || null, priority }),
      };
      return isCall
        ? registrarInteracao({ data: payload })
        : criarTarefa({ data: payload });
    },
    onSuccess: () => {
      toast.success(isCall ? "Interação registrada." : "Tarefa criada.");
      queryClient.invalidateQueries({ queryKey: ["sf-account-activities", accountId] });
      setOpen(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível salvar."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors",
            isCall
              ? "bg-surface-2 text-foreground hover:bg-surface"
              : "bg-primary text-primary-foreground hover:opacity-90",
          )}
        >
          {isCall ? <PhoneCall className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {isCall ? "Nova interação" : "Nova tarefa"}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {isCall ? <PhoneCall className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-primary" />}
            {isCall ? "Registrar interação" : "Nova tarefa"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Assunto</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={isCall ? "Ex.: Follow-up sobre proposta" : "Ex.: Enviar cotação atualizada"}
              className="mt-1 w-full rounded-lg bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            {isCall ? (
              <>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Tipo</span>
                  <select
                    value={tipoInteracao}
                    onChange={(e) => setTipoInteracao(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                  >
                    {TIPOS_INTERACAO.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Falou com o cliente?
                  </span>
                  <select
                    value={conseguiuFalar}
                    onChange={(e) => setConseguiuFalar(e.target.value as "Sim" | "Não")}
                    className="mt-1 w-full rounded-lg bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                  >
                    <option value="Sim">Sim</option>
                    <option value="Não">Não</option>
                  </select>
                </label>
              </>
            ) : (
              <>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Vencimento</span>
                  <input
                    type="date"
                    value={activityDate}
                    onChange={(e) => setActivityDate(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Prioridade</span>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                  >
                    <option value="High">Alta</option>
                    <option value="Normal">Normal</option>
                    <option value="Low">Baixa</option>
                  </select>
                </label>
              </>
            )}
          </div>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Contato (opcional)</span>
            <select
              value={whoId}
              onChange={(e) => setWhoId(e.target.value)}
              className="mt-1 w-full rounded-lg bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
            >
              <option value="">— sem contato —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {isCall ? "Resumo da conversa" : "Descrição"}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full min-h-[110px] rounded-lg bg-background border border-border px-3 py-2 text-sm resize-y focus:outline-none focus:border-primary/50"
            />
          </label>
        </div>

        <DialogFooter>
          <button
            onClick={() => setOpen(false)}
            className="px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface text-sm font-medium"
          >
            Cancelar
          </button>
          <button
            disabled={!subject.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40"
          >
            {mutation.isPending ? "Salvando…" : isCall ? "Registrar interação" : "Criar tarefa"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
