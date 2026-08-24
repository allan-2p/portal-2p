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
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, Pencil, Printer } from "lucide-react";
import { cidadeUf } from "@/lib/local-format";
import { formatSapNumero, formatPropostaNumero } from "@/lib/sap-numero";
import {
  numeroAnterior,
  ehPlataformaAntiga,
  dadosLegado,
  pagamentosLegado,
  bloqueiaReenvioSap,
} from "@/lib/proposta-legado";
import { useAuth } from "@/hooks/use-auth";
import { NfDocumentosCard } from "@/components/nf-documentos-card";
import { CobrancaCard } from "@/components/cobranca-card";
import { BoletosSharepointCard } from "@/components/boletos-sharepoint-card";
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
    // Enquanto a cobrança não estiver paga, o detalhe se atualiza sozinho —
    // assim o Pix reemitido aparece sem precisar recarregar a tela.
    refetchInterval: (q) => {
      const row = q.state.data as Record<string, any> | undefined;
      const forma = String(row?.["forma_pagamento"] ?? "");
      const st = String(row?.["pagamento_status"] ?? "");
      const aguardando = (forma === "pix" || forma === "boleto_vista") && st !== "pago" && st !== "cancelado";
      return aguardando ? 15000 : false;
    },
    refetchOnWindowFocus: true,
  });
}

