import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { finalidadeUsoPorDocFn } from "@/lib/clientes.functions";
import { obterPropostaFn } from "@/lib/propostas.functions";
import { finalidadeUsoDoCadastro, labelFinalidadeUso } from "@/lib/carregadores";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtBRL, fmtPct } from "@/lib/carregadores";
import { StatusDot } from "@/components/proposta-status-ui";
import { PropostaTimeline } from "@/components/proposta-timeline";
import { propostaStatusStyle } from "@/lib/proposta-status";
import { ProdutoFoto } from "@/components/produto-foto";
import { useImagensPorCodigo } from "@/lib/produto-imagens";
import { ArrowLeft, Calculator, ChevronLeft, ChevronRight, FileText, Pencil, Printer } from "lucide-react";
import { cidadeUf } from "@/lib/local-format";
import { formatSapNumero } from "@/lib/sap-numero";
import { NfDocumentosCard } from "@/components/nf-documentos-card";
import { CobrancaCard } from "@/components/cobranca-card";
import { propostaPdfDaLinha } from "@/lib/proposta-pdf-row";
import { useState } from "react";
import { toast } from "sonner";



type Item = { codigo?: string | null; nome?: string; qtd?: number; valor?: number };

const fmtData = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export function usePropostaDetalhe(id?: string) {
  return useQuery({
    queryKey: ["carregadores-proposta", id],
    enabled: !!id,
    queryFn: async () => {
      return await obterPropostaFn({ data: { id: id! } });
    },
  });
}

/** Conteúdo completo da proposta — usado no pop-up e na rota de link direto. */
export function PropostaDetalhe({ id }: { id?: string }) {
  const q = usePropostaDetalhe(id);
  const p = q.data as Record<string, any> | null | undefined;
  const itens: Item[] = (p?.['itens'] as Item[]) ?? [];
  const totais: Record<string, number> = (p?.['totais'] as Record<string, number>) ?? {};
  const subtotal = itens.reduce((a, i) => a + (i.valor ?? 0) * (i.qtd ?? 0), 0);
  const fotosQ = useImagensPorCodigo(itens.map((i) => i.codigo));
  const fotos = fotosQ.data ?? {};
  const frete = Number(p?.['frete_valor'] ?? 0);
  const status = String(p?.['status'] ?? "Salvo");
  const st = propostaStatusStyle(status);

  // Finalidade de uso: sempre a do cadastro atual do cliente (nunca a salva na proposta).
  const buscarFinalidade = useServerFn(finalidadeUsoPorDocFn);
  const docCliente = String(p?.['cliente_doc'] ?? "").replace(/\D/g, "");
  const finalidadeQ = useQuery({
    queryKey: ["cliente-finalidade", docCliente],
    queryFn: () => buscarFinalidade({ data: { doc: docCliente } }),
    enabled: docCliente.length >= 11,
    staleTime: 0,
  });
  const finalidadeCadastro = finalidadeQ.data?.finalidade ?? null;

  if (q.isLoading) return <div className="glass rounded-2xl p-8 text-muted-foreground">Carregando…</div>;
  if (!p) return <div className="glass rounded-2xl p-8 text-muted-foreground">Proposta não encontrada.</div>;

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-primary font-semibold">
              Proposta {p['numero'] ?? "—"}
            </div>
            <h2 className="text-2xl font-bold mt-1 truncate">{p['nome'] || p['cliente_nome']}</h2>
            <div className="text-sm text-muted-foreground mt-1">{p['cliente_nome']}</div>
          </div>
          <div
            className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold"
            style={{ backgroundColor: st.bg, color: st.fg }}
          >
            <StatusDot status={status} size="sm" className="ring-0" />
            {status}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Campo label="Data de criação" value={fmtData(p['created_at'])} />
          <Campo label="Criado por" value={p['criado_por_nome'] || "—"} />
          <Campo label="Finalizado em" value={p['finalizado_em'] ? fmtData(p['finalizado_em']) : "—"} />
          <Campo label="Finalizado por" value={p['finalizado_por_nome'] || "—"} />
          <Campo label="Consultor responsável" value={p['consultor_nome'] || "—"} />
          <Campo label="Nº SAP" value={formatSapNumero(p['sap_ov_numero'] || p['numero_sap']) || "—"} />
          <Campo label="CNPJ/CPF" value={p['cliente_doc'] || "—"} />
          <Campo label="Inscrição estadual" value={p['cliente_ie'] || "—"} />
        </div>

        <PropostaPdfAcoes proposta={p} />
      </div>

      <div className="glass rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">

          Andamento do pedido
        </h3>
        <PropostaTimeline status={status} proposta={p} />
      </div>

      <NfDocumentosCard proposta={p} />

      {(p['pagamento_linha_digitavel'] || p['pagamento_pix_copia_cola'] || p['pagamento_status']) && (
        <div className="glass rounded-2xl p-5">
          <CobrancaCard
            cobranca={{
              forma: p['forma_pagamento'],
              meio: p['pagamento_meio'],
              status: p['pagamento_status'],
              valor: Number(p['pagamento_valor'] ?? 0) || null,
              vencimento: p['pagamento_vencimento'],
              linhaDigitavel: p['pagamento_linha_digitavel'],
              nossoNumero: p['pagamento_nosso_numero'],
              pixCopiaCola: p['pagamento_pix_copia_cola'],
              url: p['pagamento_url'],
              atualizado_em: p['pagamento_atualizado_em'],
            }}
          />
        </div>
      )}




      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Faturamento</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Campo
              label="Cidade / UF de destino"
              value={(() => {
                const fat = (p['faturamento'] ?? {}) as Record<string, string>;
                const ent = (p['entrega'] ?? {}) as Record<string, string>;
                const cidade = fat['cidade'] || ent['cidade'] || "";
                const uf = fat['uf'] || ent['uf'] || String(p['uf'] ?? "");
                return cidadeUf(cidade, uf);
              })()}
            />
            <Campo label="Contribuinte" value={p['contribuinte'] ? "Sim" : "Não"} />
            <Campo label="Finalidade de uso" value={finalidadeCadastro ? labelFinalidadeUso[finalidadeUsoDoCadastro(finalidadeCadastro)] : labelFinalidade(p['finalidade_uso'])} />
            <Campo label="Frete" value={`${p['frete_mod'] ?? "—"} · ${fmtBRL(frete)}`} />
            <Campo label="Indicação" value={p['indicacao'] ? "Sim" : "Não"} />
            {p['indicacao'] ? <Campo label="Padrinho" value={p['padrinho_nome'] || "—"} /> : null}

          </div>
        </div>

        <div className="glass rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Contato do cliente
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Campo label="Telefone" value={p['cliente_telefone'] || "—"} />
            <Campo label="E-mail" value={p['cliente_email'] || "—"} />
          </div>
          {p['observacoes'] ? (
            <div className="pt-2">
              <div className="text-xs text-muted-foreground">Observações</div>
              <div className="text-sm whitespace-pre-wrap">{p['observacoes']}</div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Produtos da proposta
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider border-y border-border">
                <th className="text-left px-5 py-3">Foto</th>
                <th className="text-left px-5 py-3">Código</th>
                <th className="text-left px-5 py-3">Descrição</th>
                <th className="text-right px-5 py-3">Qtde</th>
                <th className="text-right px-5 py-3">Preço unitário</th>
                <th className="text-right px-5 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i, idx) => (
                <tr key={idx} className="border-b border-border/50 last:border-0">
                  <td className="px-5 py-2">
                    <ProdutoFoto url={i.codigo ? fotos[i.codigo] : undefined} alt={i.nome} />
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{i.codigo || "—"}</td>
                  <td className="px-5 py-3 font-medium">{i.nome || "—"}</td>
                  <td className="px-5 py-3 text-right">{i.qtd ?? 0}</td>
                  <td className="px-5 py-3 text-right">{fmtBRL(i.valor ?? 0)}</td>
                  <td className="px-5 py-3 text-right font-semibold">
                    {fmtBRL((i.valor ?? 0) * (i.qtd ?? 0))}
                  </td>
                </tr>
              ))}
              {itens.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                    Nenhum item nesta proposta.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-8 border-t border-border px-5 py-4">
          <Total label="Subtotal" value={fmtBRL(subtotal)} />
          <Total label="Frete" value={fmtBRL(frete)} />
          <Total label="Total" value={fmtBRL(totais['valorTotal'] ?? subtotal + frete)} destaque />
        </div>
      </div>

      <div className="glass rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Indicadores internos
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Campo label="Receita líquida" value={fmtBRL(totais['rl'] ?? 0)} />
          <Campo label="Margem bruta" value={fmtPct(totais['mbPct'] ?? 0)} />
          <Campo label="Comissão estimada" value={fmtBRL(totais['comissao'] ?? 0)} />
          <Campo label="ICMS" value={fmtBRL(totais['icms'] ?? 0)} />
          <Campo label="IPI" value={fmtBRL(totais['ipi'] ?? 0)} />
          <Campo label="PIS/COFINS" value={fmtBRL(totais['pisCofins'] ?? 0)} />
          <Campo label="Valor dos itens" value={fmtBRL(totais['valor'] ?? subtotal)} />
          <Campo label="Margem bruta (R$)" value={fmtBRL(totais['mb'] ?? 0)} />
        </div>
      </div>
    </div>
  );
}

