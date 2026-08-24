import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Mail, Phone, UserPlus, User, Building2, CreditCard } from "lucide-react";

export type ContatoTipo = "principal" | "financeiro" | "outro";

export type Contato = {
  tipo: ContatoTipo;
  nome: string;
  cargo: string;
  emails: string[];
  telefones: string[];
};

export const TIPO_ROTULO: Record<ContatoTipo, string> = {
  principal: "Contato principal",
  financeiro: "Contato financeiro",
  outro: "Contato adicional",
};

export const novoContato = (tipo: ContatoTipo = "outro"): Contato => ({
  tipo,
  nome: "",
  cargo: "",
  emails: [""],
  telefones: [""],
});

export const contatosPadrao = (): Contato[] => [novoContato("principal"), novoContato("financeiro")];

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const soDigitos = (v: string) => v.replace(/\D/g, "");
export const telefoneValido = (v: string) => {
  const d = soDigitos(v);
  return d.length === 10 || d.length === 11;
};

/** Garante que sempre existam os contatos principal e financeiro. */
export function normalizarContatos(raw: unknown, legado?: {
  nome?: string | null; cargo?: string | null; email?: string | null; telefone?: string | null;
}): Contato[] {
  // Cadastros importados da plataforma antiga podem trazer e-mail/telefone como
  // texto simples (ou separados por vírgula) em vez de lista.
  const lista0 = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map((x) => String(x ?? "")).filter((x) => x.trim());
    const t = String(v ?? "").trim();
    if (!t) return [];
    return t.split(/[;,]/).map((x) => x.trim()).filter(Boolean);
  };
  const lista: Contato[] = Array.isArray(raw)
    ? (raw as Array<Record<string, any>>)
        .filter((c) => c && typeof c === "object")
        .map((c) => {
          const emails = lista0(c["emails"] ?? c["email"]);
          const telefones = lista0(c["telefones"] ?? c["telefone"] ?? c["fone"]);
          return {
            tipo: (["principal", "financeiro", "outro"].includes(String(c["tipo"])) ? c["tipo"] : "outro") as ContatoTipo,
            nome: String(c["nome"] ?? ""),
            cargo: String(c["cargo"] ?? ""),
            emails: emails.length ? emails : [""],
            telefones: telefones.length ? telefones : [""],
          };
        })
    : [];


  let principal = lista.find((c) => c.tipo === "principal");
  let financeiro = lista.find((c) => c.tipo === "financeiro");
  const outros = lista.filter((c) => c !== principal && c !== financeiro);

  if (!principal) {
    principal = novoContato("principal");
    if (legado) {
      principal.nome = legado.nome ?? "";
      principal.cargo = legado.cargo ?? "";
      principal.emails = [legado.email ?? ""];
      principal.telefones = [legado.telefone ?? ""];
    }
  }
  if (!financeiro) financeiro = novoContato("financeiro");

  return [principal, financeiro, ...outros];
}

/** Erros por chave `contato-<idx>-<campo>` */
export function validarContatos(contatos: Contato[]): Record<string, string> {
  const e: Record<string, string> = {};
  contatos.forEach((c, i) => {
    const obrigatorio = c.tipo === "principal" || c.tipo === "financeiro";
    const preenchido =
      c.nome.trim() || c.cargo.trim() ||
      c.emails.some((v) => v.trim()) || c.telefones.some((v) => v.trim());
    if (!obrigatorio && !preenchido) return;

    if (!c.nome.trim()) e[`contato-${i}-nome`] = "Informe o nome do contato.";

    const emails = c.emails.map((v) => v.trim()).filter(Boolean);
    if (obrigatorio && emails.length === 0) {
      e[`contato-${i}-email-0`] = "Informe ao menos um e-mail.";
    }
    c.emails.forEach((v, j) => {
      if (v.trim() && !EMAIL_RE.test(v.trim())) e[`contato-${i}-email-${j}`] = "E-mail inválido.";
    });

    const fones = c.telefones.map((v) => v.trim()).filter(Boolean);
    if (c.tipo === "principal" && fones.length === 0) {
      e[`contato-${i}-telefone-0`] = "Informe ao menos um telefone.";
    }
    c.telefones.forEach((v, j) => {
      if (v.trim() && !telefoneValido(v.trim())) e[`contato-${i}-telefone-${j}`] = "Telefone inválido (DDD + número).";
    });
  });
  return e;
}

export function rotuloErroContato(chave: string, contatos: Contato[]): string | null {
  const m = /^contato-(\d+)-(nome|email|telefone)(?:-(\d+))?$/.exec(chave);
  if (!m) return null;
  const idx = Number(m[1]);
  const tipo = contatos[idx]?.tipo ?? "outro";
  const campo = m[2] === "nome" ? "Nome" : m[2] === "email" ? "E-mail" : "Telefone";
  return `${TIPO_ROTULO[tipo]} · ${campo}`;
}

