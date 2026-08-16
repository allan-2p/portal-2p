import { AlertTriangle, Ban, Coins, Truck } from "lucide-react";
import {
  REGRAS_GERAIS,
  REGRAS_TRANSPORTADORAS,
  nomeTrilho,
  type RegraTransportadora,
} from "@/lib/fretefy-regras";

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

function CardRegra({ r }: { r: RegraTransportadora }) {
  const bloqueio = r.tipo === "bloqueio";
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div
          className={
            bloqueio
              ? "h-9 w-9 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0"
              : "h-9 w-9 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0"
          }
        >
          {bloqueio ? <Ban className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm">{r.razaoSocial}</p>
          <p className="text-xs text-muted-foreground font-mono">
            Código SAP {r.codigoSap} · CNPJ {r.cnpj}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{r.resumo}</p>
          {!bloqueio && r.adicional ? (
            <p className="text-xs font-medium text-amber-600 mt-1">
              Adicional (TDE) de {fmt(r.adicional)} por envio.
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
          {bloqueio ? "Trilhos bloqueados" : "Trilhos com adicional"} ({r.trilhos.length})
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          {r.trilhos.map((c) => (
            <li key={c} className="text-xs flex gap-2">
              <span className="font-mono text-muted-foreground shrink-0">{c}</span>
              <span className="truncate">{nomeTrilho(c)}</span>
            </li>
          ))}
        </ul>
      </div>

      {r.extras?.length ? (
        <ul className="space-y-1 border-t border-border pt-2">
          {r.extras.map((e) => (
            <li key={e} className="text-xs flex gap-2 text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
              <span>{e}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Regras comerciais aplicadas em toda cotação de frete do portal. */
export function FreteRegrasPanel() {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Truck className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-semibold">Regras de frete aplicadas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Restrições e adicionais considerados automaticamente em cada cotação da proposta.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {REGRAS_TRANSPORTADORAS.map((r) => (
          <CardRegra key={r.cnpj} r={r} />
        ))}
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Regras gerais</p>
        <ul className="space-y-1">
          {REGRAS_GERAIS.map((g) => (
            <li key={g} className="text-xs text-muted-foreground flex gap-2">
              <span className="text-primary">•</span>
              <span>{g}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
