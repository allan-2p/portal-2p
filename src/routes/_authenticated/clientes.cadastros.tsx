import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Eye, X, Building2, Calendar, User, FileText, Save, Plus, Phone, Globe, Loader2, AlertTriangle, Search } from "lucide-react";

import { getSalesforceAccounts, type SalesforceAccount } from "@/lib/salesforce.functions";
import { VendedorFilter } from "@/components/vendedor-filter";

export const Route = createFileRoute("/_authenticated/clientes/cadastros")({
  head: () => ({ meta: [{ title: "Cadastros — Portal 2P" }] }),
  component: CadastrosPage,
});

type Row = SalesforceAccount & { createdAtFmt: string };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function CadastrosPage() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Partial<Row>>>({});
  const [segFilter, setSegFilter] = useState<"all" | "A" | "B" | "C" | "D" | "none">("all");
  const [ownerId, setOwnerId] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);


  const fetchAccounts = useServerFn(getSalesforceAccounts);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["salesforce", "accounts"],
    queryFn: () => fetchAccounts(),
    staleTime: 60_000,
  });

  const rows: Row[] = useMemo(() => {
    const base = data?.records ?? [];
    return base
      .map((a) => ({ ...a, createdAtFmt: fmtDate(a.createdAt), ...(overrides[a.id] ?? {}) }))
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
  }, [data, overrides]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (segFilter === "none" && r.segment !== null) return false;
      if (segFilter !== "all" && segFilter !== "none" && r.segment !== segFilter) return false;
      if (ownerId !== "all" && r.ownerId !== ownerId) return false;
      if (!s) return true;
      return (
        r.name.toLowerCase().includes(s) ||
        (r.cnpj ?? "").toLowerCase().includes(s) ||
        (r.ownerName ?? "").toLowerCase().includes(s)
      );
    });
  }, [rows, search, segFilter, ownerId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, segFilter, ownerId, pageSize]);


  const saveEdit = (id: string, patch: Partial<Row>) => {
    setOverrides((p) => ({ ...p, [id]: { ...(p[id] ?? {}), ...patch } }));
    setEditing(null);
  };

  const segments: { key: typeof segFilter; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "A", label: "A" },
    { key: "B", label: "B" },
    { key: "C", label: "C" },
    { key: "D", label: "D" },
    { key: "none", label: "Sem seg." },
  ];

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Clientes</div>
            <h1 className="text-3xl font-bold mt-1">Cadastros</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Contas sincronizadas do Salesforce (objeto <span className="font-mono text-foreground/80">Account</span>).
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente, CNPJ…"
                className="pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-sm w-64 focus:outline-none focus:border-primary/50"
              />
            </div>
            <VendedorFilter value={ownerId} onChange={setOwnerId} />
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="px-3.5 py-2 rounded-lg border border-border text-sm hover:bg-surface-2 disabled:opacity-60"
            >
              {isFetching ? "Atualizando…" : "Atualizar"}
            </button>
            <button className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
              <Plus className="h-4 w-4" /> Novo cliente
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground mr-2">Segmentação:</span>
          {segments.map((s) => (
            <button
              key={s.key}
              onClick={() => setSegFilter(s.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                segFilter === s.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-surface border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-display font-semibold">Todos os clientes</h2>
            <span className="text-xs text-muted-foreground">
              {filtered.length} de {rows.length}
            </span>
          </div>

          {error && (
            <div className="px-5 py-4 flex items-start gap-2 text-sm text-destructive border-b border-border">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <div>
                <div className="font-medium">Não foi possível carregar as contas do Salesforce.</div>
                <div className="text-muted-foreground text-xs mt-0.5">{error instanceof Error ? error.message : String(error)}</div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
                  <th className="text-left px-4 py-2.5">Cliente</th>
                  <th className="text-left px-4 py-2.5">CNPJ</th>
                  <th className="text-center px-4 py-2.5 w-16">Seg</th>
                  <th className="text-left px-4 py-2.5">Vendedor</th>
                  <th className="text-left px-4 py-2.5">Criado em</th>
                  <th className="w-24 text-center px-4 py-2.5">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground text-sm">
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2 align-middle" />
                      Carregando contas do Salesforce…
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  pageRows.map((r) => (
                    <tr key={r.id} className="border-b border-border/40 hover:bg-surface-2/50">
                      <td className="px-4 py-3 font-medium">{r.name}</td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{r.cnpj ?? "—"}</td>
                      <td className="px-4 py-3 text-center">
                        {r.segment ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded font-display font-bold text-xs bg-primary/15 text-primary">
                            {r.segment}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{r.ownerName ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{r.createdAtFmt}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-center">
                          <button
                            onClick={() => setViewing(r)}
                            className="p-1.5 rounded hover:bg-primary/15 text-muted-foreground hover:text-primary"
                            title="Detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setEditing(r)}
                            className="p-1.5 rounded hover:bg-primary/15 text-muted-foreground hover:text-primary"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && filtered.length > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-t border-border">
              <div className="text-xs text-muted-foreground">
                Exibindo {(pageSafe - 1) * pageSize + 1}–{Math.min(pageSafe * pageSize, filtered.length)} de {filtered.length} · mais recentes primeiro
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2 py-1.5 rounded-md bg-surface border border-border text-xs"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n} por página
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pageSafe === 1}
                  className="px-3 py-1.5 rounded-md bg-surface-2 hover:bg-surface disabled:opacity-40 text-xs font-medium"
                >
                  ← Anterior
                </button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {pageSafe} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={pageSafe === totalPages}
                  className="px-3 py-1.5 rounded-md bg-surface-2 hover:bg-surface disabled:opacity-40 text-xs font-medium"
                >
                  Próxima →
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {viewing && (
        <DetailModal
          row={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
        />
      )}
      {editing && <EditModal row={editing} onClose={() => setEditing(null)} onSave={(patch) => saveEdit(editing.id, patch)} />}
    </AppLayout>
  );
}

function DetailModal({ row, onClose, onEdit }: { row: Row; onClose: () => void; onEdit: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Cadastro</div>
              <h2 className="font-display font-bold text-lg">{row.name}</h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-surface-2 rounded-lg">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-6 space-y-3 text-sm max-h-[70vh] overflow-y-auto">
            <Field icon={Building2} label="CNPJ" value={row.cnpj ?? "—"} />
            <Field icon={User} label="Vendedor responsável" value={row.ownerName ?? "—"} />
            <Field icon={Calendar} label="Data de criação" value={fmtDate(row.createdAt)} />
            <Field icon={Phone} label="Telefone" value={row.phone ?? "—"} />
            <Field icon={Globe} label="Website" value={row.website ?? "—"} />
            <Field icon={FileText} label="Indústria" value={row.industry ?? "—"} />
            <Field icon={FileText} label="Segmentação Solar" value={row.segment ?? "—"} />
            {row.tubos.length > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-2/50">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Segmentação Tubos</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {row.tubos.map((t) => (
                      <span key={t} className="text-[11px] px-2 py-0.5 rounded bg-primary/15 text-primary">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
            <button onClick={onClose} className="px-3.5 py-2 rounded-lg border border-border text-sm hover:bg-surface-2">
              Fechar
            </button>
            <button
              onClick={onEdit}
              className="px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 hover:opacity-90"
            >
              <Pencil className="h-3.5 w-3.5" /> Editar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-2/50">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

function EditModal({ row, onClose, onSave }: { row: Row; onClose: () => void; onSave: (patch: Partial<Row>) => void }) {
  const [name, setName] = useState(row.name);
  const [cnpj, setCnpj] = useState(row.cnpj ?? "");
  const [phone, setPhone] = useState(row.phone ?? "");
  const [website, setWebsite] = useState(row.website ?? "");
  return (
    <>
      <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ name, cnpj: cnpj || null, phone: phone || null, website: website || null });
          }}
          className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="font-display font-bold text-lg">Editar cliente</h2>
              <div className="text-[11px] text-muted-foreground">Alterações locais (não são gravadas no Salesforce)</div>
            </div>
            <button type="button" onClick={onClose} className="p-2 hover:bg-surface-2 rounded-lg">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-6 space-y-4 text-sm">
            <Input label="Nome" value={name} onChange={setName} />
            <Input label="CNPJ" value={cnpj} onChange={setCnpj} />
            <Input label="Telefone" value={phone} onChange={setPhone} />
            <Input label="Website" value={website} onChange={setWebsite} />
          </div>
          <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-lg border border-border text-sm hover:bg-surface-2">
              Cancelar
            </button>
            <button type="submit" className="px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 hover:opacity-90">
              <Save className="h-3.5 w-3.5" /> Salvar
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:border-primary/50"
      />
    </div>
  );
}