/** Conteúdo completo da proposta — usado no pop-up e na rota de link direto. */
export function PropostaDetalhe({ id }: { id?: string }) {
  const q = usePropostaDetalhe(id);
  const { hasAnyRole } = useAuth();
  // Observações internas e histórico da antiga são de uso interno — nunca do cliente.
  const podeVerInterno = hasAnyRole(["admin", "diretor", "gerente", "vendedor"]);
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
              Proposta {formatPropostaNumero(p['numero']) || "—"}
              {numeroAnterior(p) && (
                <span className="ml-2 normal-case tracking-normal text-muted-foreground font-normal">
                  nº anterior {numeroAnterior(p)}
                </span>
              )}
              {ehPlataformaAntiga(p) && (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-muted-foreground">
                  Plataforma antiga
                </span>
              )}
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
          {numeroAnterior(p) ? <Campo label="Nº anterior" value={numeroAnterior(p)} /> : null}
          {p['projeto_antigo_id'] ? (
            <Campo label="Projeto (plataforma antiga)" value={String(p['projeto_antigo_id'])} />
          ) : null}
        </div>

        {podeVerInterno && p['observacoes_internas'] ? (
          <div className="rounded-xl bg-muted/40 p-3 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              Observações internas
            </div>
            <p className="whitespace-pre-wrap">{String(p['observacoes_internas'])}</p>
          </div>
        ) : null}

        <PropostaPdfAcoes proposta={p} />
      </div>

      {podeVerInterno && ehPlataformaAntiga(p) ? <LegadoCard proposta={p} /> : null}

      <div className="glass rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">

          Andamento do pedido
        </h3>
        <PropostaTimeline status={status} proposta={p} />
      </div>

      <NfDocumentosCard proposta={p} />

      <BoletosSharepointCard
        propostaId={String(p['id'])}
        formaPagamento={p['forma_pagamento']}
        nfNumero={p['nf_numero']}
        boletos={Array.isArray(p['boletos']) ? p['boletos'] : []}
        avisadoEm={p['boletos_avisados_em']}
      />

      {(p['pagamento_linha_digitavel'] ||
        p['pagamento_pix_copia_cola'] ||
        p['pagamento_status'] ||
        p['forma_pagamento'] === 'pix' ||
        p['forma_pagamento'] === 'boleto_vista') && (
        <div className="glass rounded-2xl p-5">
          <CobrancaCard
            cobranca={{
              numeroPedido: p['numero'] ? String(p['numero']) : null,
              clienteNome: p['cliente_nome'],
              clienteDoc: p['cliente_doc'],
              forma: p['forma_pagamento'],
              meio: p['pagamento_meio'],
              status: p['pagamento_status'],
              valor: Number(p['pagamento_valor'] ?? 0) || null,
              vencimento: p['pagamento_vencimento'],
              linhaDigitavel: p['pagamento_linha_digitavel'],
              codigoBarras: p['pagamento_codigo_barras'],
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
  const dq = usePropostaDetalhe(id);
  // Proposta importada que já virou pedido no SAP não é reeditada (evita
  // recalcular preços de algo já faturado). Sem OV, o orçamento é retomável.
  const somenteLeitura = bloqueiaReenvioSap(dq.data as Record<string, any> | null | undefined);
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
              {id && !somenteLeitura && (
                <Button size="sm" className="gap-2" asChild>
                  <Link to="/carregadores/propostas/nova" search={{ id }}>
                    <Pencil className="h-4 w-4" /> Editar
                  </Link>
                </Button>
              )}
              {id && somenteLeitura && (
                <span
                  className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                  title="Pedido importado da plataforma antiga já faturado no SAP — mantido como histórico."
                >
                  Somente leitura
                </span>
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

/** Prévia e impressão da proposta em PDF (Solar e Carregadores). */
function PropostaPdfAcoes({ proposta }: { proposta: Record<string, any> }) {
  const [previa, setPrevia] = useState<string | null>(null);

  const gerar = () => {
    try {
      return propostaPdfDaLinha(proposta);
    } catch {
      toast.error("Não foi possível montar a proposta em PDF.");
      return null;
    }
  };

  const abrirPrevia = () => {
    const r = gerar();
    if (r) setPrevia(r.html);
  };

  const imprimir = () => {
    const r = gerar();
    if (!r) return;
    const w = window.open("", "_blank");
    if (!w) return toast.error("Permita pop-ups para gerar o PDF.");
    w.document.write(r.html);
    w.document.title = r.fileName;
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button variant="outline" size="sm" className="gap-2" onClick={abrirPrevia}>
          <FileText className="h-4 w-4" /> Prévia da proposta
        </Button>
        <Button size="sm" className="gap-2" onClick={imprimir}>
          <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
        </Button>
      </div>

      <Dialog open={!!previa} onOpenChange={(o) => !o && setPrevia(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-5xl h-[92dvh] max-h-[92dvh] flex flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 border-b px-4 py-3 text-left sm:px-6">
            <DialogTitle className="flex flex-wrap items-center justify-between gap-2">
              <span>Prévia da proposta</span>
              <Button size="sm" className="gap-2" onClick={imprimir}>
                <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 bg-muted/40">
            <iframe title="Prévia da proposta" srcDoc={previa ?? ""} className="h-full w-full border-0 bg-white" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


/** Histórico e detalhes técnicos herdados da plataforma antiga. */
function LegadoCard({ proposta }: { proposta: Record<string, any> }) {
  const legado = dadosLegado(proposta);
  const pagamentos = pagamentosLegado(proposta);
  const anterior = numeroAnterior(proposta);
  const projeto = proposta['projeto_antigo_id'];
  if (!legado && !pagamentos.length && !anterior && !projeto) return null;

  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Dados da plataforma antiga
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        {anterior ? <Campo label="Nº anterior" value={anterior} /> : null}
        {projeto ? <Campo label="Projeto de origem" value={String(projeto)} /> : null}
        <Campo label="Nº do pedido (SAP)" value={formatSapNumero(proposta['sap_ov_numero'] || proposta['numero_sap']) || "—"} />
      </div>

      {pagamentos.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Histórico de cobranças
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Descrição</th>
                  <th className="px-3 py-2 text-left font-semibold">Documento</th>
                  <th className="px-3 py-2 text-left font-semibold">Data</th>
                  <th className="px-3 py-2 text-left font-semibold">Situação</th>
                  <th className="px-3 py-2 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody>
                {pagamentos.map((pg, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-3 py-2">{pg.descricao || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{pg.documento || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{pg.data ? fmtData(pg.data) : "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{pg.status || "—"}</td>
                    <td className="px-3 py-2 text-right">{pg.valor != null ? fmtBRL(pg.valor) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {legado ? (
        <details className="rounded-xl bg-muted/30 p-3 text-xs">
          <summary className="cursor-pointer font-semibold text-muted-foreground">
            Dados técnicos importados
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">
            {JSON.stringify(legado, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
