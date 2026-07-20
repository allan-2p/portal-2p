import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { useMarketingUnit } from "@/components/instance-provider";
import { TrendingUp, Check, Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { AtlasSoonCard } from "./marketing.index";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/marketing/cac")({
  head: () => ({ meta: [{ title: "CAC — Marketing — Portal 2P" }] }),
  component: CacPage,
});

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
] as const;

type CacInputs = {
  trafego: number;
  midia: number;
  agencia: number;
  funcionarios: number;
  ferramentas: number;
  outros: number;
  novosClientes: number;
  faturamento?: number;
  margemLiquida?: number;
};

type SavedCac = Record<string, CacInputs>; // key = "solar-2026-6"

function key(unit: string, year: number, month: number) {
  return `${unit}-${year}-${month + 1}`;
}
const STORAGE = "portal2p-marketing-cac";

function loadAll(): SavedCac {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveAll(v: SavedCac) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE, JSON.stringify(v));
}

// Mocks pré-preenchidos até a pessoa responsável começar a preencher.
const PRELOADED: SavedCac = {
  "solar-2026-1": { trafego: 18000, midia: 6000, agencia: 12000, funcionarios: 24000, ferramentas: 3200, outros: 1800, novosClientes: 28 },
  "solar-2026-2": { trafego: 21000, midia: 5800, agencia: 12000, funcionarios: 24000, ferramentas: 3200, outros: 1400, novosClientes: 32 },
  "solar-2026-3": { trafego: 22400, midia: 7200, agencia: 12000, funcionarios: 25000, ferramentas: 3200, outros: 2100, novosClientes: 34 },
  "solar-2026-4": { trafego: 24800, midia: 6800, agencia: 12000, funcionarios: 25000, ferramentas: 3400, outros: 1600, novosClientes: 38 },
  "solar-2026-5": { trafego: 26200, midia: 7400, agencia: 12000, funcionarios: 25500, ferramentas: 3400, outros: 1900, novosClientes: 41 },
  // Junho intencionalmente pendente!
  "carregadores-2026-1": { trafego: 8400, midia: 2100, agencia: 6000, funcionarios: 12000, ferramentas: 1200, outros: 600, novosClientes: 6 },
  "carregadores-2026-2": { trafego: 9200, midia: 2400, agencia: 6000, funcionarios: 12000, ferramentas: 1200, outros: 700, novosClientes: 7 },
  "carregadores-2026-3": { trafego: 10100, midia: 2800, agencia: 6000, funcionarios: 12500, ferramentas: 1200, outros: 900, novosClientes: 8 },
  "carregadores-2026-4": { trafego: 11400, midia: 3000, agencia: 6000, funcionarios: 12500, ferramentas: 1400, outros: 800, novosClientes: 9 },
  "carregadores-2026-5": { trafego: 12200, midia: 3200, agencia: 6000, funcionarios: 12800, ferramentas: 1400, outros: 1100, novosClientes: 10 },
};

