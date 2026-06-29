import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { clients, type Client } from "@/lib/mock-data";
import { useGlobalSearch } from "@/lib/search-store";
import { useMemo, useState } from "react";
import { Pencil, Eye, X, Building2, Calendar, User, FileText, Save, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clientes/cadastros")({
  head: () => ({ meta: [{ title: "Cadastros — Portal 2P" }] }),
  component: CadastrosPage,
});

// Vendedores e CNPJs fixos derivados do id pra manter consistência (mock).
const SELLERS = ["Allan Tortoreli", "Carla Mendes", "Rafael Souza", "Beatriz Lima", "João Pedro"];

function deriveMeta(c: Client) {
  const seed = parseInt(c.id, 10) || 1;
  const cnpjBase = (10000000 + seed * 137).toString().padStart(8, "0");
  const cnpj = `${cnpjBase.slice(0, 2)}.${cnpjBase.slice(2, 5)}.${cnpjBase.slice(5, 8)}/0001-${(seed * 7 % 99).toString().padStart(2, "0")}`;
  const seller = SELLERS[seed % SELLERS.length];
  const d = new Date(2024, (seed * 3) % 12, ((seed * 11) % 27) + 1);
  const createdAt = d.toLocaleDateString("pt-BR");
  const email = `contato@${c.name.toLowerCase().split(" ")[0].replace(/[^a-z]/g, "")}.com.br`;
  return { cnpj, seller, createdAt, email };
}

type Row = Client & { cnpj: string; seller: string; createdAt: string; email: string };

function CadastrosPage() {
  const search = useGlobalSearch().trim().toLowerCase();
  const [editing, setEditing] = useState<Row | null>(null);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Partial<Row>>>({});

  const rows: Row[] = useMemo(
    () => clients.map((c) => ({ ...c, ...deriveMeta(c), ...(overrides[c.id] ?? {}) })),
    [overrides],
  );

  const filtered = rows.filter((r) =>
    !search ||
    r.name.toLowerCase().includes(search) ||
    r.cnpj.includes(search) ||
    r.seller.toLowerCase().includes(search),
  );

  const saveEdit = (id: string, patch: Partial<Row>) => {
    setOverrides((p) => ({ ...p, [id]: { ...(p[id] ?? {}), ...patch } }));
    setEditing(null);
  };

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Clientes</div>
            <h1 className="text-3xl font-bold mt-1">Cadastros</h1>
            <p className="text-sm text-muted-foreground mt-1">Lista geral de clientes com dados cadastrais.</p>
          </div>
          <button className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
            <Plus className="h-4 w-4" /> Novo cliente
          </button>
        </div>

        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-display font-semibold">Todos os clientes</h2>
            <span className="text-xs text-muted-foreground">{filtered.length} de {rows.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-2/50">
                  <th className="text-left px-4 py-2.5">Cliente</th>
                  <th className="text-left px-4 py-2.5">CNPJ</th>
                  <th className="text-left px-4 py-2.5">Vendedor</th>
                  <th className="text-left px-4 py-2.5">Criado em</th>
                  <th className="w-24 text-center px-4 py-2.5">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-surface-2/50">
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{r.cnpj}</td>
                    <td className="px-4 py-3">{r.seller}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{r.createdAt}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-center">
                        <button onClick={() => setViewing(r)} className="p-1.5 rounded hover:bg-primary/15 text-muted-foreground hover:text-primary" title="Detalhes">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button onClick={() => setEditing(r)} className="p-1.5 rounded hover:bg-primary/15 text-muted-foreground hover:text-primary" title="Editar">
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">Nenhum cliente encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {viewing && <DetailModal row={viewing} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); }} />}
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
            <button onClick={onClose} className="p-2 hover:bg-surface-2 rounded-lg"><X className="h-4 w-4" /></button>
          </div>
          <div className="p-6 space-y-3 text-sm">
            <Field icon={Building2} label="CNPJ" value={row.cnpj} />
            <Field icon={User} label="Vendedor responsável" value={row.seller} />
            <Field icon={Calendar} label="Data de criação" value={row.createdAt} />
            <Field icon={FileText} label="E-mail" value={row.email} />
            <Field icon={FileText} label="Segmento" value={`Classe ${row.segment}`} />
          </div>
          <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
            <button onClick={onClose} className="px-3.5 py-2 rounded-lg border border-border text-sm hover:bg-surface-2">Fechar</button>
            <button onClick={onEdit} className="px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 hover:opacity-90">
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
  const [cnpj, setCnpj] = useState(row.cnpj);
  const [seller, setSeller] = useState(row.seller);
  const [email, setEmail] = useState(row.email);
  return (
    <>
      <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <form
          onSubmit={(e) => { e.preventDefault(); onSave({ name, cnpj, seller, email }); }}
          className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-display font-bold text-lg">Editar cliente</h2>
            <button type="button" onClick={onClose} className="p-2 hover:bg-surface-2 rounded-lg"><X className="h-4 w-4" /></button>
          </div>
          <div className="p-6 space-y-4 text-sm">
            <Input label="Nome" value={name} onChange={setName} />
            <Input label="CNPJ" value={cnpj} onChange={setCnpj} />
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Vendedor</label>
              <select value={seller} onChange={(e) => setSeller(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:border-primary/50">
                {SELLERS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <Input label="E-mail" value={email} onChange={setEmail} />
          </div>
          <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-lg border border-border text-sm hover:bg-surface-2">Cancelar</button>
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
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:border-primary/50" />
    </div>
  );
}
