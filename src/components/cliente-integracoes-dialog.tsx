import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Plug, RefreshCw, ScanSearch, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClienteIntegracaoHistorico } from "@/components/cliente-integracao-historico";
import { reenviarClienteFn, revalidarCnpjClienteFn, testarIntegracoesClienteFn } from "@/lib/clientes.functions";
type Instancia = "solar" | "carregadores";

type ClienteResumo = {
  id: string;
  razao_social: string;
  numero_sap?: string | null;
  sap_status?: string | null;
  sap_erro?: string | null;
  sf_account_id?: string | null;
  sf_contact_id?: string | null;
  sf_status?: string | null;
  sf_erro?: string | null;
};

function Linha({ rot, val }: { rot: string; val?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{rot}</span>
      <span className="text-right font-medium break-words">{val && String(val).trim() ? val : "—"}</span>
    </div>
  );
}

/**
 * Integrações + auditoria de um cliente. Exclusivo de quem tem a permissão
 * "Clientes • Integrações e histórico" no perfil.
 */
export function ClienteIntegracoesDialog({
  cliente,
  instancia,
  open,
  onOpenChange,
}: {
  cliente: ClienteResumo | null;
  instancia: Instancia;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const reenviarFn = useServerFn(reenviarClienteFn);
  const testarFn = useServerFn(testarIntegracoesClienteFn);
  const revalidarFn = useServerFn(revalidarCnpjClienteFn);
  const [cnpjRes, setCnpjRes] = useState<{
    ok: boolean;
    fontes: string[];
    avisos: string[];
    alteracoes: { campo: string; de: string; para: string }[];
    aplicado: boolean;
  } | null>(null);
  const [testes, setTestes] = useState<Record<string, { ok: boolean; mensagem: string; detalhe?: string | null }>>({});
  const [alvoAtivo, setAlvoAtivo] = useState<string | null>(null);

  const testar = useMutation({
    mutationFn: async (alvo: "banco" | "sap" | "salesforce" | "contatos") => {
      setAlvoAtivo(`teste:${alvo}`);
      const r = await testarFn({ data: { instancia, id: cliente?.id, alvos: [alvo] } });
      return r.resultados;
    },
    onSuccess: (resultados) => {
      setTestes((prev) => {
        const next = { ...prev };
        for (const r of resultados) next[r.alvo] = { ok: r.ok, mensagem: r.mensagem, detalhe: r.detalhe };
        return next;
      });
      const falhou = resultados.find((r) => !r.ok);
      if (falhou) toast.error(falhou.mensagem);
      else toast.success("Teste concluído com sucesso.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha no teste."),
    onSettled: () => setAlvoAtivo(null),
  });

  const revalidar = useMutation({
    mutationFn: async (aplicar: boolean) => {
      setAlvoAtivo(aplicar ? "cnpj:aplicar" : "cnpj:consultar");
      return revalidarFn({ data: { instancia, id: cliente!.id, aplicar } });
    },
    onSuccess: (r) => {
      setCnpjRes({ ok: r.ok, fontes: r.fontes, avisos: r.avisos, alteracoes: r.alteracoes, aplicado: r.aplicado });
      if (!r.ok) toast.error(r.avisos[0] ?? "Não foi possível consultar as fontes oficiais.");
      else if (r.aplicado) toast.success(`Cadastro atualizado — ${r.alteracoes.length} campo(s).`);
      else if (r.alteracoes.length === 0) toast.success("Dados do CNPJ conferem com o cadastro.");
      else toast.warning(`${r.alteracoes.length} divergência(s) encontradas na Receita.`);
      if (r.aplicado) qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["cliente-integracao-historico"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao revalidar o CNPJ."),
    onSettled: () => setAlvoAtivo(null),
  });

  const reenviar = useMutation({
    mutationFn: async ({ id, alvos }: { id: string; alvos?: ("sap" | "salesforce" | "contatos")[] }) => {
      setAlvoAtivo(`reenvio:${alvos?.join(",") ?? "tudo"}`);
      const r = await reenviarFn({ data: { instancia, id, ...(alvos ? { alvos } : {}) } });
      return { alvos, resultado: r as any };
    },
    onSuccess: ({ alvos, resultado }) => {
      const pedidos = alvos ?? ["sap", "salesforce", "contatos"];
      const next: Record<string, { ok: boolean; mensagem: string; detalhe?: string | null }> = {};
      if (pedidos.includes("sap") && resultado?.sap) {
        next["sap"] = resultado.sap.ok
          ? { ok: true, mensagem: `SAP OK${resultado.sap.numero_sap ? ` · código ${resultado.sap.numero_sap}` : ""}.` }
          : { ok: false, mensagem: resultado.sap.erro ?? "Falha no envio ao SAP." };
      }
      if ((pedidos.includes("salesforce") || pedidos.includes("contatos")) && resultado?.salesforce) {
        const item = resultado.salesforce.ok
          ? {
              ok: true,
              mensagem: `Salesforce OK${resultado.salesforce.accountId ? ` · conta ${resultado.salesforce.accountId}` : ""}.`,
            }
          : { ok: false, mensagem: resultado.salesforce.erro ?? "Falha no envio ao Salesforce." };
        if (pedidos.includes("salesforce")) next["salesforce"] = item;
        if (pedidos.includes("contatos")) next["contatos"] = item;
      }
      setTestes((prev) => ({ ...prev, ...next }));
      const falhou = Object.values(next).find((r) => !r.ok);
      if (falhou) toast.error(falhou.mensagem);
      else toast.success("Reenvio concluído.");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["cliente-integracao-historico"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao reenviar."),
    onSettled: () => setAlvoAtivo(null),
  });


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        {cliente && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6">Integrações · {cliente.razao_social}</DialogTitle>
              <DialogDescription>
                Status do SAP e do Salesforce, tentativas, payloads e histórico de alterações.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-surface/40 p-3 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-primary">
                  Receita / CNPJ (Serpro + CNPJá)
                </div>
                <p className="text-xs text-muted-foreground">
                  Consulta as fontes oficiais e compara com o cadastro. Aplicar grava as diferenças e registra no histórico.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 h-8"
                    onClick={() => revalidar.mutate(false)}
                    disabled={Boolean(alvoAtivo)}
                  >
                    <ScanSearch className={`h-3.5 w-3.5 ${alvoAtivo === "cnpj:consultar" ? "animate-pulse" : ""}`} />
                    Buscar dados novamente
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-2 h-8"
                    onClick={() => revalidar.mutate(true)}
                    disabled={Boolean(alvoAtivo)}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${alvoAtivo === "cnpj:aplicar" ? "animate-spin" : ""}`} />
                    Revalidar e atualizar
                  </Button>
                </div>
                {cnpjRes && (
                  <div
                    className={`rounded-lg border p-2 text-xs space-y-2 ${
                      !cnpjRes.ok
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : cnpjRes.alteracoes.length === 0
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    <div className="flex items-start gap-2 font-medium">
                      {!cnpjRes.ok ? (
                        <XCircle className="h-3.5 w-3.5 mt-0.5" />
                      ) : cnpjRes.alteracoes.length === 0 ? (
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                      )}
                      <span>
                        {!cnpjRes.ok
                          ? "Nenhuma fonte oficial respondeu."
                          : cnpjRes.alteracoes.length === 0
                            ? `Tudo certo — cadastro igual à Receita. Fontes: ${cnpjRes.fontes.join(", ")}.`
                            : `${cnpjRes.alteracoes.length} divergência(s)${cnpjRes.aplicado ? " aplicada(s) ao cadastro" : " — clique em “Revalidar e atualizar” para gravar"}.`}
                      </span>
                    </div>
                    {cnpjRes.alteracoes.length > 0 && (
                      <ul className="space-y-1 text-[11px] text-foreground/80">
                        {cnpjRes.alteracoes.map((a) => (
                          <li key={a.campo} className="break-words">
                            <span className="font-semibold">{a.campo}</span>: {a.de || "—"} → {a.para || "—"}
                          </li>
                        ))}
                      </ul>
                    )}
                    {cnpjRes.avisos.length > 0 && (
                      <ul className="space-y-0.5 text-[11px] opacity-80">
                        {cnpjRes.avisos.map((v) => (
                          <li key={v}>• {v}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border bg-surface/40 p-3 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-primary">Banco (cadastro)</div>
                <Linha rot="ID do cadastro" val={cliente.id} />
                <Acoes
                  onTestar={() => testar.mutate("banco")}
                  testando={alvoAtivo === "teste:banco"}
                  ocupado={Boolean(alvoAtivo)}
                  resultado={testes["banco"]}
                />
              </div>

              <div className="rounded-xl border border-border bg-surface/40 p-3 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-primary">SAP</div>
                <Linha rot="Código SAP" val={cliente.numero_sap ?? "Não enviado"} />
                <Linha rot="Status" val={cliente.sap_status ?? "—"} />
                {cliente.sap_erro && <Linha rot="Erro" val={cliente.sap_erro} />}
                <Acoes
                  onTestar={() => testar.mutate("sap")}
                  testando={alvoAtivo === "teste:sap"}
                  ocupado={Boolean(alvoAtivo)}
                  onReenviar={() => reenviar.mutate({ id: cliente.id, alvos: ["sap"] })}
                  reenviando={alvoAtivo === "reenvio:sap"}
                  resultado={testes["sap"]}
                />
              </div>

              <div className="rounded-xl border border-border bg-surface/40 p-3 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-primary">Salesforce (conta)</div>
                <Linha rot="Conta" val={cliente.sf_account_id ?? "Não enviada"} />
                <Linha rot="Contato principal" val={cliente.sf_contact_id ?? "—"} />
                <Linha rot="Status" val={cliente.sf_status ?? "—"} />
                {cliente.sf_erro && <Linha rot="Erro" val={cliente.sf_erro} />}
                <Acoes
                  onTestar={() => testar.mutate("salesforce")}
                  testando={alvoAtivo === "teste:salesforce"}
                  ocupado={Boolean(alvoAtivo)}
                  onReenviar={() => reenviar.mutate({ id: cliente.id, alvos: ["salesforce"] })}
                  reenviando={alvoAtivo === "reenvio:salesforce"}
                  resultado={testes["salesforce"]}
                />
              </div>

              <div className="rounded-xl border border-border bg-surface/40 p-3 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-primary">Contatos</div>
                <Acoes
                  onTestar={() => testar.mutate("contatos")}
                  testando={alvoAtivo === "teste:contatos"}
                  ocupado={Boolean(alvoAtivo)}
                  onReenviar={() => reenviar.mutate({ id: cliente.id, alvos: ["contatos"] })}
                  reenviando={alvoAtivo === "reenvio:contatos"}
                  resultado={testes["contatos"]}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => reenviar.mutate({ id: cliente.id })}
                  disabled={reenviar.isPending}
                >
                  <RefreshCw className={`h-4 w-4 ${reenviar.isPending ? "animate-spin" : ""}`} />
                  Reenviar tudo
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <a href={`/admin/logs/integracoes?cliente=${encodeURIComponent(cliente.id)}`}>
                    Ver auditoria completa
                  </a>
                </Button>
              </div>

              <ClienteIntegracaoHistorico clienteId={cliente.id} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Acoes({
  onTestar,
  testando,
  ocupado,
  onReenviar,
  reenviando,
  resultado,
}: {
  onTestar: () => void;
  testando: boolean;
  ocupado?: boolean;
  onReenviar?: () => void;
  reenviando?: boolean;
  resultado?: { ok: boolean; mensagem: string; detalhe?: string | null };
}) {
  return (
    <div className="space-y-2 pt-1">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-2 h-8" onClick={onTestar} disabled={testando || ocupado}>
          <Plug className={`h-3.5 w-3.5 ${testando ? "animate-pulse" : ""}`} />
          Testar
        </Button>
        {onReenviar && (
          <Button variant="secondary" size="sm" className="gap-2 h-8" onClick={onReenviar} disabled={reenviando || ocupado}>
            <RefreshCw className={`h-3.5 w-3.5 ${reenviando ? "animate-spin" : ""}`} />
            Reenviar
          </Button>
        )}
      </div>
      {resultado && (
        <div
          className={`rounded-lg border p-2 text-xs ${
            resultado.ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          <div className="flex items-start gap-2 font-medium">
            {resultado.ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5" /> : <XCircle className="h-3.5 w-3.5 mt-0.5" />}
            <span>{resultado.mensagem}</span>
          </div>
          {resultado.detalhe && (
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] opacity-80">
              {resultado.detalhe}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
