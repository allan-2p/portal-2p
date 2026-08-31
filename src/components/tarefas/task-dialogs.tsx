/**
 * Diálogos compartilhados de tarefas do Salesforce.
 * Usados na home (agenda) e na página de Tarefas, para que as duas telas
 * tenham exatamente o mesmo comportamento de registrar interação, concluir,
 * adiar e criar tarefa.
 */
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarPlus,
  Check,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSellerScope } from "@/hooks/use-seller-scope";
import {
  completeSalesforceTask,
  createSalesforceTask,
  getSalesforceAccounts,
  logSalesforceInteraction,
  rescheduleSalesforceTask,
  type SalesforceTask,
} from "@/lib/salesforce.functions";

export type TaskInteractionState = {
  contacted: "yes" | "no";
  type?: string;
  note?: string;
  ts: number;
};

const TASK_INTERACTIONS_KEY = "portal2p:task-interactions:v1";

export function loadTaskInteractions(): Record<string, TaskInteractionState> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(TASK_INTERACTIONS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function persistTaskInteractions(map: Record<string, TaskInteractionState>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TASK_INTERACTIONS_KEY, JSON.stringify(map));
  } catch {
    /* storage indisponível */
  }
}

export const TASK_TYPES = ["Ligação", "E-mail", "Reunião", "Visita", "Follow-up", "Outro"] as const;
export const PRIORITIES = ["Alta", "Normal", "Baixa"] as const;
export const INTERACTION_TYPES = [
  "Ligação",
  "Mensagem",
  "E-mail",
  "Reunião",
  "Visita",
  "Outro",
] as const;

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ContactedToggle({
  value,
  onChange,
}: {
  value: "yes" | "no" | null;
  onChange: (v: "yes" | "no") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => onChange("yes")}
        className={cn(
          "px-3 py-2 rounded-lg border-2 text-sm font-medium flex items-center justify-center gap-2 transition-all",
          value === "yes"
            ? "border-success bg-success/25 text-success ring-2 ring-success/40 shadow-sm"
            : "border-success/40 bg-success/10 text-success/80 hover:bg-success/15",
        )}
      >
        <Check className="h-3.5 w-3.5" /> Falei com o cliente
      </button>
      <button
        type="button"
        onClick={() => onChange("no")}
        className={cn(
          "px-3 py-2 rounded-lg border-2 text-sm font-medium flex items-center justify-center gap-2 transition-all",
          value === "no"
            ? "border-[color:var(--warning)] bg-warning/30 text-[color:var(--warning)] ring-2 ring-warning/40 shadow-sm"
            : "border-warning/40 bg-warning/10 text-[color:var(--warning)]/80 hover:bg-warning/20",
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5" /> Não consegui falar
      </button>
    </div>
  );
}

export function InteractionQuickDialog({
  task,
  existing,
  onClose,
  onSaved,
}: {
  task: SalesforceTask | null;
  existing: TaskInteractionState | null;
  onClose: () => void;
  onSaved: (state: TaskInteractionState) => void;
}) {
  const logInteraction = useServerFn(logSalesforceInteraction);
  const [contacted, setContacted] = useState<"yes" | "no" | null>(null);
  const [interactionType, setInteractionType] = useState<string>("Ligação");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setContacted(existing?.contacted ?? null);
      setInteractionType(existing?.type ?? "Ligação");
      setNote(existing?.note ?? "");
    }
  }, [task?.id]);

  const submit = async () => {
    if (!task || !contacted) return;
    setSaving(true);
    try {
      await logInteraction({
        data: {
          subject: `${interactionType} — ${contacted === "yes" ? "Falei" : "Sem contato"}: ${task.subject}`,
          description: note,
          whatId: task.whatId,
          whoId: task.whoId,
          ownerId: task.ownerId,
          tipoInteracao: interactionType,
          conseguiuFalar: contacted === "yes" ? "Sim" : "Não",
          comments: note,
        },
      });
      toast.success("Interação registrada no Salesforce.");
      onSaved({ contacted, type: interactionType, note, ts: Date.now() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar interação.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar interação</DialogTitle>
          <DialogDescription>
            {task?.subject} — {task?.what ?? task?.who ?? "—"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Conseguiu falar com o cliente?</Label>
            <ContactedToggle value={contacted} onChange={setContacted} />
          </div>
          <div>
            <Label className="mb-1.5 block">Tipo de interação</Label>
            <Select value={interactionType} onValueChange={setInteractionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INTERACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Comentários</Label>
            <Textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Detalhes da conversa, próximos passos…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !contacted}>
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CompleteTaskDialog({
  task,
  existing,
  onClose,
  onSaveInteraction,
  onDone,
}: {
  task: SalesforceTask | null;
  existing: TaskInteractionState | null;
  onClose: () => void;
  onSaveInteraction: (state: TaskInteractionState) => void;
  onDone: () => void;
}) {
  const completeFn = useServerFn(completeSalesforceTask);
  const createFn = useServerFn(createSalesforceTask);
  const logFn = useServerFn(logSalesforceInteraction);

  const [contacted, setContacted] = useState<"yes" | "no" | null>(null);
  const [interactionType, setInteractionType] = useState<string>("Ligação");
  const [interactionNote, setInteractionNote] = useState("");
  const [interactionAlreadyLogged, setInteractionAlreadyLogged] = useState(false);

  const [createNext, setCreateNext] = useState(true);
  const [subject, setSubject] = useState("");
  const [type, setType] = useState<string>("Follow-up");
  const [priority, setPriority] = useState<string>("Normal");
  const [date, setDate] = useState<string>(todayKey());
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setContacted(existing?.contacted ?? null);
      setInteractionType(existing?.type ?? "Ligação");
      setInteractionNote(existing?.note ?? "");
      setInteractionAlreadyLogged(!!existing);
      setCreateNext(true);
      setSubject(`Follow-up — ${task.what ?? task.who ?? task.subject}`);
      setType("Follow-up");
      setPriority(task.priority ?? "Normal");
      const d = new Date();
      d.setDate(d.getDate() + 7);
      setDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
      setDescription("");
    }
  }, [task?.id]);

  const submit = async () => {
    if (!task) return;
    if (!interactionAlreadyLogged) {
      if (!contacted) {
        toast.error("Selecione se conseguiu falar com o cliente.");
        return;
      }
      if (!interactionType) {
        toast.error("Selecione o tipo de interação.");
        return;
      }
    }
    if (createNext) {
      if (!subject.trim()) { toast.error("Assunto da nova tarefa é obrigatório."); return; }
      if (!type) { toast.error("Tipo da nova tarefa é obrigatório."); return; }
      if (!priority) { toast.error("Prioridade da nova tarefa é obrigatória."); return; }
      if (!date) { toast.error("Vencimento da nova tarefa é obrigatório."); return; }
    }
    setSaving(true);
    try {
      if (!interactionAlreadyLogged) {
        await logFn({
          data: {
            subject: `${interactionType} — ${contacted === "yes" ? "Falei" : "Sem contato"}: ${task.subject}`,
            description: interactionNote,
            whatId: task.whatId,
            whoId: task.whoId,
            ownerId: task.ownerId,
            tipoInteracao: interactionType,
            conseguiuFalar: contacted === "yes" ? "Sim" : "Não",
            comments: interactionNote,
          },
        });
        onSaveInteraction({
          contacted: contacted!,
          type: interactionType,
          note: interactionNote,
          ts: Date.now(),
        });
      }
      await completeFn({ data: { taskId: task.id } });
      if (createNext) {
        await createFn({
          data: {
            subject,
            type,
            priority,
            activityDate: date,
            description,
            whatId: task.whatId,
            whoId: task.whoId,
            ownerId: task.ownerId,
          },
        });
      }
      toast.success("Tarefa concluída no Salesforce.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao concluir tarefa.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" /> Concluir tarefa
          </DialogTitle>
          <DialogDescription>
            {task?.subject} — {task?.what ?? task?.who ?? "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-primary" /> Interação
              </div>
              {interactionAlreadyLogged ? (
                <button
                  type="button"
                  onClick={() => {
                    setInteractionAlreadyLogged(false);
                    setContacted(null);
                    setInteractionType("Ligação");
                    setInteractionNote("");
                  }}
                  className="text-[11px] px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Nova interação
                </button>
              ) : null}
            </div>
            {interactionAlreadyLogged ? (
              <div className="text-xs text-success flex items-center gap-1.5">
                <Check className="h-3 w-3" /> Interação já registrada para esta tarefa.
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-xs mb-1.5 block">
                    Conseguiu falar com o cliente? <span className="text-destructive">*</span>
                  </Label>
                  <ContactedToggle value={contacted} onChange={setContacted} />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">
                    Tipo de interação <span className="text-destructive">*</span>
                  </Label>
                  <Select value={interactionType} onValueChange={setInteractionType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INTERACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Comentários</Label>
                  <Textarea
                    rows={3}
                    value={interactionNote}
                    onChange={(e) => setInteractionNote(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Plus className="h-3.5 w-3.5 text-primary" /> Nova tarefa
              </div>
              <label className="text-xs flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createNext}
                  onChange={(e) => setCreateNext(e.target.checked)}
                />
                Criar próxima
              </label>
            </div>
            {createNext && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Assunto <span className="text-destructive">*</span></Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Tipo <span className="text-destructive">*</span></Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TASK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Prioridade <span className="text-destructive">*</span></Label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Vencimento <span className="text-destructive">*</span></Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Comentários</Label>
                  <Textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Relacionada a: {task?.what ?? task?.who ?? "—"}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || (!interactionAlreadyLogged && !contacted)}>
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Concluir tarefa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RescheduleTaskDialog({
  task,
  onClose,
  onDone,
}: {
  task: SalesforceTask | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const rescheduleFn = useServerFn(rescheduleSalesforceTask);
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      setDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
      setReason("");
    }
  }, [task?.id]);

  const REASONS = [
    "Cliente pediu para retornar depois",
    "Sem contato — tentar novamente",
    "Aguardando material/proposta",
    "Cliente em viagem/férias",
    "Reagendado a pedido do cliente",
    "Outro",
  ];

  const submit = async () => {
    if (!task) return;
    if (!date) { toast.error("Selecione a nova data."); return; }
    setSaving(true);
    try {
      await rescheduleFn({ data: { taskId: task.id, newDate: date, reason: reason || null } });
      toast.success("Tarefa adiada no Salesforce.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adiar tarefa.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-[color:var(--warning)]" /> Adiar tarefa
          </DialogTitle>
          <DialogDescription>
            {task?.subject} — {task?.what ?? task?.who ?? "—"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Nova data</Label>
            <Input
              type="date"
              min={todayKey()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Motivo (opcional)</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Selecione um motivo…" /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !date}>
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Adiar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewTaskDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const createFn = useServerFn(createSalesforceTask);
  const fetchAccounts = useServerFn(getSalesforceAccounts);

  const [search, setSearch] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [type, setType] = useState<string>("Follow-up");
  const [priority, setPriority] = useState<string>("Normal");
  const [date, setDate] = useState<string>(todayKey());
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const accountsQ = useQuery({
    queryKey: ["sf-accounts-newtask"],
    queryFn: () => fetchAccounts(),
    enabled: open,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { scope } = useSellerScope();
  const allAccounts = accountsQ.data?.records ?? [];
  // Mostra somente as contas do próprio vendedor (ou do escopo permitido).
  const accounts = useMemo(() => {
    if (!scope || scope.scope === "geral") return allAccounts;
    const allowed = new Set(
      (scope.allowed_sf_ids ?? (scope.sf_user_id ? [scope.sf_user_id] : [])).filter(Boolean),
    );
    if (allowed.size === 0) return [];
    return allAccounts.filter((a) => a.ownerId && allowed.has(a.ownerId));
  }, [allAccounts, scope]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? accounts.filter((a) => a.name.toLowerCase().includes(q)) : accounts;
    return base.slice(0, 30);
  }, [accounts, search]);
  const selected = accounts.find((a) => a.id === accountId) ?? null;

  const submit = async () => {
    if (!accountId) { toast.error("Selecione o cliente."); return; }
    if (!subject.trim()) { toast.error("Assunto é obrigatório."); return; }
    if (!date) { toast.error("Vencimento é obrigatório."); return; }
    setSaving(true);
    try {
      await createFn({
        data: { subject, type, priority, activityDate: date, description, whatId: accountId },
      });
      toast.success("Tarefa criada no Salesforce.");
      setSearch(""); setAccountId(null); setSubject(""); setDescription("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar tarefa.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-primary" /> Nova tarefa
          </DialogTitle>
          <DialogDescription>
            Cria uma tarefa em aberto no Salesforce vinculada ao cliente selecionado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Cliente</div>
            {selected ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <span className="text-sm font-medium truncate">{selected.name}</span>
                <Button variant="ghost" size="sm" onClick={() => setAccountId(null)}>Trocar</Button>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Buscar entre seus clientes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="mt-1 max-h-44 overflow-y-auto rounded-md border border-border divide-y divide-border">
                  {accountsQ.isLoading && (
                    <div className="p-3 text-xs text-muted-foreground">Carregando clientes…</div>
                  )}
                  {!accountsQ.isLoading && filtered.length === 0 && (
                    <div className="p-3 text-xs text-muted-foreground">
                      Nenhum cliente da sua carteira encontrado.
                    </div>
                  )}
                  {filtered.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => {
                        setAccountId(a.id);
                        if (!subject) setSubject(`Follow-up — ${a.name}`);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{a.name}</span>
                      {a.segment && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-primary/15 text-primary shrink-0">
                          {a.segment}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Assunto</div>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Assunto da tarefa"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Tipo</div>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Prioridade</div>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Vencimento</div>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Descrição</div>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Criando…" : "Criar tarefa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
