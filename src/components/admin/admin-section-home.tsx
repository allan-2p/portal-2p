import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles, Lock, X } from "lucide-react";
import { ADMIN_SECTIONS, type AdminSectionId } from "@/lib/admin-nav";
import { useInstance } from "@/components/instance-provider";
import { cn } from "@/lib/utils";

/**
 * Home de uma área administrativa (Configurações, Moderação, Integrações, Logs).
 *
 * Em vez de cair direto numa tela qualquer, o usuário vê o que existe na área,
 * atalhos por grupo e um bloco de pendências/avisos específico da seção.
 */
export function AdminSectionHome({
  sectionId,
  children,
}: {
  sectionId: AdminSectionId;
  children?: ReactNode;
}) {
  const section = ADMIN_SECTIONS.find((s) => s.id === sectionId);
  const { hasFeature } = useInstance();
  if (!section) return null;

  const groups = section.groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !i.exact),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-foreground text-background flex items-center justify-center shrink-0">
          <section.icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Grupo 2P • Administração
          </div>
          <h1 className="font-display text-2xl font-bold">{section.label}</h1>
          <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
        </div>
      </header>

      {children}

      <div className="space-y-5">
        {groups.map((g, gi) => (
          <section key={gi} className="space-y-2">
            {g.label && (
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {g.label}
              </h2>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {g.items.map((item) => {
                const allowed = !item.feature || hasFeature(item.feature);
                const Icon = item.icon;
                const inner = (
                  <>
                    <div
                      className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                        allowed ? "bg-primary/10 text-primary" : "bg-surface-2 text-muted-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{item.label}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {allowed ? item.to : "Sem permissão no seu perfil"}
                      </div>
                    </div>
                    {allowed ? (
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </>
                );

                return allowed ? (
                  <Link
                    key={item.to}
                    to={item.to}
                    preload="intent"
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:bg-surface-2 transition-colors"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div
                    key={item.to}
                    className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 p-3 opacity-70"
                  >
                    {inner}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * Bloco de sugestões/avisos das homes administrativas.
 * São apenas dicas: cada item pode ser dispensado individualmente e o bloco
 * inteiro pode ser ocultado. A escolha fica salva neste navegador.
 */
export function AdminSectionNotice({
  title,
  items,
  dismissKey,
  onDismiss,
}: {
  title: string;
  items: { id?: string; label: string; hint?: string; to?: string }[];
  /** Chave de persistência das dispensas (padrão: o título). */
  dismissKey?: string;
  /** Chamado quando um item (ou todos) é dispensado. */
  onDismiss?: (ids: string[]) => void;
}) {
  const storageKey = `portal2p.notice-dismissed.${dismissKey ?? title}`;
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setDismissed(Array.isArray(parsed) ? parsed : []);
    } catch {
      setDismissed([]);
    }
  }, [storageKey]);

  const persist = (next: string[]) => {
    setDismissed(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const withIds = items.map((i, idx) => ({ ...i, id: i.id ?? `${idx}:${i.label}` }));
  const visible = withIds.filter((i) => !dismissed.includes(i.id));
  if (!visible.length) return null;

  const dismissOne = (id: string) => {
    persist(Array.from(new Set([...dismissed, id])));
    onDismiss?.([id]);
  };

  const dismissAll = () => {
    const ids = withIds.map((i) => i.id);
    persist(Array.from(new Set([...dismissed, ...ids])));
    onDismiss?.(ids);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          {title}
        </div>
        <button
          type="button"
          onClick={dismissAll}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Dispensar tudo
        </button>
      </div>
      <ul className="space-y-1.5">
        {visible.map((i) => (
          <li key={i.id} className="text-sm flex flex-wrap items-center gap-2">
            {i.to ? (
              <Link to={i.to} className="font-medium underline underline-offset-2">
                {i.label}
              </Link>
            ) : (
              <span className="font-medium">{i.label}</span>
            )}
            {i.hint && <span className="text-muted-foreground text-xs">{i.hint}</span>}
            <button
              type="button"
              aria-label={`Dispensar sugestão: ${i.label}`}
              onClick={() => dismissOne(i.id)}
              className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