const YEAR = 2026;
const CURRENT_MONTH_IDX = 5; // até junho (índice 5)

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function CacPage() {
  const { marketingUnit } = useMarketingUnit();
  const [store, setStore] = useState<SavedCac>({});
  const [editing, setEditing] = useState<number | null>(null);

  useEffect(() => {
    const local = loadAll();
    setStore({ ...PRELOADED, ...local });
  }, []);

  const monthsInScope = useMemo(() => Array.from({ length: 12 }, (_, i) => i), []);
  const cacByMonth = monthsInScope.map((m) => {
    const s = store[key(marketingUnit, YEAR, m)];
    if (!s || m > CURRENT_MONTH_IDX) return { m, filled: false, cac: null as number | null, custo: 0, novos: 0, faturamento: 0, margem: 0 };
    const custo = s.trafego + s.midia + s.agencia + s.funcionarios + s.ferramentas + s.outros;
    const cac = s.novosClientes > 0 ? custo / s.novosClientes : null;
    return { m, filled: true, cac, custo, novos: s.novosClientes, faturamento: s.faturamento ?? 0, margem: s.margemLiquida ?? 0 };
  });

  const pendentes = cacByMonth.filter((c) => !c.filled && c.m <= CURRENT_MONTH_IDX);
  const media = (() => {
    const withVal = cacByMonth.filter((c) => c.cac !== null);
    if (!withVal.length) return null;
    return withVal.reduce((a, c) => a + (c.cac ?? 0), 0) / withVal.length;
  })();

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Marketing</div>
          <h1 className="text-3xl font-bold mt-1 flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" /> CAC {YEAR}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Custo de aquisição por cliente, mês a mês. Meses pendentes só entram no registro depois de preenchidos.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniKPI label="CAC médio (ano)" value={media !== null ? fmtBRL(media) : "—"} />
          <MiniKPI label="Meses preenchidos" value={`${cacByMonth.filter((c) => c.filled).length} / ${CURRENT_MONTH_IDX + 1}`} />
          <MiniKPI label="Pendentes" value={String(pendentes.length)} accent={pendentes.length > 0 ? "text-warning" : undefined} />
          <MiniKPI label="Melhor mês" value={(() => {
            const b = cacByMonth.filter((c) => c.cac !== null).sort((a, b) => (a.cac ?? 0) - (b.cac ?? 0))[0];
            return b ? MESES[b.m].slice(0, 3) : "—";
          })()} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {cacByMonth.map((c) => {
            const isPending = !c.filled && c.m <= CURRENT_MONTH_IDX;
            const isFuture = c.m > CURRENT_MONTH_IDX;
            return (
              <button
                key={c.m}
                onClick={() => !isFuture && setEditing(c.m)}
                disabled={isFuture}
                className={cn(
                  "text-left rounded-2xl border p-4 transition-colors",
                  isFuture && "border-border/40 bg-surface/40 opacity-50 cursor-not-allowed",
                  isPending && "border-warning/40 bg-warning/5 hover:bg-warning/10",
                  c.filled && "border-border bg-surface/60 hover:border-primary/40",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">{MESES[c.m]}</span>
                  {c.filled && <Check className="h-3.5 w-3.5 text-success" />}
                  {isPending && <Clock className="h-3.5 w-3.5 text-warning" />}
                </div>
                {c.filled ? (
                  <>
                    <div className="mt-2 font-display font-bold text-2xl tabular-nums">{fmtBRL(c.cac ?? 0)}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {c.novos} novos · custo {fmtBRL(c.custo)}
                    </div>
                  </>
                ) : isFuture ? (
                  <div className="mt-2 text-sm text-muted-foreground">—</div>
                ) : (
                  <>
                    <div className="mt-2 text-sm font-semibold text-warning">Pendente</div>
                    <div className="text-[11px] text-muted-foreground mt-1">Clique para preencher</div>
                  </>
                )}
              </button>
            );
          })}
        </div>

        <AtlasSoonCard />
      </div>

      {editing !== null && (
        <CacForm
          month={editing}
          initial={store[key(marketingUnit, YEAR, editing)]}
          onClose={() => setEditing(null)}
          onSave={(v) => {
            const k = key(marketingUnit, YEAR, editing);
            const next = { ...store, [k]: v };
            // Persistimos apenas o que o usuário digitou (excluímos preloaded)
            const custom: SavedCac = { ...loadAll(), [k]: v };
            saveAll(custom);
            setStore(next);
            setEditing(null);
            toast.success(`CAC de ${MESES[editing]} salvo.`);
          }}
        />
      )}
    </AppLayout>
  );
}

function CacForm({ month, initial, onClose, onSave }: {
  month: number; initial?: CacInputs; onClose: () => void; onSave: (v: CacInputs) => void;
}) {
  const [v, setV] = useState<CacInputs>(
    initial ?? { trafego: 0, midia: 0, agencia: 0, funcionarios: 0, ferramentas: 0, outros: 0, novosClientes: 0 },
  );
  const total = v.trafego + v.midia + v.agencia + v.funcionarios + v.ferramentas + v.outros;
  const cac = v.novosClientes > 0 ? total / v.novosClientes : null;
  const upd = <K extends keyof CacInputs,>(k: K, val: number) => setV((s) => ({ ...s, [k]: val }));

  return (
    <>
      <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-display font-semibold text-lg">CAC · {MESES[month]}</h2>
            <p className="text-xs text-muted-foreground">Preencha custos e novos clientes do mês.</p>
          </div>
          <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
            <NumberField label="Tráfego pago" v={v.trafego} onChange={(n) => upd("trafego", n)} />
            <NumberField label="Mídia" v={v.midia} onChange={(n) => upd("midia", n)} />
            <NumberField label="Agência" v={v.agencia} onChange={(n) => upd("agencia", n)} />
            <NumberField label="Funcionários" v={v.funcionarios} onChange={(n) => upd("funcionarios", n)} />
            <NumberField label="Ferramentas" v={v.ferramentas} onChange={(n) => upd("ferramentas", n)} />
            <NumberField label="Outros" v={v.outros} onChange={(n) => upd("outros", n)} />
            <div className="h-px bg-border my-2" />
            <NumberField label="Novos clientes no mês" v={v.novosClientes} onChange={(n) => upd("novosClientes", n)} isCount />
            <div className="rounded-xl bg-surface-2 p-4 flex justify-between items-center">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">CAC calculado</div>
                <div className="font-display font-bold text-2xl">{cac !== null ? fmtBRL(cac) : "—"}</div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>Custo total: {fmtBRL(total)}</div>
                <div>÷ {v.novosClientes} novos</div>
              </div>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-surface-2">Cancelar</button>
            <button onClick={() => onSave(v)} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 font-medium">Salvar</button>
          </div>
        </div>
      </div>
    </>
  );
}

function NumberField({ label, v, onChange, isCount }: { label: string; v: number; onChange: (n: number) => void; isCount?: boolean }) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-40 text-muted-foreground">{label}</span>
      <input
        type="number"
        min={0}
        value={v}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="flex-1 py-1.5 px-2 rounded-md bg-surface border border-border focus:outline-none focus:border-primary/50 tabular-nums text-right"
      />
      <span className="w-8 text-xs text-muted-foreground">{isCount ? "un." : "R$"}</span>
    </label>
  );
}

function MiniKPI({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-display font-bold text-xl tabular-nums mt-1", accent)}>{value}</div>
    </div>
  );
}