/** Pop-up grande com todas as informações, com navegação entre propostas. */
export function PropostaDetalheDialog({
  id,
  onOpenChange,
  onNavigate,
  hasPrev,
  hasNext,
}: {
  id?: string;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (dir: -1 | 1) => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}) {
  return (
    <Dialog open={!!id} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-6xl h-[92dvh] max-h-[92dvh] flex flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="sticky top-0 z-10 shrink-0 border-b bg-background/95 px-4 py-3 text-left backdrop-blur sm:px-6">
          <DialogTitle className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
            <span className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label="Voltar"
                onClick={() => onOpenChange(false)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="truncate">Detalhes da proposta</span>
            </span>
            <span className="flex flex-wrap items-center justify-end gap-1">
              {onNavigate && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Proposta anterior"
                    disabled={!hasPrev}
                    onClick={() => onNavigate(-1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Próxima proposta"
                    disabled={!hasNext}
                    onClick={() => onNavigate(1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}
              {id && (
                <>
                  <Button variant="outline" size="sm" className="gap-2 ml-1" asChild>
                    <Link to="/carregadores/propostas/auditoria" search={{ id }}>
                      <Calculator className="h-4 w-4" /> Auditoria
                    </Link>
                  </Button>
                  <Button size="sm" className="gap-2" asChild>
                    <Link to="/carregadores/propostas/nova" search={{ id }}>
                      <Pencil className="h-4 w-4" /> Editar
                    </Link>
                  </Button>
                </>
              )}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6">
          <PropostaDetalhe id={id} />
        </div>

      </DialogContent>
    </Dialog>
  );
}

function labelFinalidade(v: unknown) {
  const map: Record<string, string> = {
    uso_consumo: "Uso e consumo",
    revenda: "Revenda",
    industrializacao: "Industrialização",
  };
  return map[String(v ?? "")] ?? "—";
}

function Campo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}

function Total({ label, value, destaque }: { label: string; value: string; destaque?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={destaque ? "text-xl font-bold text-primary" : "text-base font-semibold"}>{value}</div>
    </div>
  );
}