function LinhaMulti({
  icone, rotulo, valores, onChange, placeholder, erros, idBase, tipo,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valores: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  erros: Record<string, string>;
  idBase: string;
  tipo: "email" | "tel";
}) {
  const setAt = (i: number, v: string) => onChange(valores.map((x, k) => (k === i ? v : x)));
  const remover = (i: number) => onChange(valores.length > 1 ? valores.filter((_, k) => k !== i) : [""]);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        {icone} {rotulo}
      </Label>
      {valores.map((v, i) => {
        const erro = erros[`${idBase}-${i}`];
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center gap-2">
              <Input
                id={`campo-${idBase}-${i}`}
                type={tipo === "email" ? "email" : "tel"}
                value={v}
                placeholder={placeholder}
                onChange={(e) => setAt(i, e.target.value)}
                className={erro ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              <Button
                type="button" variant="ghost" size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => remover(i)}
                aria-label={`Remover ${rotulo.toLowerCase()}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {erro && <p className="text-xs text-destructive">{erro}</p>}
          </div>
        );
      })}
      <Button
        type="button" variant="ghost" size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => onChange([...valores, ""])}
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar {rotulo.toLowerCase()}
      </Button>
    </div>
  );
}

export function ContatosEditor({
  contatos, onChange, erros,
}: {
  contatos: Contato[];
  onChange: (c: Contato[]) => void;
  erros: Record<string, string>;
}) {
  const upd = (i: number, patch: Partial<Contato>) =>
    onChange(contatos.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  const principal = contatos.find((c) => c.tipo === "principal");
  const financeiroIdx = contatos.findIndex((c) => c.tipo === "financeiro");
  const financeiro = financeiroIdx >= 0 ? contatos[financeiroIdx] : undefined;

  /** O financeiro está espelhando o principal? */
  const mesmoFinanceiro =
    !!principal && !!financeiro &&
    (principal.nome.trim() !== "" || principal.emails.some((v) => v.trim())) &&
    principal.nome === financeiro.nome &&
    principal.cargo === financeiro.cargo &&
    principal.emails.join("|") === financeiro.emails.join("|") &&
    principal.telefones.join("|") === financeiro.telefones.join("|");

  const copiarDoPrincipal = (marcar: boolean) => {
    if (financeiroIdx < 0 || !principal) return;
    upd(
      financeiroIdx,
      marcar
        ? {
            nome: principal.nome,
            cargo: principal.cargo,
            emails: [...principal.emails],
            telefones: [...principal.telefones],
          }
        : { nome: "", cargo: "", emails: [""], telefones: [""] },
    );
  };

  const iconeTipo = (tipo: ContatoTipo) => {
    if (tipo === "principal") return <User className="h-3.5 w-3.5" />;
    if (tipo === "financeiro") return <CreditCard className="h-3.5 w-3.5" />;
    return <Building2 className="h-3.5 w-3.5" />;
  };

  return (
    <div className="space-y-4">
      {contatos.map((c, i) => {
        const fixo = c.tipo === "principal" || c.tipo === "financeiro";
        const erroNome = erros[`contato-${i}-nome`];
        return (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 pb-3 border-b">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {iconeTipo(c.tipo)}
                </div>
                <div>
                  <div className="text-sm font-semibold">{TIPO_ROTULO[c.tipo]}{fixo ? " *" : ""}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {fixo ? "Obrigatório" : "Contato adicional"}
                  </div>
                </div>
              </div>
              {!fixo && (
                <Button
                  type="button" variant="ghost" size="sm"
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => onChange(contatos.filter((_, k) => k !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remover
                </Button>
              )}
            </div>

            {c.tipo === "financeiro" && principal && (
              <label className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                <Checkbox
                  checked={mesmoFinanceiro}
                  onCheckedChange={(v: boolean | "indeterminate") => copiarDoPrincipal(v === true)}
                />
                <span>Copiar dados do contato principal</span>
              </label>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Nome{fixo ? " *" : ""}</Label>
                <Input
                  id={`campo-contato-${i}-nome`}
                  value={c.nome}
                  onChange={(e) => upd(i, { nome: e.target.value })}
                  className={erroNome ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {erroNome && <p className="text-xs text-destructive">{erroNome}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Cargo</Label>
                <Input value={c.cargo} onChange={(e) => upd(i, { cargo: e.target.value })} />
              </div>
              <LinhaMulti
                icone={<Mail className="h-3.5 w-3.5" />}
                rotulo="E-mail"
                valores={c.emails}
                onChange={(v) => upd(i, { emails: v })}
                placeholder="nome@empresa.com.br"
                erros={erros}
                idBase={`contato-${i}-email`}
                tipo="email"
              />
              <LinhaMulti
                icone={<Phone className="h-3.5 w-3.5" />}
                rotulo="Telefone"
                valores={c.telefones}
                onChange={(v) => upd(i, { telefones: v })}
                placeholder="(11) 99999-9999"
                erros={erros}
                idBase={`contato-${i}-telefone`}
                tipo="tel"
              />
            </div>
          </div>
        );
      })}

      <Button
        type="button" variant="outline" size="sm" className="gap-2"
        onClick={() => onChange([...contatos, novoContato("outro")])}
      >
        <UserPlus className="h-4 w-4" /> Adicionar contato
      </Button>
    </div>
  );
}
